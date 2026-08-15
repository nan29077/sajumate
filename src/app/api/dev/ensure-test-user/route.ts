import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const TEST_EMAIL = "customer1@example.com";
const TEST_PASSWORD = "password123";

// 개발 전용 — 테스트 고객 계정을 upsert (비밀번호도 항상 올바르게 보장)
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "개발 환경에서만 사용 가능합니다." }, { status: 403 });
  }

  try {
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    // select: { id: true } — 스키마 드리프트(미반영 컬럼) 방지용; 전체 컬럼 SELECT 생략
    // role: "BUYER" — 운영 DB enum에 CUSTOMER가 없을 수 있음.
    //   normalizeRole이 BUYER → CUSTOMER 로 변환하므로 로그인 세션에는 CUSTOMER로 노출됨.
    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: {
        password: hashedPassword,
        isActive: true,
      },
      create: {
        email: TEST_EMAIL,
        name: "테스트고객",
        password: hashedPassword,
        role: "BUYER",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ensure-test-user] 오류:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
