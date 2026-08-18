import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/aligo";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// 아이디(이메일) 일부를 가려서 반환한다. 예) abcdef@gmail.com → abc***@gmail.com
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

// 아이디 찾기 — 이름 + 전화번호로 CUSTOMER 계정 조회
// 상담사/관리자 계정은 보안상 고객센터를 통해서만 안내한다.
export async function POST(request: NextRequest) {
  try {
    const { name, phone } = await request.json();

    const trimmedName = String(name || "").trim();
    const normalizedPhone = normalizePhone(phone);

    if (!trimmedName || !normalizedPhone) {
      return NextResponse.json(
        { error: "이름과 전화번호를 정확히 입력해주세요." },
        { status: 400 },
      );
    }

    // 레이트리밋 — 같은 IP 또는 같은 전화번호로 분당 5회 제한 (무차별 대입 방지)
    const ip = getClientIp(request);
    if (
      !checkRateLimit(`find-id:ip:${ip}`) ||
      !checkRateLimit(`find-id:phone:${normalizedPhone}`)
    ) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    // 이름이 일치하는 계정들 중 전화번호(숫자만)까지 일치하는 계정을 찾는다.
    // phone 은 저장 형식이 제각각일 수 있어 정규화 후 비교한다.
    const candidates = await prisma.user.findMany({
      where: { name: trimmedName },
      select: { email: true, phone: true, role: true, password: true },
    });

    const matched = candidates.filter(
      (u) => normalizePhone(u.phone) === normalizedPhone,
    );

    if (matched.length === 0) {
      return NextResponse.json(
        { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 상담사/관리자 계정만 있는 경우 고객센터 안내
    const buyers = matched.filter((u) => u.role === "CUSTOMER");
    if (buyers.length === 0) {
      return NextResponse.json(
        {
          error:
            "상담사 계정은 보안을 위해 고객센터를 통해서만 아이디 찾기가 가능합니다.",
          isSeller: true,
        },
        { status: 403 },
      );
    }

    // 소셜 로그인 전용(placeholder) 계정은 제외하고, 실제 이메일 계정을 우선 반환
    const emails = buyers
      .map((u) => u.email)
      .filter((e) => !e.endsWith("@no-email.local"))
      .map(maskEmail);

    if (emails.length === 0) {
      return NextResponse.json(
        {
          error:
            "소셜 로그인으로 가입된 계정입니다. 카카오/네이버/구글 로그인을 이용해주세요.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ emails });
  } catch (error) {
    console.error("[find-id] error", error);
    return NextResponse.json(
      { error: "아이디 찾기 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
