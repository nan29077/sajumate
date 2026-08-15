import { Icon } from '@/components/shared/Icon';
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/settings";
import { safeQuery } from "@/lib/safeDb";
import { formatPrice } from "@/lib/utils";
import { pickRoleAvatar, resolveAdminDashboardAvatar, resolveConsultantAvatar } from "@/lib/defaults";
import SafeImage from "@/components/shared/SafeImage";
import SeedDataButton from "@/components/admin/SeedDataButton";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const { beeDecoration: SHOW_CELESTIAL_DECORATION } = await getFeatureFlags();
  const session = await auth();
  if (!session) redirect("/auth/login");
  if (session.user?.role !== "SUPER_ADMIN") redirect("/");

  // 날짜 기준 계산 (KST UTC+9)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStartKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate(), 0, 0, 0, 0));
  const todayStartUTC = new Date(todayStartKST.getTime() - 9 * 60 * 60 * 1000);
  // 이번 주 월요일 00:00 KST
  const dayOfWeek = nowKST.getUTCDay(); // 0=일, 1=월 ... 6=토
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStartKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  const weekStartUTC = new Date(weekStartKST.getTime() - 9 * 60 * 60 * 1000);

  const COMPLETED_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

  const [
    userCount, sellerCount, productCount,
    reservationCount, totalRevenueAgg, pendingSellers, recentOrders,
    recentUsers, recentReviews, activeProductCount,
    todayOrders, todayUsers, pendingOrders,
    todayRevenueAgg, weekOrders, weekRevenueAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.sellerProfile.count(),
    prisma.product.count(),
    safeQuery("admin dashboard reservationCount", () => prisma.reservation.count(), 0),
    // 총매출: 실제 예약 finalAmount 합계 (취소/환불 제외)
    safeQuery("admin dashboard totalRevenue", () =>
      prisma.reservation.aggregate({
        _sum: { finalAmount: true },
        where: { status: { in: [...COMPLETED_STATUSES] } },
      }), { _sum: { finalAmount: null } }),
    prisma.sellerProfile.count({ where: { isApproved: false } }),
    safeQuery("admin dashboard recentOrders", () =>
      prisma.reservation.findMany({
        include: { user: true, seller: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }), []),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, createdAt: true, avatar: true, gender: true },
    }),
    prisma.review.findMany({
      include: {
        user: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.product.count({ where: { isActive: true, isApproved: true } }),
    // 오늘 예약 건수
    safeQuery("admin dashboard todayOrders", () =>
      prisma.reservation.count({
        where: { createdAt: { gte: todayStartUTC } },
      }), 0),
    prisma.user.count({
      where: { createdAt: { gte: todayStartUTC } },
    }),
    safeQuery("admin dashboard pendingOrders", () =>
      prisma.reservation.count({ where: { status: "PENDING" } }), 0),
    // 오늘 매출
    safeQuery("admin dashboard todayRevenue", () =>
      prisma.reservation.aggregate({
        _sum: { finalAmount: true },
        where: { createdAt: { gte: todayStartUTC }, status: { in: [...COMPLETED_STATUSES] } },
      }), { _sum: { finalAmount: null } }),
    // 이번 주 예약 건수
    safeQuery("admin dashboard weekOrders", () =>
      prisma.reservation.count({
        where: { createdAt: { gte: weekStartUTC } },
      }), 0),
    // 이번 주 매출
    safeQuery("admin dashboard weekRevenue", () =>
      prisma.reservation.aggregate({
        _sum: { finalAmount: true },
        where: { createdAt: { gte: weekStartUTC }, status: { in: [...COMPLETED_STATUSES] } },
      }), { _sum: { finalAmount: null } }),
  ]);

  const revenue = Number(totalRevenueAgg._sum.finalAmount || 0);
  const todayRevenue = Number(todayRevenueAgg._sum.finalAmount || 0);
  const weekRevenue = Number(weekRevenueAgg._sum.finalAmount || 0);

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "관리자", CONSULTANT: "상담사", CUSTOMER: "고객",
  };
  const roleColors: Record<string, string> = {
    SUPER_ADMIN: "bg-brand-950 text-white",
    CONSULTANT: "bg-brand-50 text-brand-700", CUSTOMER: "bg-gray-50 text-gray-600",
  };
  const statusLabels: Record<string, { label: string; color: string }> = {
    PENDING: { label: "대기", color: "bg-moon-50 text-moon-700" },
    CONFIRMED: { label: "확인", color: "bg-blue-50 text-blue-700" },
    SHIPPING: { label: "상담 진행중", color: "bg-indigo-50 text-indigo-700" },
    DELIVERED: { label: "완료", color: "bg-green-50 text-green-700" },
    CANCELLED: { label: "취소", color: "bg-red-50 text-red-700" },
  };

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-page-header flex flex-col min-[430px]:flex-row items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="dashboard-icon-tile hidden sm:inline-flex"><Icon name="Moon" size={19} /></span>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-brand-950">관리자 대시보드</h1>
            <p className="text-xs text-gray-500 mt-0.5">사주메이트 운영 현황 · {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</p>
          </div>
          {SHOW_CELESTIAL_DECORATION && <Sparkles size={40} strokeWidth={1.3}
            className="w-10 h-10 text-moon-500 opacity-70 pointer-events-none select-none hidden sm:block" aria-hidden="true" />}
        </div>
        {pendingSellers > 0 && (
          <Link href="/admin/sellers" className="dashboard-action w-full min-[430px]:w-auto border-moon-500/30 bg-moon-50 text-moon-700 hover:bg-moon-100">
            <Icon name="Warning" size={13} />
            <span className="hidden sm:inline">승인 대기</span> {pendingSellers}명
          </Link>
        )}
      </div>

      {/* Today Overview */}
      <div className="grid grid-cols-1 min-[430px]:grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl p-3.5 sm:p-5 text-white bg-gradient-to-br from-brand-600 to-brand-950 shadow-[0_16px_36px_rgba(36,20,69,0.18)]">
          <p className="text-white/65 text-[9px] sm:text-[10px] font-medium mb-1">오늘 예약</p>
          <p className="text-xl sm:text-2xl font-bold">{todayOrders}</p>
          <p className="text-white/50 text-[9px] sm:text-[10px] mt-1">전체 {reservationCount}건</p>
        </div>
        <div className="rounded-2xl border border-moon-500/25 bg-gradient-to-br from-moon-50 to-white p-3.5 sm:p-5 text-brand-950 shadow-[0_10px_28px_rgba(183,138,54,0.08)]">
          <p className="text-moon-700 text-[9px] sm:text-[10px] font-medium mb-1">총 매출</p>
          <p className="text-[13px] sm:text-xl font-bold leading-tight break-all">{formatPrice(revenue)}</p>
          <p className="text-gray-400 text-[9px] sm:text-[10px] mt-1">누적 매출액</p>
        </div>
        <div className="dashboard-stat">
          <p className="text-brand-500 text-[9px] sm:text-[10px] font-medium mb-1">오늘 가입</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-950">{todayUsers}</p>
          <p className="text-gray-400 text-[9px] sm:text-[10px] mt-1">전체 {userCount}명</p>
        </div>
      </div>

      {/* Today & Week Revenue/Orders */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="dashboard-stat">
          <p className="text-gray-400 text-[9px] sm:text-[10px] font-medium mb-1">오늘 매출</p>
          <p className="text-[13px] sm:text-base font-bold text-gray-900 leading-tight break-all">{formatPrice(todayRevenue)}</p>
          <p className="text-gray-300 text-[9px] sm:text-[10px] mt-1">결제 완료 기준</p>
        </div>
        <div className="dashboard-stat">
          <p className="text-gray-400 text-[9px] sm:text-[10px] font-medium mb-1">오늘 예약</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-600">{todayOrders}</p>
          <p className="text-gray-300 text-[9px] sm:text-[10px] mt-1">신규 예약 건</p>
        </div>
        <div className="dashboard-stat">
          <p className="text-gray-400 text-[9px] sm:text-[10px] font-medium mb-1">이번 주 매출</p>
          <p className="text-[13px] sm:text-base font-bold text-gray-900 leading-tight break-all">{formatPrice(weekRevenue)}</p>
          <p className="text-gray-300 text-[9px] sm:text-[10px] mt-1">결제 완료 기준</p>
        </div>
        <div className="dashboard-stat">
          <p className="text-gray-400 text-[9px] sm:text-[10px] font-medium mb-1">이번 주 예약</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-600">{weekOrders}</p>
          <p className="text-gray-300 text-[9px] sm:text-[10px] mt-1">월~오늘 기준</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "상담사", value: sellerCount, icon: "Store", href: "/admin/sellers" },
          { label: "상담상품", value: `${activeProductCount}/${productCount}`, icon: "ConsultProduct", href: "/admin/products", sub: "활성/전체" },
          { label: "처리 대기", value: pendingOrders, icon: "ReservationStatus", href: "/admin/reservations" },
          { label: "총 예약", value: reservationCount, icon: "Calendar", href: "/admin/reservations" },
          { label: "전체 회원", value: userCount, icon: "Users", href: "/admin/users" },
        ].map((kpi) => {
          const Card = kpi.href ? Link : 'div';
          return (
            <Card key={kpi.label} href={kpi.href || "#"} className="dashboard-stat group">
              <div className="flex items-center justify-between mb-2">
                <span className="dashboard-icon-tile"><Icon name={kpi.icon} size={17} /></span>
                {kpi.href && <Icon name="ArrowRight" size={12} className="text-brand-200 group-hover:text-brand-500 transition-colors" />}
              </div>
              <p className="text-base sm:text-lg font-bold text-gray-900">
                {typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{kpi.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Two-Column: Orders + Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <div className="dashboard-panel">
          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3.5 border-b border-gray-50">
            <h2 className="text-sm font-bold text-gray-900">최근 예약</h2>
            <Link href="/admin/reservations" className="text-[11px] text-gray-400 hover:text-gray-600">전체보기 →</Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {recentOrders.map((order) => {
                const st = statusLabels[order.status] || { label: order.status, color: "bg-gray-50 text-gray-600" };
                return (
                  <div key={order.id} className="flex items-center justify-between px-3.5 sm:px-5 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{order.reservationNumber}</p>
                      <p className="text-[11px] text-gray-400 truncate">{order.user.name} · {order.seller.shopName}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-[13px] font-bold text-gray-900">{formatPrice(Number(order.finalAmount))}</p>
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10">
              <Icon name="Calendar" size={28} className="mx-auto text-brand-200 mb-2" />
              <p className="text-xs text-gray-400">아직 예약이 없습니다.</p>
            </div>
          )}
        </div>

        {/* Recent Users */}
        <div className="dashboard-panel">
          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3.5 border-b border-gray-50">
            <h2 className="text-sm font-bold text-gray-900">최근 가입</h2>
            <Link href="/admin/users" className="text-[11px] text-gray-400 hover:text-gray-600">전체보기 →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-2 px-3.5 sm:px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    <SafeImage
                      src={user.role === "SUPER_ADMIN"
                        ? resolveAdminDashboardAvatar(user.id, user.avatar)
                        : user.role === "CONSULTANT"
                          ? resolveConsultantAvatar(user.id, user.avatar)
                          : (user.avatar || pickRoleAvatar(user.id, user.role, user.gender))}
                      alt={user.name}
                      width={32}
                      height={32}
                      fallbackText={user.name.charAt(0)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{user.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleColors[user.role]}`}>
                  {roleLabels[user.role]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Reviews */}
      {recentReviews.length > 0 && (
        <div className="dashboard-panel">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <h2 className="text-sm font-bold text-gray-900">최근 후기</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentReviews.map((review) => (
              <div key={review.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Icon name="Star" key={i} size={10} className={i < review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-gray-600">{review.user.name}</span>
                  <span className="text-[10px] text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400 truncate">{review.product.name}</span>
                </div>
                <p className="text-[12px] text-gray-600 line-clamp-1">{review.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seed Data Button */}
      {reservationCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-800">더미 데이터 없음</p>
            <p className="text-xs text-amber-600 mt-0.5">예약/정산 테스트 데이터를 생성하세요</p>
          </div>
          <SeedDataButton />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-3">빠른 관리</h2>
        <div className="grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { href: "/admin/users", label: "회원 관리", icon: "Users", desc: "회원 목록 & 권한" },
            { href: "/admin/sellers", label: "상담사 관리", icon: "Store", desc: "승인 & 관리" },
            { href: "/admin/products", label: "상담상품 관리", icon: "ConsultProduct", desc: "상담상품 등록 & 관리" },
            { href: "/admin/reservations", label: "예약 관리", icon: "Calendar", desc: "예약 처리" },
            { href: "/admin/settlements", label: "정산", icon: "Settlement", desc: "상담사 정산" },
            { href: "/admin/banners", label: "배너", icon: "Notice", desc: "메인 배너" },
            { href: "/", label: "사이트 보기", icon: "Eye", desc: "메인 페이지" },
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
                <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
