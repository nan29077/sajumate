import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 셀러브릭스 레거시 데이터 현황 진단 — SUPER_ADMIN 전용.
// GET: 현황 조회 (읽기 전용, 안전)
// DELETE: 실제 삭제 (주의: 운영 DB 영구 삭제)

const LEGACY_ROLES = ["SELLER", "BUYER", "NODE", "MIDDLE_ADMIN", "BRAND_ADMIN"] as const;

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 레거시 역할별 사용자 수
  const roleCounts = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });

  // 레거시 사용자 목록 (이름, 이메일, 역할)
  const legacyUsers = await prisma.user.findMany({
    where: { role: { in: LEGACY_ROLES as any } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      sellerProfile: { select: { id: true, shopName: true, isApproved: true } },
    },
    orderBy: { role: "asc" },
  });

  const totalByRole = Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]));

  return NextResponse.json({
    summary: {
      전체_사용자: roleCounts.reduce((s, r) => s + r._count._all, 0),
      역할별: totalByRole,
      레거시_삭제_대상: legacyUsers.length,
    },
    legacyUsers: legacyUsers.map((u) => ({
      role: u.role,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString().split("T")[0],
      sellerProfile: u.sellerProfile
        ? { shopName: u.sellerProfile.shopName, isApproved: u.sellerProfile.isApproved }
        : null,
    })),
  });
}

export async function DELETE() {
  const session = await auth();
  if ((session?.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 레거시 사용자 삭제 (User 삭제 시 onDelete:Cascade 로 연관 데이터 자동 삭제)
  const deleted = await prisma.user.deleteMany({
    where: { role: { in: LEGACY_ROLES as any } },
  });

  return NextResponse.json({
    deleted: deleted.count,
    message: `${deleted.count}명의 셀러브릭스 레거시 사용자 및 연관 데이터 삭제 완료`,
  });
}
