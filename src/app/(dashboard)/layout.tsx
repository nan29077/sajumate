import BrandWordmark from "@/components/shared/BrandWordmark";
import { Icon } from '@/components/shared/Icon';
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/settings";
import { pickRoleAvatar, resolveAdminDashboardAvatar, resolveConsultantAvatar, shouldUseAvatar } from "@/lib/defaults";
import type { FeatureFlags } from "@/lib/featureFlags";
import { Shield, Building2, User } from 'lucide-react';
import LogoutButton from "@/components/shared/LogoutButton";
import MobileSidebar from "@/components/shared/MobileSidebar";
import SidebarNavLinks from "@/components/shared/SidebarNavLinks";
import NotificationBell from "@/components/shared/NotificationBell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await auth();
  } catch (e) {
    console.error("Dashboard auth error:", e);
    redirect("/auth/login");
  }
  
  if (!session?.user) redirect("/auth/login");

  const role = (session.user as any).role || "CUSTOMER";

  // Buyer는 대시보드 접근 불가
  if (role === "CUSTOMER") redirect("/");

  const navItems: Record<string, { href: string; iconName: string; label: string; group?: string }[]> = {
    SUPER_ADMIN: [
      { href: "/admin", iconName: "Dashboard", label: "대시보드", group: "메인" },
      // 회원 관리
      { href: "/admin/users", iconName: "Users", label: "회원 관리", group: "회원 관리" },
      { href: "/admin/customers", iconName: "UserCheck", label: "고객 귀속 관리", group: "회원 관리" },
      { href: "/admin/members", iconName: "Users", label: "단골 회원 관리", group: "회원 관리" },
      { href: "/admin/sellers", iconName: "Store", label: "상담사 관리", group: "회원 관리" },
      // 상담상품 관리
      { href: "/admin/products", iconName: "ConsultProduct", label: "상담상품 관리", group: "상담상품 관리" },
      { href: "/admin/categories", iconName: "Category", label: "카테고리 관리", group: "상담상품 관리" },
      // 예약·정산
      { href: "/admin/reservations", iconName: "Calendar", label: "예약 관리", group: "예약·정산" },
      { href: "/admin/sessions", iconName: "LiveSession", label: "영상 세션 관리", group: "예약·정산" },
      { href: "/admin/settlements", iconName: "Settlement", label: "정산·재무 관리", group: "예약·정산" },
      // 콘텐츠
      { href: "/admin/banners", iconName: "Globe", label: "사이트 관리", group: "콘텐츠" },
      { href: "/admin/contents", iconName: "Content", label: "콘텐츠 관리", group: "콘텐츠" },
      { href: "/admin/games", iconName: "Play", label: "게임관리", group: "콘텐츠" },
      { href: "/admin/lives", iconName: "Live", label: "라이브 관리", group: "콘텐츠" },
      { href: "/admin/live-products", iconName: "ConsultProduct", label: "라이브 상담상품 관리", group: "콘텐츠" },
      // 알림톡
      { href: "/admin/alimtalk", iconName: "Notification", label: "알림톡 관리", group: "알림톡" },
      // 고객지원
      { href: "/admin/inquiries", iconName: "Inquiry", label: "문의 관리", group: "고객지원" },
      { href: "/admin/contact-settings", iconName: "Support", label: "고객지원 설정", group: "고객지원" },
      // 시스템
      { href: "/admin/settings", iconName: "Operation", label: "운영 설정", group: "시스템" },
    ],
    CONSULTANT: [
      { href: "/seller", iconName: "Dashboard", label: "대시보드", group: "메인" },
      // 점집 관리
      { href: "/seller/shop", iconName: "Store", label: "내 점집 관리", group: "점집 관리" },
      // 상담상품 관리
      { href: "/seller/products", iconName: "ConsultProduct", label: "상담상품 관리", group: "상담상품 관리" },
      // 판매·라이브 (콘텐츠/단체 상담/게임 메뉴는 점집 운영에 쓰지 않아 제거)
      { href: "/seller/live-mode", iconName: "ReservationStatus", label: "예약 현황", group: "판매·라이브" },
      { href: "/seller/live", iconName: "Live", label: "라이브 상담", group: "판매·라이브" },
      { href: "/seller/widget", iconName: "QrCode", label: "방송 도구", group: "판매·라이브" },
      // 예약·정산
      { href: "/seller/timeslots", iconName: "Clock", label: "예약 시간 설정", group: "예약·정산" },
      { href: "/seller/reservations", iconName: "Calendar", label: "예약 관리", group: "예약·정산" },
      { href: "/seller/customers", iconName: "Users", label: "고객관리(CRM)", group: "예약·정산" },
      { href: "/seller/members", iconName: "UserCheck", label: "단골 회원", group: "예약·정산" },
      { href: "/seller/settlements", iconName: "Settlement", label: "정산·출금", group: "예약·정산" },
      // 알림톡
      { href: "/seller/alimtalk", iconName: "Notification", label: "알림톡 관리", group: "알림톡" },
      // 설정
      { href: "/seller/settings", iconName: "Operation", label: "설정", group: "설정" },
    ],
    CUSTOMER: [],
  };

  // 기능 토글에 따라 관련 메뉴 숨김. (href → 필요한 기능 키)
  const flags: FeatureFlags = await getFeatureFlags();
  const MENU_FEATURE_GATE: { match: (href: string) => boolean; key: keyof FeatureFlags }[] = [
    { match: (h) => h.endsWith("/live") || h.endsWith("/live-products"), key: "liveCommerce" },
    { match: (h) => h.endsWith("/contents"), key: "brix" },
    { match: (h) => h === "/admin/sellers", key: "seller" },
    { match: (h) => h.endsWith("/games"), key: "game" },
  ];
  const items = (navItems[role] || navItems.CUSTOMER).filter((item) => {
    if (item.href === "/admin/live-products") return flags.liveCommerce;
    const gate = MENU_FEATURE_GATE.find((g) => g.match(item.href));
    return gate ? flags[gate.key] : true;
  });

  // 역할별 프로필 이미지를 안전하게 조회한다.
  let profileImage = session.user.image || null;
  let userAvatar: string | null = null;
  let userGender: string | null = null;
  // CONSULTANT 사이드바 표시 이름: session.user.name(JWT) 대신 DB에서 직접 읽은 shopName 사용
  let sellerShopName: string | null = null;
  try {
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatar: true, gender: true } });
    userAvatar = dbUser?.avatar ?? null;
    userGender = dbUser?.gender ?? null;
    if (role === "CONSULTANT") {
      const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user.id }, select: { shopLogo: true, shopName: true } });
      if (seller?.shopLogo) profileImage = seller.shopLogo;
      if (seller?.shopName) {
        // 상담사 콘솔 좌측 프로필에는 "OO 점집" 대신 상담사명만 간결하게 표시한다.
        sellerShopName = seller.shopName.replace(/\s*의?\s*점집\s*$/, "").trim() || seller.shopName;
      }
    }
  } catch (e) {
    console.error("Profile image fetch error:", e);
    // Continue with default image
  }
  // 사이드바에 표시할 이름: CONSULTANT는 shopName(상담사명), 그 외는 User.name
  const sidebarName = sellerShopName || session.user.name;

  // 역할 기반 랜덤 캐릭터 아바타 (기존 프로필 이미지 우선, 없으면 역할별 캐릭터)
  // 제외 목록(예: 천송이 쇼핑/김혜선)은 아바타를 적용하지 않음
  // CONSULTANT 는 점집 로고/업로드 이미지를 우선하고, 없거나 레거시 꿀벌 캐릭터면
  // 사주 동물 캐릭터로 교체한다. (아바타 제외 계정은 기존 동작 유지)
  const resolvedProfileImage = role === "SUPER_ADMIN"
    ? resolveAdminDashboardAvatar(session.user.id, profileImage || userAvatar)
    : role === "CONSULTANT"
      ? (shouldUseAvatar(session.user.name, sellerShopName)
          ? resolveConsultantAvatar(session.user.id, profileImage || userAvatar)
          : profileImage || userAvatar)
      : profileImage;
  const roleAvatarFallback = shouldUseAvatar(session.user.name, sellerShopName)
    ? (userAvatar || pickRoleAvatar(session.user.id, role, userGender))
    : (userAvatar || null);
  const displayImage = resolvedProfileImage || roleAvatarFallback;
  const sidebarAvatar = displayImage;

  const roleConfig: Record<string, { label: string; labelEn: string; icon: any; color: string; gradient: string }> = {
    SUPER_ADMIN: { label: "최고관리자", labelEn: "Admin Console", icon: Shield, color: "text-brand-700 bg-brand-50", gradient: "from-brand-600 to-brand-950" },
    CONSULTANT: { label: "상담사", labelEn: "Consultant Studio", icon: Building2, color: "text-brand-700 bg-moon-50", gradient: "from-brand-500 to-brand-800" },
    CUSTOMER: { label: "고객", labelEn: "My Page", icon: User, color: "text-green-600 bg-green-50", gradient: "from-green-500 to-emerald-600" },
  };
  const rc = roleConfig[role] || roleConfig.CUSTOMER;

  return (
    <div className="min-h-screen bg-[#f7f4fc]" data-dashboard-role={role}>
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-white/95 backdrop-blur-xl border-r border-brand-100 hidden lg:flex flex-col z-40 shadow-[10px_0_36px_rgba(56,35,105,0.04)]">
        {/* Logo & Role */}
        <div className="px-5 py-4 border-b border-brand-100 flex items-start justify-between bg-gradient-to-br from-white to-brand-50/60">
          <Link href="/" className="flex flex-col items-start gap-0.5">
            <BrandWordmark size="md" />
            <p className="text-[9px] text-gray-400 tracking-wide pl-0.5">{rc.labelEn}</p>
          </Link>
          {/* 대시보드 알림(출금 반려 등) — /my/* 는 고객 전용이라 "전체 보기"는 숨긴다 */}
          <NotificationBell size={20} className="text-gray-500" buttonClassName="p-1.5 -mr-1.5" allHref={null} />
        </div>

        {/* User Profile */}
        <div className="px-4 py-3.5 border-b border-brand-100/80">
          <div className="flex items-center gap-3">
            {displayImage ? (
              <img
                src={displayImage}
                alt={session.user.name || "프로필"}
                className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-brand-100"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${rc.gradient} flex items-center justify-center text-white text-sm font-bold shadow-sm ring-2 ring-brand-100`}>
                {sidebarName?.charAt(0) || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{sidebarName}</p>
              <p className="text-[10px] text-gray-400 truncate">{session.user.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <SidebarNavLinks items={items} />

        {/* Bottom Actions */}
        <div className="p-3 border-t border-gray-100/80 space-y-0.5">
          <Link
            href="/?main=1"
            className="flex items-center gap-3 px-3 py-2 text-[13px] text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Icon name="Home" size={16} strokeWidth={1.5} />
            메인으로
          </Link>
          <LogoutButton variant="sidebar" />
        </div>
      </aside>

      {/* Mobile Sidebar (Client Component) */}
      <MobileSidebar
        items={items}
        roleConfig={{ label: rc.label, color: rc.color }}
        user={{
          name: sidebarName,
          email: session.user.email,
          nameInitial: sidebarName?.charAt(0) || "U",
          avatar: sidebarAvatar,
        }}
      />

      {/* Main Content */}
      <main className="dashboard-content lg:ml-[260px] min-h-screen p-3 sm:p-6 lg:p-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
