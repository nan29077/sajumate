import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// 테스트 계정 생성 — SUPER_ADMIN 전용 1회성 유틸리티
// POST: 상담사 1개 + 고객 1개 계정 생성

export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const password = await bcrypt.hash("Test1234!", 10);
  const results: string[] = [];
  const errors: string[] = [];

  // 1. 상담사 계정
  const consultantEmail = "consultant@test.com";
  const existing1 = await prisma.user.findUnique({ where: { email: consultantEmail } });
  if (existing1) {
    errors.push(`상담사 계정 이미 존재: ${consultantEmail}`);
  } else {
    const consultant = await prisma.user.create({
      data: {
        email: consultantEmail,
        name: "테스트상담사",
        password,
        role: "CONSULTANT" as any,
        isActive: true,
        sellerProfile: {
          create: {
            slug: "test-consultant",
            shopName: "테스트 사주상담소",
            shopDescription: "테스트용 상담사 계정입니다.",
            category: "사주",
            isApproved: true,
            referralCode: "TEST001",
          },
        },
      },
    });
    results.push(`상담사 계정 생성: ${consultant.email} (비밀번호: Test1234!)`);
  }

  // 2. 고객 계정
  const customerEmail = "customer@test.com";
  const existing2 = await prisma.user.findUnique({ where: { email: customerEmail } });
  if (existing2) {
    errors.push(`고객 계정 이미 존재: ${customerEmail}`);
  } else {
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        name: "테스트고객",
        password,
        role: "CUSTOMER" as any,
        isActive: true,
      },
    });
    results.push(`고객 계정 생성: ${customer.email} (비밀번호: Test1234!)`);
  }

  return NextResponse.json({ results, errors });
}
