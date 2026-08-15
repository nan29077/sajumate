import { NextResponse, NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  isValidSellerSlug,
  linkReferralForNewBuyer,
} from "@/lib/referral";
import { randomAvatar, randomSajuAvatar, pickRoleAvatar } from "@/lib/defaults";
import { getRegisterFieldSettings } from "@/lib/settings";
import { notifySignupWelcome } from "@/lib/alimtalkTriggers";

export async function POST(request: NextRequest) {
  try {
    const {
      name, email, password, role, gender, birthday, phone,
      zipCode, address1, address2,
      sellerRef: sellerRefFromBody,
    } = await request.json();

    // 상담사 귀속은 URL ?ref= 에서 전달된 body 값만 신뢰한다.
    const sellerRef: string | null =
      typeof sellerRefFromBody === "string" && isValidSellerSlug(sellerRefFromBody)
        ? sellerRefFromBody
        : null;

    // 회원가입 항목 권한 설정(필수/선택/숨김)
    const fieldSettings = await getRegisterFieldSettings();

    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    const emailTrimmed = typeof email === "string" ? email.trim() : "";
    const phoneDigits = typeof phone === "string" ? phone.replace(/[^0-9]/g, "") : "";
    const address1Trimmed = typeof address1 === "string" ? address1.trim() : "";
    if (!nameTrimmed) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    if (!emailTrimmed) return NextResponse.json({ error: "이메일을 입력해주세요." }, { status: 400 });
    if (typeof password !== "string" || !password) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
    if (fieldSettings.phone === "required" && !phoneDigits) return NextResponse.json({ error: "휴대전화번호를 입력해주세요." }, { status: 400 });
    if (fieldSettings.gender === "required" && gender !== "male" && gender !== "female") return NextResponse.json({ error: "성별을 선택해주세요." }, { status: 400 });
    if (fieldSettings.birthday === "required" && (typeof birthday !== "string" || !birthday.trim())) return NextResponse.json({ error: "생년월일을 입력해주세요." }, { status: 400 });
    if (fieldSettings.address === "required" && !address1Trimmed) return NextResponse.json({ error: "주소를 입력해주세요." }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email: emailTrimmed } });
    if (existing) return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 400 });

    const hashedPassword = await bcrypt.hash(password, 12);
    const userRole = role === "CONSULTANT" ? "CONSULTANT" : "CUSTOMER";

    const genderPick = gender === "male" || gender === "female"
      ? gender
      : Math.random() < 0.5 ? "male" : "female";
    const phoneNormalized = typeof phone === "string" && phone.trim() ? phone.replace(/[^0-9]/g, "") : null;
    const birthdayValue = typeof birthday === "string" && birthday.trim() ? birthday.trim() : null;
    const zipCodeValue = typeof zipCode === "string" && zipCode.trim() ? zipCode.trim() : null;
    const address1Value = address1Trimmed || null;
    const address2Value = typeof address2 === "string" && address2.trim() ? address2.trim() : null;

    // 1) User 생성
    const user = await (prisma as any).user.create({
      data: {
        name: nameTrimmed,
        email: emailTrimmed,
        password: hashedPassword,
        role: userRole,
        isActive: true,
        gender: genderPick,
        phone: phoneNormalized,
        birthday: birthdayValue,
        zipCode: zipCodeValue,
        address1: address1Value,
        address2: address2Value,
        avatar: userRole === "CONSULTANT"
          ? pickRoleAvatar(emailTrimmed, "CONSULTANT")
          : sellerRef
            ? randomAvatar(genderPick)
            : randomSajuAvatar(),
        ...(userRole === "CONSULTANT" && {
          sellerProfile: {
            create: {
              slug: emailTrimmed.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-"),
              shopName: `${nameTrimmed}의 점집`,
              isApproved: false,
            },
          },
        }),
      },
    });

    // 2) CUSTOMER 일 때만 고객 추천인 매핑
    if (userRole === "CUSTOMER") {
      await linkReferralForNewBuyer(prisma, {
        userId: user.id,
        sellerRef,
        referralCode: null,
      });
      // 회원가입 환영 알림톡 — 카카오 승인 조건상 가입 즉시 1회만. 실패해도 가입 흐름에 영향 없음.
      await notifySignupWelcome({ name: nameTrimmed, phone: phoneNormalized, sellerRef }).catch((e) =>
        console.error("[register] 환영 알림톡 오류:", e),
      );
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      role: userRole,
      message: userRole === "CONSULTANT"
        ? "상담사 가입이 완료되었습니다. 관리자 승인 후 서비스를 이용할 수 있습니다."
        : "회원가입이 완료되었습니다. 바로 로그인하실 수 있습니다.",
      needsApproval: userRole === "CONSULTANT",
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
