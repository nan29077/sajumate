import { Icon } from "@/components/shared/Icon";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SellerShopBottomNav from "@/components/shared/SellerShopBottomNav";
import ShopLogoutButton from "@/components/shop/ShopLogoutButton";
import { auth } from "@/lib/auth";
import { pickBuyerAvatar, resolveShopBanner } from "@/lib/defaults";
import { safeQuery } from "@/lib/safeDb";
import ConsultDetailSheet from "@/components/shop/ConsultDetailSheet";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

export default async function ShopMyPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await Promise.resolve(params);

  // 상담사 존재 확인
  const seller = await prisma.sellerProfile.findUnique({
    where: { slug },
    select: { id: true, slug: true, shopName: true, shopBanner: true, isApproved: true, user: { select: { name: true } } },
  });
  if (!seller || !seller.isApproved) notFound();

  // 점집 홈 상단 배너와 동일한 이미지를 마이페이지 헤더 배경으로 사용(통일)
  const banner = resolveShopBanner(seller.shopBanner, seller.id);

  // 인증 확인 (비로그인 → 점집 로그인 페이지로)
  const session = await auth();
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/shop/${slug}/my`)}`);
  }

  const userId = session.user.id!;

  // 사용자 정보 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, avatar: true, gender: true },
  });
  if (!user) redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/shop/${slug}/my`)}`);

  const consultantName = seller.user.name || seller.shopName;

  // ── 이 점집에서의 최근 예약 (상담 내역 목록용) ────────────────
  const rawShopReservations = await safeQuery(
    "shop my page reservations",
    () =>
      prisma.reservation.findMany({
        where: { userId, sellerId: seller.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          reservationDate: true,
          reservationTime: true,
          createdAt: true,
          items: { take: 1, select: { productName: true } },
        },
      }),
    [] as {
      id: string; status: string; reservationDate: Date; reservationTime: string;
      createdAt: Date; items: { productName: string }[];
    }[],
  );
  const shopReservations = rawShopReservations.map(({ items, ...r }) => ({
    ...r,
    product: items[0] ? { name: items[0].productName } : null,
  }));

  // ── 예약 상태별 집계 (정확한 총계) ──────────────────────────
  const statusGroups = await safeQuery(
    "shop my page status counts",
    () =>
      prisma.reservation.groupBy({
        by: ["status"],
        where: { userId, sellerId: seller.id },
        _count: { _all: true },
      }),
    [] as { status: string; _count: { _all: number } }[],
  );
  const countOf = (keys: string[]) =>
    statusGroups.filter((g) => keys.includes(g.status)).reduce((s, g) => s + g._count._all, 0);
  const totalReservations = statusGroups.reduce((s, g) => s + g._count._all, 0);
  const pendingCount = countOf(["PENDING"]);
  const confirmedCount = countOf(["CONFIRMED"]);
  const completedCount = countOf(["COMPLETED"]);

  // ── 다가오는 예약 (진행 중 & 오늘 이후, 가장 가까운 1건) ───────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = await safeQuery(
    "shop my page upcoming reservation",
    () =>
      prisma.reservation.findFirst({
        where: {
          userId,
          sellerId: seller.id,
          status: { in: ["PENDING", "CONFIRMED"] },
          reservationDate: { gte: todayStart },
        },
        orderBy: [{ reservationDate: "asc" }, { reservationTime: "asc" }],
        select: {
          id: true, status: true, reservationDate: true, reservationTime: true,
          items: { take: 1, select: { productName: true } },
        },
      }),
    null as null | {
      id: string; status: string; reservationDate: Date; reservationTime: string;
      items: { productName: string }[];
    },
  );

  // ── 단골(멤버십) 여부 ──────────────────────────────────────
  const membership = await safeQuery(
    "shop my page membership",
    () => prisma.shopMembership.findFirst({ where: { shopId: seller.id, userId }, select: { joinedAt: true } }),
    null as null | { joinedAt: Date },
  );
  const memberDays = membership
    ? Math.max(1, Math.floor((todayStart.getTime() - new Date(membership.joinedAt).setHours(0, 0, 0, 0)) / 86400000) + 1)
    : 0;

  // ── 안 읽은 알림 수 ───────────────────────────────────────
  const unreadCount = await safeQuery(
    "shop my page unread notifications",
    () => prisma.notification.count({ where: { userId, isRead: false } }),
    0,
  );

  // ── 이 점집에 남긴 리뷰 수 ─────────────────────────────────
  const shopReviewCount = await safeQuery(
    "shop my page review count",
    () => prisma.review.count({ where: { userId, product: { sellerId: seller.id } } }),
    0,
  );

  // ── AI 상담 요약 (기존 로직 유지) ──────────────────────────
  const participatedStreamIds = await safeQuery(
    "shop my page stream ids",
    async () => {
      const msgs = await prisma.liveChatMessage.findMany({
        where: { userId, liveStream: { sellerId: seller.id } },
        select: { liveStreamId: true },
        distinct: ["liveStreamId"],
      });
      return msgs.map((m: { liveStreamId: string }) => m.liveStreamId);
    },
    [] as string[],
  );

  const aiSummaries = participatedStreamIds.length > 0
    ? await safeQuery(
        "shop my page ai summaries",
        () =>
          prisma.liveChatMessage.findMany({
            where: { isBot: true, liveStream: { sellerId: seller.id }, liveStreamId: { in: participatedStreamIds } },
            include: { liveStream: { select: { title: true, startedAt: true, shareCode: true } } },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        [] as any[],
      )
    : [];

  const summaryByStream = new Map<string, (typeof aiSummaries)[number]>();
  for (const msg of aiSummaries) {
    if (!summaryByStream.has(msg.liveStreamId)) summaryByStream.set(msg.liveStreamId, msg);
  }
  const consultSummaries = [...summaryByStream.values()];

  const STATUS_STYLE: Record<string, string> = {
    PENDING: "bg-yellow-400/90 text-white",
    CONFIRMED: "bg-brand-500 text-white",
  };
  const STATUS_LABEL: Record<string, string> = {
    PENDING: "예약신청",
    CONFIRMED: "예약확정",
  };

  const quickMenu = [
    { href: `/shop/${slug}/book`, icon: "Calendar", label: "예약하기", tint: "bg-violet-50 text-violet-600", badge: 0 },
    { href: "/my/reservations", icon: "Receipt", label: "예약내역", tint: "bg-blue-50 text-blue-600", badge: 0 },
    { href: "/my/notifications", icon: "Notification", label: "알림", tint: "bg-rose-50 text-rose-500", badge: unreadCount },
    { href: "/my/wishlist", icon: "Wishlist", label: "찜", tint: "bg-pink-50 text-pink-500", badge: 0 },
  ];

  return (
    <div className="animate-fade-in pb-32">
      {/* 헤더 — 점집 홈 상단 배너 이미지와 통일 */}
      <div className="relative overflow-hidden bg-brand-950 px-4 pt-6 pb-12">
        <img src={banner} alt={`${seller.shopName} 배너`} className="absolute inset-0 h-full w-full scale-[1.01] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-950/45 via-brand-950/35 to-brand-950/75" />
        <div className="relative flex items-center gap-3">
          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40">
            <img src={user.avatar || pickBuyerAvatar(user.id, (user as any).gender)} alt={user.name ?? ""} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-lg font-bold text-white">{user.name}</h1>
              {membership && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-300/95 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  <Icon name="Certified" size={11} /> 단골
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-white/75">
              {seller.shopName}
              {membership ? ` · 단골 ${memberDays}일째` : " 방문 고객"}
            </p>
          </div>
          <Link href="/my/settings" className="rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white" aria-label="설정">
            <Icon name="Settings" size={20} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mx-4 -mt-6 mb-4 grid grid-cols-3 divide-x divide-gray-100 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="px-1 text-center">
          <p className="text-lg font-bold text-gray-900">{totalReservations}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">총 예약</p>
        </div>
        <div className="px-1 text-center">
          <p className="text-lg font-bold text-gray-900">{completedCount}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">상담 완료</p>
        </div>
        <Link href="/my/reviews" className="px-1 text-center">
          <p className="text-lg font-bold text-gray-900">{shopReviewCount}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">남긴 리뷰</p>
        </Link>
      </div>

      {/* 다가오는 예약 / 없으면 예약 유도 */}
      <div className="mb-4 px-4">
        {upcoming ? (
          <Link href={`/my/reservations/${upcoming.id}`} className="block overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-[0_12px_30px_rgba(56,35,105,0.18)] transition-transform active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/80"><Icon name="Clock" size={12} /> 다가오는 예약</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[upcoming.status] ?? "bg-white/20 text-white"}`}>{STATUS_LABEL[upcoming.status] ?? upcoming.status}</span>
            </div>
            <p className="mt-3 text-lg font-extrabold leading-snug">{upcoming.items[0]?.productName ?? "상담 예약"}</p>
            <div className="mt-1.5 flex items-center gap-3 text-[13px] text-white/90">
              <span className="inline-flex items-center gap-1"><Icon name="Calendar" size={13} /> {fmtDate(new Date(upcoming.reservationDate))}</span>
              <span className="inline-flex items-center gap-1"><Icon name="Clock" size={13} /> {upcoming.reservationTime}</span>
            </div>
            <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-white/90">예약 상세 보기 <Icon name="ArrowRight" size={13} /></div>
          </Link>
        ) : (
          <Link href={`/shop/${slug}/book`} className="flex items-center justify-between rounded-3xl border border-brand-100 bg-brand-50/60 p-5 transition-colors hover:bg-brand-50">
            <div>
              <p className="text-sm font-bold text-gray-900">예정된 예약이 없어요</p>
              <p className="mt-0.5 text-xs text-gray-500">{consultantName}님께 지금 상담을 예약해 보세요</p>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-600 px-3.5 py-2 text-xs font-bold text-white"><Icon name="Calendar" size={13} /> 예약하기</span>
          </Link>
        )}
      </div>

      {/* 예약 진행 현황 */}
      {(pendingCount > 0 || confirmedCount > 0 || completedCount > 0) && (
        <div className="mb-4 px-4">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
              <p className="text-base font-bold text-yellow-600">{pendingCount}</p>
              <p className="mt-0.5 text-[10px] text-gray-500">예약신청</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
              <p className="text-base font-bold text-brand-600">{confirmedCount}</p>
              <p className="mt-0.5 text-[10px] text-gray-500">예약확정</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
              <p className="text-base font-bold text-green-600">{completedCount}</p>
              <p className="mt-0.5 text-[10px] text-gray-500">상담완료</p>
            </div>
          </div>
        </div>
      )}

      {/* 빠른 메뉴 */}
      <div className="mb-4 px-4">
        <div className="grid grid-cols-4 gap-2.5">
          {quickMenu.map((m) => (
            <Link key={m.label} href={m.href} className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white py-3.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${m.tint}`}>
                <Icon name={m.icon} size={18} />
              </span>
              <span className="text-[11px] font-medium text-gray-700">{m.label}</span>
              {m.badge > 0 && (
                <span className="absolute right-2 top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {m.badge > 99 ? "99+" : m.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* 상담 내역 + 상세보기(AI 요약 포함) */}
      <div className="mb-4 px-4">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Icon name="File" size={14} className="text-violet-500" />
              {consultantName} 상담 내역
            </h2>
            {shopReservations.length > 0 && (
              <Link href="/my/reservations" className="text-xs text-violet-600 hover:underline">전체보기</Link>
            )}
          </div>
          <ConsultDetailSheet reservations={shopReservations as any} aiSummaries={consultSummaries as any} consultantName={consultantName} sellerSlug={slug} />
        </div>
      </div>

      {/* 계정 */}
      <div className="mb-4 px-4">
        <p className="mb-2 px-1 text-[11px] font-semibold text-gray-400">계정</p>
        <div className="space-y-2">
          <Link href="/my/settings" className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50"><Icon name="Settings" size={18} className="text-gray-500" /></span>
              <span className="text-sm font-medium text-gray-800">내 정보 · 설정</span>
            </span>
            <Icon name="ChevronDown" size={16} className="-rotate-90 text-gray-300" />
          </Link>
          <Link href="/support/faq" className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50"><Icon name="Help" size={18} className="text-gray-500" /></span>
              <span className="text-sm font-medium text-gray-800">고객센터 · 자주 묻는 질문</span>
            </span>
            <Icon name="ChevronDown" size={16} className="-rotate-90 text-gray-300" />
          </Link>
          <ShopLogoutButton sellerSlug={slug} />
        </div>
      </div>

      {/* 점집 하단 네비 */}
      <SellerShopBottomNav sellerSlug={slug} />
    </div>
  );
}
