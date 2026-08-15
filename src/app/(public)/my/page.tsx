import { Icon } from '@/components/shared/Icon';
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { Calendar, Users, Star, Bell, CalendarX2 } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";
import MyPageBottomMenu from "@/components/shared/MyPageBottomMenu";
import { requireBuyerSession } from "@/lib/buyerGuard";
import { safeQuery } from "@/lib/safeDb";
import { pickSajuAvatar } from "@/lib/defaults";
import { isSellerLive, sellerProfileImage } from "@/lib/sellerLive";
import { LIVE_RING_CLASS, OnAirBadge } from "@/components/shared/LiveBadge";

export const dynamic = "force-dynamic";

const RESERVATION_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "예약신청", color: "bg-yellow-50 text-yellow-700" },
  CONFIRMED: { label: "예약확정", color: "bg-blue-50 text-blue-600" },
  COMPLETED: { label: "상담완료", color: "bg-green-50 text-green-600" },
  CANCELLED: { label: "취소됨", color: "bg-red-50 text-red-600" },
  NO_SHOW: { label: "노쇼", color: "bg-gray-100 text-gray-500" },
};

export default async function MyPage() {
  // 비로그인 → 로그인, 비고객 → 역할 대시보드로 즉시 리다이렉트 (데이터 조회/렌더 이전)
  const session = await requireBuyerSession();

  const user = await prisma.user.findUnique({
    where: { id: session.user!.id },
    include: {
      buyerProfile: {
        include: {
          follows: {
            include: {
              seller: {
                select: {
                  id: true, shopName: true, slug: true, shopLogo: true, pickDiscountRate: true, isManualLive: true,
                  user: { select: { avatar: true, name: true } },
                  liveStreams: { where: { status: "LIVE" }, take: 1, select: { id: true, shareCode: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!user) redirect("/auth/login");

  // 예약 조회는 운영 DB에 reservations 테이블이 아직 없을 수 있어(P2021)
  // 메인 include에서 분리해 safeQuery 폴백으로 감싼다. 통합 조회 시 페이지 전체가 500.
  const [reservations, reservationCount, completedCount] = await Promise.all([
    safeQuery(
      "my page reservations",
      () =>
        prisma.reservation.findMany({
          where: { userId: session.user!.id },
          include: { seller: { select: { shopName: true } }, items: { select: { productName: true } } },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      [],
    ),
    safeQuery("my page reservation count", () => prisma.reservation.count({ where: { userId: session.user!.id } }), 0),
    safeQuery(
      "my page completed count",
      () => prisma.reservation.count({ where: { userId: session.user!.id, status: "COMPLETED" } }),
      0,
    ),
  ]);

  const pickedSellers = user.buyerProfile?.follows || [];

  const menuItems = [
    { href: "/my/reservations", icon: Calendar, label: "예약 내역", count: reservationCount, color: "bg-blue-50", iconColor: "text-blue-500" },
    { href: "/my/seller", icon: Users, label: "내 단골 상담사", count: pickedSellers.length, color: "bg-pink-50", iconColor: "text-pink-500", small: true },
    { href: "/my/reviews", icon: Star, label: "상담 리뷰", count: user._count.reviews, color: "bg-yellow-50", iconColor: "text-yellow-500" },
    { href: "/my/notifications", icon: Bell, label: "알림", count: 0, color: "bg-purple-50", iconColor: "text-purple-500" },
  ];

  return (
    <div className="animate-fade-in pb-4">
      {/* 프로필 카드 (브랜드 컬러) */}
      <div className="bg-brand-500 px-4 pt-6 pb-10">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-black/10 flex items-center justify-center text-gray-900 text-xl font-bold overflow-hidden">
            <img
              src={user.avatar || pickSajuAvatar(user.id)}
              alt={user.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">{user.name}</h1>
            {/* OAuth 이메일 미동의 시 placeholder(@no-email.local)는 숨김 */}
            {user.email && !user.email.endsWith("@no-email.local") && (
              <p className="text-xs text-gray-800/70">{user.email}</p>
            )}
          </div>
          <Link href="/my/settings" className="p-2 text-gray-700 hover:text-gray-900">
            <Icon name="Settings" size={20} strokeWidth={1.5} />
          </Link>
        </div>

      </div>

      {/* 예약/상담 요약 카드 */}
      <div className="mx-4 -mt-6 bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          <Link href="/my/reservations" className="text-center py-1">
            <p className="text-lg font-bold text-gray-900">{reservationCount}</p>
            <p className="text-[10px] text-gray-400">예약</p>
          </Link>
          <Link href="/my/reservations?status=COMPLETED" className="text-center py-1">
            <p className="text-lg font-bold text-gray-900">{completedCount}</p>
            <p className="text-[10px] text-gray-400">완료 상담</p>
          </Link>
          <Link href="/my/reviews" className="text-center py-1">
            <p className="text-lg font-bold text-gray-900">{user._count.reviews}</p>
            <p className="text-[10px] text-gray-400">리뷰</p>
          </Link>
          <Link href="/my/seller" className="text-center py-1">
            <p className="text-lg font-bold text-brand-600">{pickedSellers.length}</p>
            <p className="text-[10px] text-gray-400">단골</p>
          </Link>
        </div>
      </div>

      {/* 내 단골 상담사 미리보기 */}
      {pickedSellers.length > 0 && (
        <div className="px-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Users size={14} strokeWidth={1.5} className="text-pink-500" />
                내 단골 상담사
              </h2>
              <Link href="/my/seller" className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">
                전체보기 ({pickedSellers.length})
                <Icon name="ChevronDown" size={12} className="-rotate-90" />
              </Link>
            </div>
            <div className="px-4 pb-3">
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {pickedSellers.slice(0, 8).map(({ seller }) => {
                  const live = isSellerLive(seller);
                  const liveHref = live && seller.liveStreams[0]?.shareCode
                    ? `/live/${seller.liveStreams[0].shareCode}`
                    : `/shop/${seller.slug}`;
                  return (
                  <Link key={seller.id} href={liveHref} className="flex flex-col items-center flex-shrink-0 w-auto group">
                    <div className="flex flex-col items-center gap-1 mb-1">
                      <div className={`w-14 h-14 rounded-full overflow-hidden bg-gray-100 ${live ? LIVE_RING_CLASS : "ring-2 ring-gray-100"}`}>
                        <SafeImage
                          src={sellerProfileImage(seller)}
                          placeholder={pickSajuAvatar(seller.id)}
                          alt={seller.shopName}
                          width={56}
                          height={56}
                          fallbackText={seller.shopName.charAt(0)}
                        />
                      </div>
                      {live && <OnAirBadge />}
                    </div>
                    <p className="text-[10px] font-medium text-gray-700 truncate max-w-[5rem]">{seller.user.name}</p>
                  </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메뉴 그리드 */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-4 gap-2">
          {menuItems.map((item) => {
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-gray-100 hover:border-brand-200 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center`}>
                  <ItemIcon size={20} strokeWidth={1.5} className={item.iconColor} />
                </div>
                <div className="text-center">
                  <p className={`${item.small ? "text-[10px]" : "text-[11px]"} font-medium text-gray-800 leading-tight`}>{item.label}</p>
                  {item.count > 0 && (
                    <p className="text-[10px] text-brand-600 font-bold">{item.count}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 최근 예약 */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-bold text-gray-900">최근 예약</h2>
            <Link href="/my/reservations" className="text-xs text-brand-600 hover:underline">
              전체보기
            </Link>
          </div>
          {reservations.length > 0 ? (
            <div className="px-4 pb-3">
              {reservations.map((r) => {
                const st = RESERVATION_STATUS[r.status] || { label: r.status, color: "bg-gray-50 text-gray-600" };
                const d = new Date(r.reservationDate);
                return (
                  <Link
                    key={r.id}
                    href={`/my/reservations/${r.id}`}
                    className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-[15px] font-bold text-gray-900 truncate">
                        {r.items[0]?.productName || "상담 예약"}
                        {r.items.length > 1 && (
                          <span className="text-[11px] font-normal text-gray-400"> 외 {r.items.length - 1}건</span>
                        )}
                      </p>
                      <p className="text-[12px] font-semibold text-gray-700 mt-0.5">{r.seller.shopName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {d.getUTCFullYear()}.{d.getUTCMonth() + 1}.{d.getUTCDate()} {r.reservationTime} · 예약 {r.reservationNumber}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold">{formatPrice(Number(r.finalAmount))}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 px-4">
              <CalendarX2 size={36} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">아직 상담 예약이 없습니다.</p>
              <Link
                href="/sellers"
                className="mt-3 inline-block px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800"
              >
                상담사 찾기
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 하단 메뉴 */}
      <MyPageBottomMenu />
    </div>
  );
}
