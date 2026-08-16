import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 미승인 상담사 전체 일괄 승인 — SUPER_ADMIN 전용 1회성 유틸리티.
// 사용 후 삭제 예정.
export async function POST() {
  const session = await auth();
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const pending = await prisma.sellerProfile.findMany({
    where: { isApproved: false },
    include: { user: { select: { name: true, email: true, role: true } } },
  });

  const result = await prisma.sellerProfile.updateMany({
    where: { isApproved: false },
    data: { isApproved: true },
  });

  return NextResponse.json({
    approved: result.count,
    names: pending.map((s) => `${s.user.name} / ${s.shopName}`),
  });
}
