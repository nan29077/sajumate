import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { normalizePhone, sendSms } from "@/lib/aligo";
import { logAligoSend } from "@/lib/aligoLog";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// 혼동되기 쉬운 문자(0/O, 1/l/I 등)를 제외한 임시 비밀번호 문자셋
const TEMP_PW_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateTempPassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PW_CHARS[bytes[i] % TEMP_PW_CHARS.length];
  }
  return out;
}

// 비밀번호 초기화 — 아이디(이메일) + 이름 + 전화번호 확인 후
// 임시 비밀번호를 문자로 발송하고 로그인 직후 강제 재설정 플래그를 설정한다.
export async function POST(request: NextRequest) {
  try {
    const { email, name, phone } = await request.json();

    const trimmedEmail = String(email || "").trim().toLowerCase();
    const trimmedName = String(name || "").trim();
    const normalizedPhone = normalizePhone(phone);

    if (!trimmedEmail || !trimmedName || !normalizedPhone) {
      return NextResponse.json(
        { error: "아이디(이메일), 이름, 전화번호를 모두 입력해주세요." },
        { status: 400 },
      );
    }

    // 레이트리밋 — 같은 IP 또는 같은 전화번호로 분당 5회 제한 (무차별 대입·SMS 폭탄 방지)
    const ip = getClientIp(request);
    if (
      !checkRateLimit(`forgot-password:ip:${ip}`) ||
      !checkRateLimit(`forgot-password:phone:${normalizedPhone}`)
    ) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
      select: { id: true, name: true, phone: true, role: true, password: true },
    });

    // 이름·전화번호까지 모두 일치하지 않으면 동일한 실패 응답 (어떤 필드가 틀렸는지 노출 안 함)
    if (
      !user ||
      user.name !== trimmedName ||
      normalizePhone(user.phone) !== normalizedPhone
    ) {
      return NextResponse.json(
        { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 상담사/관리자 계정은 고객센터 안내
    if (user.role !== "CUSTOMER") {
      return NextResponse.json(
        {
          error:
            "상담사 계정은 보안을 위해 고객센터를 통해서만 비밀번호 찾기가 가능합니다.",
          isSeller: true,
        },
        { status: 403 },
      );
    }

    // 소셜 로그인 전용 계정(비밀번호 없음)은 초기화 대상이 아님
    if (!user.password) {
      return NextResponse.json(
        {
          error:
            "소셜 로그인으로 가입된 계정입니다. 카카오/네이버/구글 로그인을 이용해주세요.",
        },
        { status: 400 },
      );
    }

    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    const message = `[사주메이트] 임시 비밀번호는 [${tempPassword}] 입니다. 로그인 후 반드시 새 비밀번호로 변경해주세요.`;
    const sms = await sendSms({
      receiver: normalizedPhone,
      message,
      title: "사주메이트 임시 비밀번호",
    });

    await logAligoSend({
      kind: "SMS",
      purpose: "PASSWORD_RESET",
      recipientCount: 1,
      acceptedCount: sms.ok ? 1 : 0,
      failCount: sms.ok ? 0 : 1,
      mids: sms.mid ? [sms.mid] : undefined,
      errorMessage: sms.ok ? null : sms.error,
    });

    if (!sms.ok) {
      console.error("[forgot-password] SMS 발송 실패", sms.error);
      return NextResponse.json(
        { error: "임시 비밀번호 문자 발송에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 502 },
      );
    }

    // 문자 발송 성공 후에만 비밀번호를 교체하고 강제 재설정 플래그를 설정
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, mustResetPassword: true },
    });

    // 발송된 번호를 일부 가려서 안내
    const masked = normalizedPhone.replace(/^(\d{3})(\d+)(\d{4})$/, "$1****$3");

    return NextResponse.json({
      success: true,
      phone: masked,
      message: "등록된 전화번호로 임시 비밀번호를 발송했습니다.",
    });
  } catch (error) {
    console.error("[forgot-password] error", error);
    return NextResponse.json(
      { error: "비밀번호 초기화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
