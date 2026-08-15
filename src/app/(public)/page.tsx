import { existsSync } from "fs";
import path from "path";
import { Icon } from '@/components/shared/Icon';
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import SafeImage from "@/components/shared/SafeImage";
import SellerSearchHero from "@/components/shared/SellerSearchHero";
import HomeMyShopBar from "@/components/shared/HomeMyShopBar";
import HeroBannerSlider from "@/components/shared/HeroBannerSlider";
import SellerMarquee from "@/components/shared/SellerMarquee";
import HomeFaq from "@/components/shared/HomeFaq";
import StarField from "@/components/shared/StarField";
import { DEFAULT_PRODUCT_IMAGE, pickSajuAvatar } from "@/lib/defaults";
import { LIVE_RING_CLASS, OnAirBadge } from "@/components/shared/LiveBadge";
import { getFeatureFlags } from "@/lib/settings";
import { getHomeStats, getHomeStories, getHomeBenefits } from "@/lib/siteContent";
import { Heart, Radio, Sparkles, ShieldCheck, Gift, Award, Quote, Instagram, Youtube, CreditCard, Smartphone, Landmark, ArrowRight, LogIn, Bot, UserRoundCheck, FileText } from 'lucide-react';

export const dynamic = "force-dynamic";

// 서비스 차별점 (왜 사주메이트인가)
const DIFFERENTIATORS = [
  { icon: Radio, color: "text-rose-500", bg: "bg-rose-50", title: "내 방송이 곧 예약창구", desc: "검색 마켓플레이스가 아니라, 상담사가 자신의 시청자를 그대로 데려오는 구조예요." },
  { icon: Heart, color: "text-pink-500", bg: "bg-pink-50", title: "단골 중심 구조", desc: "내가 단골로 등록한 상담사와 깊게 연결돼요. 상담사는 팬을 고객으로 만들 수 있어요." },
  { icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50", title: "안심 거래·정산", desc: "통신판매중개 보호와 투명한 정산으로 안전하게." },
  { icon: Gift, color: "text-brand-600", bg: "bg-brand-50", title: "5분이면 시작", desc: "상담 상품과 가능한 시간만 등록하면 오늘 방송부터 예약을 받아요." },
];

// 라이브 상담 진행 방법 (고객 / 상담사)
const BUYER_STEPS = ["좋아하는 상담사를 단골로 설정해요", "방송 시작 알림을 받아요", "라이브에 입장해 소통해요", "원하는 시간에 바로 예약·결제해요"];
const SELLER_STEPS = ["상담 상품과 가능한 시간을 등록해요", "평소처럼 라이브 방송을 켜요", "예약 URL·QR을 설명란에 걸어둬요", "방송이 끝나면 예약이 쌓여 있어요"];

// 메인 페이지 = "사주메이트 브랜드 소개 + 상담사 진입(이름검색/단골) + 상담사 신청 유도" 화면.
// ※ 상담상품 판매/구매 리스트(인기상담상품·공구·상담상품 그리드 등)는 두지 않는다.
//   유일한 예외: 내가 단골로 등록한 상담사가 "지금 라이브 방송 중"인 상담상품을 상담사별로 묶어 보여준다.
async function getHomeData(featureLive: boolean) {
  const session = await auth();
  const isBuyer = !!(session?.user && session.user.role === "CUSTOMER");

  let liveSellers: {
    id: string;
    slug: string;
    shopName: string;
    shopLogo: string | null;
    liveTitle: string;
    shareCode: string | null;
    isManual: boolean;
    liveLink: string | null;
    products: { id: string; name: string; thumbnail: string | null; price: number; basePrice: number }[];
  }[] = [];

  if (isBuyer) {
    const profile = await prisma.buyerProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        follows: {
          select: {
            seller: {
              select: {
                id: true,
                slug: true,
                shopName: true,
                shopLogo: true,
                featureLiveCommerce: true,
                isManualLive: true,
                liveLink: true,
                manualLiveProductIds: true,
                liveStreams: {
                  where: { status: "LIVE" },
                  take: 1,
                  orderBy: { startedAt: "desc" },
                  select: {
                    id: true,
                    title: true,
                    shareCode: true,
                    products: {
                      orderBy: { sortOrder: "asc" },
                      select: {
                        id: true,
                        livePrice: true,
                        product: { select: { id: true, name: true, thumbnail: true, basePrice: true } },
                      },
                    },
                  },
                },
                shopProducts: {
                  where: { isActive: true },
                  select: {
                    product: { select: { id: true, name: true, thumbnail: true, basePrice: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    liveSellers = (profile?.follows || [])
      .map((f) => f.seller)
      .map((s) => {
        // 1순위: 사주메이트 라이브 상담(실제 LIVE 방송) — 라이브 상담 기능 ON + 방송 진행 중
        const hasRealLive = featureLive && (s.featureLiveCommerce ?? false) && s.liveStreams.length > 0;
        if (hasRealLive) {
          const live = s.liveStreams[0];
          return {
            id: s.id,
            slug: s.slug,
            shopName: s.shopName,
            shopLogo: s.shopLogo,
            liveTitle: live.title,
            shareCode: live.shareCode,
            isManual: false,
            liveLink: null,
            products: live.products.map((lp) => ({
              id: lp.product.id,
              name: lp.product.name,
              thumbnail: lp.product.thumbnail,
              price: Number(lp.livePrice ?? lp.product.basePrice),
              basePrice: Number(lp.product.basePrice),
            })),
          };
        }

        // 2순위: 수동 "라이브 중" 스위치 ON — 실제 방송 없이도 노출 상담상품과 함께 노출
        if (s.isManualLive) {
          let ids: string[] = [];
          try {
            ids = JSON.parse((s as any).manualLiveProductIds || "[]");
          } catch {
            ids = [];
          }
          const productMap = new Map(s.shopProducts.map((sp) => [sp.product.id, sp.product]));
          const products = ids
            .map((id) => productMap.get(id))
            .filter(Boolean)
            .map((p) => ({
              id: p!.id,
              name: p!.name,
              thumbnail: p!.thumbnail,
              price: Number(p!.basePrice),
              basePrice: Number(p!.basePrice),
            }));
          return {
            id: s.id,
            slug: s.slug,
            shopName: s.shopName,
            shopLogo: s.shopLogo,
            liveTitle: "라이브 중",
            shareCode: null,
            isManual: true,
            liveLink: (s as any).liveLink || null,
            products,
          };
        }

        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }

  return { liveSellers, isBuyer };
}

const SELLER_CTA_BG_DEFAULT = "/banners/sajumate/consultant-cta-v2.jpg";

// DB 배너의 로컬 이미지가 실제로 존재하는지 서버에서 검증.
// 파일이 없는 배너를 그대로 내려보내면 옛 배너 문구가 먼저 렌더됐다가
// 클라이언트에서 이미지 404를 감지한 뒤에야 기본 배너로 바뀌는 깜빡임(FOUC)이 생긴다.
function bannerImageExists(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;
  if (!imageUrl.startsWith("/")) return true; // 외부 URL은 서버에서 검증 불가 → 통과
  const relative = imageUrl.split("?")[0].replace(/^\/+/, "");
  return existsSync(path.join(process.cwd(), "public", relative));
}

// 구매회원(CUSTOMER) 외 계정은 메인 페이지 진입 시 각자 대시보드로 리다이렉트
const ROLE_DASHBOARD: Record<string, string> = {
  CONSULTANT: "/seller",
  SUPER_ADMIN: "/admin",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  const role = session?.user?.role;
  // 대시보드의 "메인으로"/"홈" 버튼은 ?main=1 로 진입한다.
  // 이 경우 비구매 계정도 대시보드로 튕기지 않고 메인 페이지를 그대로 본다.
  const forceHome = searchParams?.main === "1";
  if (!forceHome && role && role !== "CUSTOMER" && ROLE_DASHBOARD[role]) {
    redirect(ROLE_DASHBOARD[role]);
  }

  const { liveCommerce: FEATURE_LIVE } = await getFeatureFlags();
  const { liveSellers, isBuyer } = await getHomeData(FEATURE_LIVE);

  // 관리자 "사이트 관리 > 메인페이지 관리"에서 수정 가능한 숫자/성공스토리/혜택
  const [homeStats, homeStories, homeBenefits] = await Promise.all([getHomeStats(), getHomeStories(), getHomeBenefits()]);

  // 최고관리자 배너 관리에서 등록한 상단 배너(최대 3개, 슬라이드) + 하단 배너
  const [heroBannersRaw, bottomBannerRaw] = await Promise.all([
    prisma.banner.findMany({
      where: { isActive: true, position: "hero" },
      orderBy: { sortOrder: "asc" },
      take: 3,
    }),
    prisma.banner.findFirst({
      where: { isActive: true, position: "bottom" },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // 이미지 파일이 없는 배너는 서버에서 걸러 첫 렌더부터 기본(사주메이트) 배너가 나가게 한다
  const heroBanners = heroBannersRaw.filter((b) => bannerImageExists(b.imageUrl));
  const bottomBanner = bottomBannerRaw && bannerImageExists(bottomBannerRaw.imageUrl) ? bottomBannerRaw : null;

  const sellerCtaBg = bottomBanner?.imageUrl || SELLER_CTA_BG_DEFAULT;
  const sellerCtaLink = bottomBanner?.linkUrl || "/become-seller";

  return (
    <div className="bg-white min-h-screen">
      {/* ───── 상단 배너 슬라이드 (자동+수동, 최대 3페이지 / DB 배너 없으면 기본) ───── */}
      <HeroBannerSlider
        banners={heroBanners.map((b) => ({
          id: b.id,
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
        }))}
      />

      {/* ───── 내 단골 상담사 LIVE 방송 중 상담상품 (상담사별 구분) ───── */}
      {liveSellers.length > 0 && (
        <section className="pt-6 pb-2">
          <div className="flex items-center gap-1.5 px-4 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-sm font-bold text-gray-900">내 단골 라이브</h2>
            <span className="text-[10px] text-gray-400">지금 방송 중</span>
          </div>

          <div className="space-y-5">
            {liveSellers.map((s) => {
              // 프로필 클릭 → 라이브 방송으로 이동 (우선순위: 인앱 라이브 시청페이지 > 점집관리 수동 liveLink > 점집)
              const inAppLiveUrl = !s.isManual && s.shareCode ? `/live/${s.shareCode}` : null;
              const externalLiveUrl = s.isManual ? s.liveLink : null;
              const profileContent = (
                <>
                  {/* 라이브 중 프로필 — 라이브 메뉴(/live)와 동일한 두근두근 링 (LIVE_RING_CLASS) */}
                  <div className="relative w-10 h-10 flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full overflow-hidden bg-gray-100 ${LIVE_RING_CLASS}`}>
                      <SafeImage src={s.shopLogo} placeholder={pickSajuAvatar(s.id)} alt={s.shopName} width={40} height={40} fallbackText={s.shopName.charAt(0)} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-bold text-gray-900 truncate">{s.shopName}</p>
                      <OnAirBadge />
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">{s.liveTitle}</p>
                  </div>
                </>
              );
              const profileCls = "flex items-center gap-2.5 px-4 mb-2.5";
              // 점집 바로가기 버튼 (상담상품 리스트 오른쪽)
              const shopShortcut = (
                <Link
                  href={`/shop/${s.slug}`}
                  className="flex-shrink-0 w-20 flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 active:scale-[0.98] transition-transform aspect-square self-start"
                >
                  <Icon name="Store" size={18} className="text-gray-500" />
                  <span className="text-[10px] font-semibold text-gray-600">점집 바로가기</span>
                </Link>
              );
              return (
                <div key={s.id}>
                  {/* 상담사 헤더 — 클릭 시 라이브 방송으로 이동 (인앱 라이브 우선, 수동 연동은 liveLink) */}
                  {externalLiveUrl ? (
                    <a href={externalLiveUrl} target="_blank" rel="noopener noreferrer" className={profileCls}>
                      {profileContent}
                    </a>
                  ) : (
                    <Link href={inAppLiveUrl || `/shop/${s.slug}`} className={profileCls}>
                      {profileContent}
                    </Link>
                  )}

                  {/* 방송 중 상담상품 가로 스크롤 + 점집 바로가기 */}
                  {s.products.length > 0 ? (
                    <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-1">
                      {s.products.map((p) => {
                        const dp = p.basePrice > p.price ? Math.round((1 - p.price / p.basePrice) * 100) : 0;
                        return (
                          <Link
                            key={p.id}
                            href={`/products/${p.id}?sellerId=${s.id}&ref=${s.slug}`}
                            className="flex-shrink-0 w-20 active:scale-[0.98] transition-transform"
                          >
                            <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 mb-1.5">
                              <SafeImage src={p.thumbnail} placeholder={DEFAULT_PRODUCT_IMAGE} alt={p.name} width={80} height={80} fallbackText={p.name.charAt(0)} className="w-full h-full object-cover" />
                              {dp > 0 && (
                                <span className="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">LIVE {dp}%</span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-800 line-clamp-1">{p.name}</p>
                            <p className="text-[12px] font-bold text-gray-900">{p.price.toLocaleString()}원</p>
                          </Link>
                        );
                      })}
                      {shopShortcut}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 px-4 pb-1">
                      <p className="text-[11px] text-gray-400 flex-1">방송 상담상품 준비 중</p>
                      {shopShortcut}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 라이브 중인 단골 상담사가 없을 때(로그인 고객에게만) 안내 */}
      {liveSellers.length === 0 && isBuyer && (
        <section className="pt-6 pb-1 px-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            <h2 className="text-sm font-bold text-gray-900">내 단골 라이브</h2>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-5 text-center">
            <Icon name="Live" size={24} strokeWidth={1.5} className="mx-auto mb-2 text-gray-300" />
            <p className="text-[12px] text-gray-500">현재 라이브 중인 단골 상담사가 없어요</p>
            <p className="text-[11px] text-gray-400 mt-0.5">단골 상담사가 방송을 시작하면 여기에 표시돼요</p>
          </div>
        </section>
      )}

      {/* ───── 상담사 찾기 (이름 검색) ───── */}
      <div id="find-seller">
        <SellerSearchHero />
      </div>

      {/* ───── 내 단골 + 빠른 메뉴 ───── */}
      <HomeMyShopBar />

      {/* ───── 사주메이트 소개: 우리는 이런 곳이에요 ───── */}
      <section className="px-5 pt-8 pb-2">
        <h2 className="text-[17px] font-extrabold text-gray-900">사주메이트는요</h2>
        <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
          유튜브·SNS에서 활동하는 사주·신점·타로 상담사가 자신의 시청자에게
          바로 예약을 받을 수 있게 해주는 예약 커머스 플랫폼이에요.
          검색해서 찾는 마켓이 아니라, 상담사의 방송이 그대로 예약 창구가 됩니다.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <IntroStat icon={<Icon name="Users" size={18} className="text-brand-600" />} value="단골" label="나만의 상담사" />
          <IntroStat icon={<Icon name="Live" size={18} className="text-rose-500" />} value="라이브" label="실시간 소통" />
          <IntroStat icon={<Icon name="Certified" size={18} className="text-emerald-500" />} value="안심거래" label="중개 보호" />
        </div>
      </section>

      {/* ───── 추천 상담사 (자동 슬라이드 마퀴) ───── */}
      <section className="pt-7 pb-1">
        <div className="flex items-center gap-1.5 px-5 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-[15px] font-extrabold text-gray-900">추천 상담사</h2>
          <span className="text-[10px] text-gray-400">분야별 상담 안내</span>
        </div>
        <SellerMarquee />
      </section>

      {/* ───── 상담사가 사주메이트를 선택하는 이유 (수치·혜택) ───── */}
      <section className="px-5 pt-7 pb-2">
        <h2 className="text-[17px] font-extrabold text-gray-900">상담사가 사주메이트를 선택하는 이유</h2>
        <p className="mt-1 text-[12px] text-gray-500">방송부터 예약, 단골 관리까지 한 곳에서</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {homeBenefits.stats.map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} sub={s.sub} />
          ))}
        </div>
        <div className="mt-4 space-y-2.5">
          {homeBenefits.items.map((item, i) => (
            <Benefit key={i} icon={<BenefitIcon type={item.iconType} />} title={item.title} desc={item.desc} />
          ))}
        </div>
      </section>

      {/* ───── 숫자로 보는 사주메이트 (다크 배너) ───── */}
      <section className="px-4 pt-7">
        <div className="rounded-3xl bg-gray-900 text-white p-6">
          <div className="inline-flex items-center gap-1 rounded-full bg-brand-500/20 text-brand-300 px-2.5 py-1 mb-3">
            <Award size={12} /> <span className="text-[10px] font-bold tracking-wide">BY THE NUMBERS</span>
          </div>
          <h2 className="text-[18px] font-extrabold">숫자로 보는 사주메이트</h2>
          <p className="text-[11px] text-white/60 mt-1">함께 성장하는 단골 상담</p>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            {homeStats.map((s, i) => (
              <BigStat key={i} value={s.value} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ───── 성공한 상담사 스토리 ───── */}
      <section className="pt-8 pb-1">
        <div className="px-5 mb-3">
          <h2 className="text-[17px] font-extrabold text-gray-900">사주메이트로 성공한 상담사</h2>
          <p className="mt-1 text-[12px] text-gray-500">평범한 일상에서, 나만의 점집으로</p>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-1">
          {homeStories.map((s, i) => (
            <div key={s.name} className="flex-shrink-0 w-64 rounded-2xl border border-gray-100 bg-white p-4 flex flex-col">
              <Quote size={20} className="text-brand-400" />
              <p className="text-[12.5px] text-gray-700 leading-relaxed mt-2 flex-1">{s.quote}</p>
              <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-gray-50">
                <img src={s.avatar || `/avatars/saju/saju-avatar-${String(i + 1).padStart(2, "0")}.png`} alt="" className="w-10 h-10 rounded-full bg-brand-50 ring-2 ring-brand-100 object-cover" />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-gray-900 truncate">{s.name}</p>
                  <p className="text-[10.5px] text-brand-600 font-bold">{s.metric}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 이런 분들께 추천해요 ───── */}
      <section className="px-5 pt-8">
        <h2 className="text-[17px] font-extrabold text-gray-900">이런 분들께 추천해요</h2>
        <div className="mt-4 space-y-2.5">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center"><Icon name="Cart" size={17} className="text-pink-500" /></div>
              <p className="text-[14px] font-bold text-gray-900">이렇게 상담받고 싶다면</p>
            </div>
            <ul className="space-y-1.5">
              {["믿을 수 있는 상담사에게만 상담받고 싶어요", "방송을 먼저 보고 분위기를 확인하고 싶어요", "전화·카톡 문의 없이 바로 예약하고 싶어요"].map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12.5px] text-gray-600"><Icon name="Check" size={14} className="text-brand-500 mt-0.5 flex-shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center"><Icon name="Store" size={17} className="text-brand-600" /></div>
              <p className="text-[14px] font-bold text-gray-900">이렇게 상담하고 싶다면</p>
            </div>
            <ul className="space-y-1.5">
              {["방송 중에 예약을 자동으로 받고 싶어요", "카톡 문의·입금 확인에서 벗어나고 싶어요", "내 시청자를 단골 고객으로 만들고 싶어요"].map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12.5px] text-gray-700"><Icon name="Check" size={14} className="text-brand-600 mt-0.5 flex-shrink-0" /> {t}</li>
              ))}
            </ul>
            <Link href="/become-seller" className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-brand-700">
              상담사로 신청하기 <Icon name="ChevronDown" size={14} className="-rotate-90" />
            </Link>
          </div>
        </div>
      </section>

      {/* ───── 왜 사주메이트일까요 (차별점) ───── */}
      <section className="px-5 pt-8">
        <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2.5 py-1 mb-2">
          <Icon name="Lightning" size={12} /> <span className="text-[10px] font-bold">WHY 사주메이트</span>
        </div>
        <h2 className="text-[18px] font-extrabold text-gray-900">왜 사주메이트일까요?</h2>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {DIFFERENTIATORS.map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.title} className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className={`w-9 h-9 rounded-xl ${d.bg} flex items-center justify-center mb-2`}>
                  <Icon size={17} className={d.color} />
                </div>
                <p className="text-[13px] font-bold text-gray-900">{d.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{d.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── 단골 고객관리 · AI 상담요약 (상담사·고객 모두를 위한 기능) ───── */}
      <section className="px-4 pt-8">
        <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-purple-50/50 p-5">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/70 text-brand-700 px-2.5 py-1 mb-2 ring-1 ring-brand-100">
            <Sparkles size={12} strokeWidth={2} /> <span className="text-[10px] font-bold">단골 관리 · AI 요약</span>
          </div>
          <h2 className="text-[18px] font-extrabold text-gray-900">한 번 온 고객, 계속 이어지는 상담</h2>
          <p className="mt-1.5 text-[12px] text-gray-500 leading-relaxed">
            상담사는 단골 고객을 손쉽게 관리하고, 고객은 상담 내용을 AI 요약으로 쉽게 이해해요.
          </p>

          <div className="mt-4 space-y-2.5">
            {/* 단골 고객관리 프로그램 (상담사용) */}
            <div className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <UserRoundCheck size={18} strokeWidth={1.8} className="text-brand-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-gray-900">단골 고객관리 프로그램</p>
                  <p className="text-[10.5px] text-brand-600 font-bold">상담사를 위한 기능</p>
                </div>
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed">
                재방문 고객을 한 곳에서 관리해요. 고객별 이전 상담 내역과 예약 기록이 정리돼 있어,
                단골이 다시 찾아와도 처음부터 다시 묻지 않고 바로 이어서 상담할 수 있어요.
              </p>
            </div>

            {/* AI 상담요약 (상담사·고객 공통) */}
            <div className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Bot size={18} strokeWidth={1.8} className="text-purple-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-gray-900">AI 상담요약</p>
                  <p className="text-[10.5px] text-purple-600 font-bold">상담사 · 고객 모두에게</p>
                </div>
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed">
                상담이 끝나면 AI가 상담 내용을 자동으로 요약해줘요. 상담사는 요약으로 재방문 고객을
                더 쉽게 관리하고, 고객은 복잡했던 상담 내용을 한눈에 이해하고 언제든 다시 볼 수 있어요.
              </p>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div className="flex items-start gap-2 rounded-2xl bg-white/60 border border-brand-100 px-3 py-2.5">
              <UserRoundCheck size={15} strokeWidth={1.9} className="text-brand-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-600 leading-relaxed">상담사는 단골을 놓치지 않고 오래 이어가요</p>
            </div>
            <div className="flex items-start gap-2 rounded-2xl bg-white/60 border border-brand-100 px-3 py-2.5">
              <FileText size={15} strokeWidth={1.9} className="text-purple-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-600 leading-relaxed">고객은 AI 요약으로 상담을 쉽게 기억해요</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───── 라이브 상담 진행 방법 (고객 / 상담사) ───── */}
      <section className="px-5 pt-8">
        <h2 className="text-[18px] font-extrabold text-gray-900">라이브 상담, 이렇게 진행돼요</h2>
        <p className="mt-1 text-[12px] text-gray-500">고객도, 상담사도 쉽고 간단하게</p>
        <div className="mt-4 grid grid-cols-1 gap-2.5">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center"><Icon name="Wishlist" size={16} className="text-pink-500" /></div>
              <p className="text-[14px] font-bold text-gray-900">고객이라면</p>
            </div>
            <ol className="space-y-2">
              {BUYER_STEPS.map((t, i) => (
                <li key={t} className="flex items-center gap-2.5 text-[12.5px] text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center"><Icon name="Store" size={16} className="text-brand-600" /></div>
              <p className="text-[14px] font-bold text-gray-900">상담사라면</p>
            </div>
            <ol className="space-y-2">
              {SELLER_STEPS.map((t, i) => (
                <li key={t} className="flex items-center gap-2.5 text-[12.5px] text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-brand-500 text-black text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───── 간편결제 (상담사 편의) ───── */}
      <section className="px-4 pt-8">
        <div className="rounded-3xl border border-brand-100 bg-brand-50/50 p-5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
              <Icon name="CreditCard" size={18} strokeWidth={1.8} className="text-black" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold text-gray-900">결제는 1초, 예약은 막힘없이</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">통장 대조·입금 확인 없이 결제가 자동으로 끝나요</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[
              {
                icon: CreditCard,
                label: "신용·체크카드",
                desc: "모든 카드사 즉시 결제. 할부도 지원돼 고객은 부담 없이, 상담사는 결제 누락 걱정 없이 판매해요.",
              },
              {
                icon: Smartphone,
                label: "간편결제",
                badge: "카카오페이 · 네이버페이 등",
                desc: "지문·비밀번호 한 번이면 끝. 카드 정보 입력 없이 라이브 도중에도 바로 결제로 이어져요.",
              },
              {
                icon: Landmark,
                label: "간편 계좌이체",
                desc: "계좌를 한 번만 등록하면, 라이브 방송마다 클릭 한 번으로 계좌이체 완료. 매번 계좌번호를 입력할 필요가 없어요.",
              },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="flex items-start gap-3 rounded-2xl bg-white border border-gray-100 p-3.5">
                  <span className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Icon size={17} strokeWidth={1.7} className="text-brand-600" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[13px] font-bold text-gray-900">{m.label}</p>
                      {m.badge && (
                        <span className="text-[9px] font-bold text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-full">{m.badge}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3.5 flex items-center gap-1.5 text-[12px] text-gray-600">
            <Icon name="Check" size={14} className="text-brand-600 flex-shrink-0" />
            카드·간편결제·계좌이체까지 모두 지원 — 상담사는 그만큼 편하게 판매해요
          </p>
        </div>
      </section>

      {/* ───── 이렇게 즐겨요 ───── */}
      <section className="px-5 pt-8 pb-2">
        <h2 className="text-[15px] font-extrabold text-gray-900">이렇게 즐겨요</h2>
        <div className="mt-4 space-y-2.5">
          <StoryStep no={1} icon={<Icon name="Search" size={16} className="text-brand-600" />} title="상담사를 찾아요" desc="상담사 이름·분야로 검색해 마음에 드는 상담사를 만나요." />
          <StoryStep no={2} icon={<Icon name="Wishlist" size={16} className="text-pink-500" />} title="상담사를 단골로 설정해요" desc="단골로 설정하면 방송 시작 알림을 받고 예약 소식을 놓치지 않아요." />
          <StoryStep no={3} icon={<Icon name="Live" size={16} className="text-rose-500" />} title="방송 보고 바로 예약해요" desc="라이브를 보다가 원하는 시간을 골라 그 자리에서 예약·결제해요." />
        </div>
      </section>

      {/* ───── 상담사 신청 유도 배너 (실사 배경) ───── */}
      <section className="px-4 pt-7 pb-8">
        <Link
          href={sellerCtaLink}
          className="relative block rounded-3xl overflow-hidden active:scale-[0.99] transition-transform shadow-md"
        >
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${sellerCtaBg})` }} />
          <div className="absolute inset-0 bg-gradient-to-tr from-brand-700/85 via-brand-600/70 to-purple-600/65" />
          <div className="relative p-5 text-white">
            <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 mb-2">
              <Icon name="Megaphone" size={11} />
              <span className="text-[10px] font-bold">상담사 모집</span>
            </div>
            <h3 className="text-[18px] font-extrabold leading-snug">
              방송은 그대로,
              <br />예약만 자동으로
            </h3>
            <p className="mt-1.5 text-[12px] text-white/85 leading-relaxed">
              상담 상품과 가능한 시간만 등록하면 오늘 방송부터 예약을 받을 수 있어요.
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-white/90">
              <span className="flex items-center gap-1"><Icon name="Clock" size={12} /> 실시간 예약</span>
              <span className="flex items-center gap-1"><Icon name="CreditCard" size={12} /> 자동 결제</span>
              <span className="flex items-center gap-1"><Icon name="Chart" size={12} /> 정산 자동화</span>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-white text-brand-700 text-[13px] font-bold px-4 py-2">
              상담사로 신청하기 <Icon name="ChevronDown" size={15} className="-rotate-90" />
            </span>
          </div>
        </Link>
      </section>

      {/* ───── 자주 묻는 질문 ───── */}
      <section className="px-5 pt-8">
        <h2 className="text-[17px] font-extrabold text-gray-900 flex items-center gap-1.5">
          <Icon name="Help" size={18} className="text-brand-500" /> 자주 묻는 질문
        </h2>
        <div className="mt-4">
          <HomeFaq />
        </div>
      </section>

      {/* ───── SNS / 커뮤니티 팔로우 ───── */}
      <section className="px-4 pt-8">
        <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-amber-50 border border-brand-100 p-6 text-center">
          <div className="w-11 h-11 rounded-full bg-brand-500 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={18} className="text-black" />
          </div>
          <h2 className="text-[16px] font-extrabold text-gray-900">사주메이트와 더 가까이</h2>
          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
            새로운 상담사와 라이브 소식,<br />이벤트를 가장 먼저 받아보세요.
          </p>
          <div className="flex justify-center gap-2.5 mt-4">
            <a href="#" className="inline-flex items-center gap-1.5 rounded-full bg-white text-gray-800 text-[12px] font-bold px-3.5 py-2 ring-1 ring-gray-100 active:scale-95 transition-transform">
              <Instagram size={14} className="text-pink-500" /> 인스타그램
            </a>
            <a href="#" className="inline-flex items-center gap-1.5 rounded-full bg-white text-gray-800 text-[12px] font-bold px-3.5 py-2 ring-1 ring-gray-100 active:scale-95 transition-transform">
              <Youtube size={14} className="text-red-500" /> 유튜브
            </a>
            <a href="#" className="inline-flex items-center gap-1.5 rounded-full bg-[#FEE500] text-[#3C1E1E] text-[12px] font-bold px-3.5 py-2 active:scale-95 transition-transform">
              <Icon name="Message" size={14} /> 카카오채널
            </a>
          </div>
        </div>
      </section>

      {/* ───── 라이브 찾기 진입 ───── */}
      {FEATURE_LIVE && (
        <section className="px-4 pb-9">
          <Link
            href="/live"
            className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 px-5 py-4 active:scale-[0.99] transition-transform"
          >
            <div className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center text-white flex-shrink-0">
              <Icon name="Live" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">라이브 찾기</p>
              <p className="text-[11px] text-gray-500 mt-0.5">상담사 이름·코드로 진행 중인 라이브를 찾아보세요</p>
            </div>
            <Icon name="ChevronDown" size={18} className="text-rose-300 flex-shrink-0 -rotate-90" />
          </Link>
        </section>
      )}

      {/* ───── 최종 CTA: 지금 바로 시작하세요 ───── */}
      <section className="px-4 pt-2 pb-9">
        <div
          className="relative overflow-hidden rounded-3xl px-6 pt-9 pb-8 text-center text-white"
          style={{ background: "linear-gradient(160deg, #0d0720 0%, #1a0a2e 45%, #2d1b69 100%)" }}
        >
          <StarField />
          <div className="pointer-events-none absolute -top-16 -left-14 w-48 h-48 rounded-full bg-purple-500/25 blur-3xl animate-aura" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-16 -right-14 w-48 h-48 rounded-full bg-indigo-400/20 blur-3xl animate-aura" style={{ animationDelay: "2.5s" }} aria-hidden="true" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide text-purple-200 ring-1 ring-white/15">
              <Sparkles size={12} strokeWidth={1.8} /> START NOW
            </span>
            <h2 className="mt-4 text-[24px] font-extrabold leading-tight">지금 바로 시작하세요</h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-purple-100/75">
              오늘 방송부터 예약을 받을 수 있어요.
              <br />상품 등록에 5분이면 충분합니다.
            </p>

            <Link
              href="/become-seller"
              className="mt-6 flex items-center justify-center gap-1.5 w-full rounded-2xl bg-white py-3.5 text-[14px] font-extrabold text-[#2d1b69] shadow-lg shadow-black/20 active:scale-[0.98] transition-transform"
            >
              상담사 등록하기 <ArrowRight size={16} strokeWidth={2.4} />
            </Link>

            <Link
              href="/auth/register"
              className="mt-2.5 flex items-center justify-center gap-1.5 w-full rounded-2xl bg-white/10 py-3.5 text-[13px] font-bold text-white ring-1 ring-white/20 active:scale-[0.98] transition-transform"
            >
              고객으로 회원가입
            </Link>

            <p className="mt-4 text-[12px] text-purple-200/60">
              이미 계정이 있으신가요?{" "}
              <Link href="/auth/login" className="inline-flex items-center gap-1 font-bold text-white underline underline-offset-2">
                <LogIn size={12} strokeWidth={2.2} /> 로그인
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="h-4" />
    </div>
  );
}

/* ── 다크 배너용 큰 수치 ── */
function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[24px] font-extrabold text-brand-400 leading-none">{value}</p>
      <p className="text-[11px] text-white/70 mt-1.5">{label}</p>
    </div>
  );
}

/* ── 통계 타일 ── */
function StatTile({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3.5">
      <p className="text-[22px] font-extrabold text-gray-900 leading-none">{value}</p>
      <p className="text-[12px] font-bold text-gray-700 mt-1.5">{label}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

/* ── 혜택 아이콘 매핑 ── */
function BenefitIcon({ type }: { type: string }) {
  const cls16 = { size: 16 };
  switch (type) {
    case "radio": return <Icon name="Live" {...cls16} className="text-rose-500" />;
    case "shield": return <Icon name="Certified" {...cls16} className="text-emerald-500" />;
    case "star": return <Sparkles {...cls16} className="text-yellow-500" />;
    case "zap": return <Icon name="Lightning" {...cls16} className="text-amber-500" />;
    case "trending": return <Icon name="Chart" {...cls16} className="text-blue-500" />;
    case "users": return <Icon name="Users" {...cls16} className="text-violet-500" />;
    case "heart": default: return <Icon name="Wishlist" {...cls16} className="text-pink-500" />;
  }
}

/* ── 혜택 행 ── */
function Benefit({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[13px] font-bold text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── 소개 통계 카드 ── */
function IntroStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-gray-100 bg-white py-3.5">
      <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center">{icon}</div>
      <p className="text-[12px] font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

/* ── 브랜드 스토리 스텝 ── */
function StoryStep({ no, icon, title, desc }: { no: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center">{icon}</div>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center">
          {no}
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[13px] font-bold text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
