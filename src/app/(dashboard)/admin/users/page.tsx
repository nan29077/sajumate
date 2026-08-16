import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminUsersTabsClient from "@/components/admin/AdminUsersTabsClient";
import { getAdminSellers } from "@/lib/adminSellers";
import { safeQuery } from "@/lib/safeDb";
import { normalizeRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/");

  const [usersRaw, sellers, reservationCounts] = await Promise.all([
    prisma.user.findMany({
      where: {
        // 셀러브릭스 레거시 역할은 관리자 목록에서 제외 (DB 공유이므로 삭제 불가, 숨김 처리)
        role: { notIn: ["SELLER", "BUYER", "NODE", "MIDDLE_ADMIN", "BRAND_ADMIN"] as any },
      },
      include: {
        // reservations 는 운영 DB 미반영 가능성이 있어 _count 에서 제외하고 별도 집계
        _count: { select: { reviews: true } },
        sellerProfile: { select: { id: true, commissionRate: true } },
        accounts: { select: { provider: true } }, // 소셜 가입 제공자(카카오·네이버·구글) 판별용
      },
      orderBy: { createdAt: "desc" },
    }),
    getAdminSellers(),
    safeQuery(
      "admin users reservation counts",
      () => prisma.reservation.groupBy({ by: ["userId"], _count: { _all: true } }),
      [] as { userId: string; _count: { _all: number } }[],
    ),
  ]);
  const reservationCountMap = new Map(reservationCounts.map((r) => [r.userId, r._count._all]));

  const users = usersRaw.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    gender: u.gender,
    avatar: u.avatar,
    birthday: u.birthday,
    // DB 레거시 역할(SELLER/BUYER 등)을 현행 3역할로 정규화해 표시
    role: normalizeRole(u.role),
    isActive: u.isActive,
    reservationCount: reservationCountMap.get(u.id) ?? 0,
    reviewCount: u._count.reviews,
    createdAt: u.createdAt.toISOString(),
    sellerId: u.sellerProfile?.id ?? null,
    commissionRate: u.sellerProfile?.commissionRate != null ? Number(u.sellerProfile.commissionRate) : null,
    // 소셜 가입 제공자 목록(중복 제거). OAuth 계정이 없으면 이메일(비밀번호) 가입.
    authProviders: [...new Set(u.accounts.map((a) => a.provider))],
  }));

  return (
    <AdminUsersTabsClient
      users={users}
      sellers={sellers}
    />
  );
}
