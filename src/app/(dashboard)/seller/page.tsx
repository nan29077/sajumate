import { Icon } from '@/components/shared/Icon';
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Users,
  Video,
  Phone,
  MapPin,
  CalendarX2,
  Radio,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/settings";
import { safeQuery } from "@/lib/safeDb";
import { formatPrice } from "@/lib/utils";
import { isVideoMethod, CONSULTING_METHOD_FALLBACK } from "@/lib/consultingSession";
import ShopLinkButton from "@/components/shared/ShopLinkButton";
import SellerLiveCodeCard from "@/components/shared/SellerLiveCodeCard";
import DashboardReservationComplete from "@/components/seller/DashboardReservationComplete";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "예약 대기", color: "bg-yellow-50 text-yellow-700" },
  CONFIRMED: { label: "예약 확정", color: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "상담 완료", color: "bg-green-50 text-green-700" },
  CANCELLED: { label: "취소", color: "bg-gray-100 text-gray-500" },
  NO_SHOW: { label: "노쇼", color: "bg-red-50 text-red-600" },
};

/** 상담 방식 배지 (영상/전화/방문) */
function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const icon = isVideoMethod(method) ? (
    <Video size={10} strokeWidth={1.8} />
  ) : method === "전화" ? (
    <Phone size={10} strokeWidth={1.8} />
  ) : method === "방문" ? (
    <MapPin size={10} strokeWidth={1.8} />
  ) : null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
      {icon}
      {method}
    </span>
  );
}

export default async function SellerDashboard() {
  const { beeDecoration: SHOW_CELESTIAL_DECORATION, liveCommerce: LIVE_ON } = await getFeatureFlags();
  const session = await auth();
  if (!session) redirect("/auth/login");
  if (session.user?.role !== "CONSULTANT") redirect("/");

  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: session!.user!.id },
    include: {
      // reservations 는 운영 DB 미반영 가능성이 있어 _count 에서 제외하고 별도 safeQuery 로 센다
      _count: { select: { fans: true } },
    },
  });

  if (!seller) redirect("/");

  // 기간 경계 (오늘/이번주(월요일 시작)/이번달)
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7)); // 월요일 시작
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 오늘(한국 시간 기준) 날짜 문자열. 예약일/슬롯 날짜는 "YYYY-MM-DD"를 UTC 자정으로 저장하므로
  // 서버 타임존과 무관하게 KST 달력 날짜로 경계를 잡는다.
  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dayStartUtc = new Date(todayStr + "T00:00:00.000Z");
  const dayEndUtc = new Date(todayStr + "T23:59:59.999Z");

  const [todayReservationCount, monthCompletedCount, pendingCount, recentReservations, allReservations] =
    await Promise.all([
      safeQuery("seller dashboard todayReservationCount", () =>
        prisma.reservation.count({
          where: {
            sellerId: seller.id,
            reservationDate: { gte: dayStartUtc, lte: dayEndUtc },
            status: { not: "CANCELLED" },
          },
        }), 0),
      safeQuery("seller dashboard monthCompletedCount", () =>
        prisma.reservation.count({
          where: { sellerId: seller.id, status: "COMPLETED", completedAt: { gte: monthStart } },
        }), 0),
      safeQuery("seller dashboard pendingCount", () =>
        prisma.reservation.count({ where: { sellerId: seller.id, status: "PENDING" } }), 0),
      safeQuery("seller dashboard recentReservations", () =>
        prisma.reservation.findMany({
          where: { sellerId: seller.id },
          include: {
            user: { select: { name: true } },
            items: { select: { itemType: true, productId: true, productName: true } },
          },
          orderBy: [{ reservationDate: "desc" }, { reservationTime: "asc" }],
          take: 6,
        }), []),
      // 매출 집계용 (결제완료 기준)
      safeQuery("seller dashboard allReservations", () =>
        prisma.reservation.findMany({
          where: { sellerId: seller.id },
          select: { createdAt: true, paidAt: true, finalAmount: true, paymentStatus: true, status: true },
        }), []),
    ]);

  // ── 상담 방식(영상/전화/방문) 역조회 ───────────────────────────────
  // Reservation 에는 상담 방식이 없어 첫 아이템의 Product 에서 가져온다.
  // 명시적 select 는 전역 omit 을 우회해 P2022 가능 → safeQuery 폴백.
  const productIds = Array.from(
    new Set(
      recentReservations
        .map((r) => r.items[0])
        .filter((i) => i && i.itemType === "PRODUCT")
        .map((i) => i!.productId),
    ),
  );
  const products = productIds.length
    ? await safeQuery(
        "seller dashboard consulting methods",
        () =>
          prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, consultingMethod: true },
          }),
        [],
      )
    : [];
  const methodByProduct = new Map(products.map((p) => [p.id, p.consultingMethod || CONSULTING_METHOD_FALLBACK]));

  // ── 진행 중인 라이브 ────────────────────────────────────────────
  const liveStreams = LIVE_ON
    ? await safeQuery("seller dashboard liveStreams", () =>
        prisma.liveStream.findMany({
          where: { sellerId: seller.id, status: "LIVE" },
          select: { id: true, title: true, shareCode: true, viewerCount: true, startedAt: true },
          orderBy: { startedAt: "desc" },
        }), [])
    : [];

  // 매출 기간별 집계 (결제완료 · 취소/환불 제외)
  const isPaid = (o: { paymentStatus: string; status: string }) =>
    o.paymentStatus === "COMPLETED" && o.status !== "CANCELLED" && o.status !== "REFUNDED";
  let todaySales = 0, weekSales = 0, monthSales = 0, revenue = 0;
  for (const o of allReservations) {
    if (!isPaid(o)) continue;
    const amt = Number(o.finalAmount);
    const sale = o.paidAt ?? o.createdAt;
    revenue += amt;
    if (sale >= todayStart) todaySales += amt;
    if (sale >= weekStart) weekSales += amt;
    if (sale >= monthStart) monthSales += amt;
  }

  const formatResvDate = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-page-header flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="dashboard-icon-tile hidden sm:inline-flex"><Icon name="Moon" size={19} /></span>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-brand-950">상담사 대시보드</h1>
            <p className="text-xs text-gray-500 mt-0.5">{seller.shopName} · {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
          </div>
          {SHOW_CELESTIAL_DECORATION && <Sparkles size={40} strokeWidth={1.3}
            className="w-10 h-10 text-moon-500 opacity-70 pointer-events-none select-none hidden sm:block" aria-hidden="true" />}
        </div>
      </div>

      {/* My Shop URL */}
      <div className="bg-gradient-to-r from-brand-50 to-white rounded-2xl border border-brand-100 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-gray-500 mb-1">내 점집 주소</p>
            <p className="text-xs text-gray-700 font-mono truncate">/shop/{seller.slug}</p>
          </div>
          <ShopLinkButton slug={seller.slug} />
        </div>
      </div>

      {!seller.isApproved && (
        <div className="p-3.5 bg-moon-50 border border-moon-500/25 rounded-2xl text-xs text-moon-700 flex items-center gap-2">
          <Icon name="Clock" size={14} />
          상담사 승인 대기 중입니다. 관리자 승인 후 점집이 공개됩니다.
        </div>
      )}

      {/* 상단 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-2xl p-3.5 sm:p-4 text-white bg-gradient-to-br from-brand-600 to-brand-950 shadow-[0_14px_30px_rgba(36,20,69,0.16)]">
          <CalendarCheck size={16} strokeWidth={1.5} className="text-white/50 mb-1.5" />
          <p className="text-xl sm:text-2xl font-bold">{todayReservationCount}<span className="text-xs font-normal text-white/50 ml-0.5">건</span></p>
          <p className="text-white/50 text-[10px] mt-0.5">오늘 예약</p>
        </div>
        <div className="dashboard-stat">
          <CheckCircle2 size={16} strokeWidth={1.5} className="text-green-500 mb-1.5" />
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{monthCompletedCount}<span className="text-xs font-normal text-gray-300 ml-0.5">건</span></p>
          <p className="text-gray-400 text-[10px] mt-0.5">이번 달 완료 상담</p>
        </div>
        <Link href="/seller/reservations?status=PENDING" className="rounded-2xl border border-moon-500/25 bg-gradient-to-br from-moon-50 to-white p-3.5 sm:p-4 text-brand-950 hover:border-moon-500/40 transition-colors">
          <Clock size={16} strokeWidth={1.5} className="text-moon-700 mb-1.5" />
          <p className="text-xl sm:text-2xl font-bold">{pendingCount}<span className="text-xs font-normal text-gray-400 ml-0.5">건</span></p>
          <p className="text-moon-700 text-[10px] mt-0.5">대기 중 예약</p>
        </Link>
        <Link href="/seller/customers" className="dashboard-stat">
          <Users size={16} strokeWidth={1.5} className="text-brand-500 mb-1.5" />
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{seller._count.fans}<span className="text-xs font-normal text-gray-300 ml-0.5">명</span></p>
          <p className="text-gray-400 text-[10px] mt-0.5">총 단골 고객</p>
        </Link>
      </div>

      {/* 매출 (오늘 / 이번주 / 이번달 / 누적) */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">매출</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "오늘", value: todaySales },
            { label: "이번주", value: weekSales },
            { label: "이번달", value: monthSales },
            { label: "총 누적", value: revenue, accent: true },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-3.5 sm:p-4 ${s.accent ? "border border-moon-500/25 bg-gradient-to-br from-moon-50 to-white text-brand-950" : "dashboard-stat"}`}>
              <p className={`text-[9px] sm:text-[10px] font-medium mb-1 ${s.accent ? "text-moon-700" : "text-gray-400"}`}>{s.label}</p>
              <p className={`text-[13px] sm:text-base font-bold leading-tight break-all ${s.accent ? "text-brand-950" : "text-gray-900"}`}>{formatPrice(s.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 예약 현황 */}
      <div className="dashboard-panel">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-900">예약 현황</h2>
          <Link href="/seller/reservations" className="text-[11px] text-gray-400 hover:text-gray-600">전체보기 →</Link>
        </div>
        {recentReservations.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {recentReservations.map((r) => {
              const st = STATUS_LABELS[r.status] || { label: r.status, color: "bg-gray-50 text-gray-600" };
              const firstItem = r.items[0];
              const method =
                firstItem && firstItem.itemType === "PRODUCT"
                  ? methodByProduct.get(firstItem.productId) ?? null
                  : null;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[14px] font-bold text-gray-900 truncate">
                        {r.customerName || r.user.name}
                      </p>
                      <MethodBadge method={method} />
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {formatResvDate(r.reservationDate)} {r.reservationTime}
                      <span className="text-gray-300"> · </span>
                      {firstItem?.productName || "상담"}
                      {r.items.length > 1 && ` 외 ${r.items.length - 1}건`}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right space-y-1">
                    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    {(r.status === "PENDING" || r.status === "CONFIRMED") && (
                      <div><DashboardReservationComplete reservationId={r.id} /></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10">
            <CalendarX2 size={28} strokeWidth={1.3} className="mx-auto text-brand-200 mb-2" />
            <p className="text-xs text-gray-400">아직 예약이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 라이브 현황 */}
      {LIVE_ON && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">라이브 현황</h2>
            <Link href="/seller/live-mode" className="text-[11px] text-red-500 font-medium hover:underline">
              라이브 모드 열기 →
            </Link>
          </div>
          {liveStreams.length > 0 ? (
            <div className="space-y-2">
              {liveStreams.map((ls) => (
                <Link
                  key={ls.id}
                  href={`/live/${ls.shareCode}`}
                  className="flex items-center gap-3 p-3.5 bg-white rounded-xl border border-red-100 hover:border-red-200 transition-colors"
                >
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex-shrink-0">
                    <Radio size={10} strokeWidth={2} /> LIVE
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{ls.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      시청자 {ls.viewerCount}명
                      {ls.startedAt && ` · ${new Date(ls.startedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 시작`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="dashboard-panel p-4 text-center">
              <p className="text-xs text-gray-400">진행 중인 라이브가 없습니다.</p>
            </div>
          )}

          {/* 내 라이브 코드 + 공유 */}
          <SellerLiveCodeCard code={seller.slug} shopName={seller.shopName} />
        </div>
      )}

      {/* 빠른 링크 */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-3">빠른 링크</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {[
            { href: "/seller/reservations", label: "예약 관리", icon: "Calendar", desc: "확정·완료 처리" },
            { href: "/seller/timeslots", label: "예약 시간 설정", icon: "Clock", desc: "상담 가능 시간" },
            { href: "/seller/customers", label: "고객관리(CRM)", icon: "Users", desc: "상담 이력·메모" },
            { href: "/seller/shop", label: "점집 설정", icon: "Store", desc: "내 점집 관리" },
            { href: "/seller/members", label: "회원 관리", icon: "UserCheck", desc: "점집 회원" },
            { href: "/seller/settlements", label: "정산", icon: "Settlement", desc: "수익 정산·출금" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="dashboard-stat flex items-center gap-2.5 sm:gap-3 group"
            >
              <div className="dashboard-icon-tile">
                <Icon name={item.icon} size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 group-hover:text-gray-900 truncate">{item.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
