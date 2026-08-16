import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import SafeImage from "@/components/shared/SafeImage";
import SellerShopFooter from "@/components/shared/SellerShopFooter";
import SellerShopHeader from "@/components/shared/SellerShopHeader";
import SellerShopBottomNav from "@/components/shared/SellerShopBottomNav";
import ShopContextSync from "@/components/shared/ShopContextSync";
import ShopBookingCalendar, { type DaySlots } from "@/components/shared/ShopBookingCalendar";
import ShopShareButton from "@/components/shared/ShopShareButton";
import ReservationCountdown from "@/components/shop/ReservationCountdown";
import DirectProductSection, { type DirectProductItem } from "@/components/shop/DirectProductSection";
import { CalendarCheck, Clock, Video, Phone, MapPin, Sparkles, ChevronRight, CalendarDays } from "lucide-react";
import { getFeatureFlags } from "@/lib/settings";
import { DEFAULT_PRODUCT_IMAGE, resolveSellerDisplayImage, resolveShopBanner } from "@/lib/defaults";
import { OnAirBadge, LIVE_RING_CLASS } from "@/components/shared/LiveBadge";
import { getShopCustomization } from "@/lib/shopCustomization";
import { safeQuery } from "@/lib/safeDb";
import { auth } from "@/lib/auth";
import {
  SOCIAL_SHARE_IMAGE_PATH,
  absolutePublicUrl,
  resolveRequestOrigin,
} from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// /shop/[slug] — 상담사 점집 공개 페이지 (예약 커머스)
//
// 구성: 프로필 헤더 → 오늘의 예약 현황 → 상담 메뉴 → 상세 소개 → 예약 달력 → 콘텐츠
// 커머스(장바구니·배송·구매 버튼·구매 리뷰·팔로우 마케팅 UI)는 제거되었다.
//
// ⚠️ TimeSlot / Reservation 테이블은 운영 DB 에 아직 반영되지 않았다(스키마 드리프트).
//    safeQuery 로 감싸 빈 값으로 폴백하므로, 미반영 환경에서는 예약 현황·달력이
//    "열린 시간 없음" 상태로 표시된다. (페이지 자체는 죽지 않는다)
// ─────────────────────────────────────────────────────────────

const BASE_PRODUCT_SELECT = {
  id: true,
  name: true,
  basePrice: true,
  thumbnail: true,
  description: true,
} as const;

const CONSULTING_PRODUCT_SELECT = {
  ...BASE_PRODUCT_SELECT,
  consultingType: true,
  consultingMethod: true,
  durationMinutes: true,
} as const;

interface ShopProduct {
  id: string;
  name: string;
  basePrice: unknown;
  thumbnail: string | null;
  description: string | null;
  consultingType?: string;
  consultingMethod?: string;
  durationMinutes?: number;
}

function sellerInclude(productSelect: object) {
  return {
    user: { select: { id: true, name: true, avatar: true } },
    shopProducts: {
      where: { isActive: true },
      include: { product: { select: productSelect } },
      orderBy: { displayOrder: "asc" as const },
    },
    liveStreams: {
      where: { status: "LIVE" as const },
      take: 1,
      select: { id: true, shareCode: true, title: true },
    },
    shopExposure: true,
    _count: { select: { fans: true, followers: true } },
  };
}

/** 상담 컬럼(consultingType 등) 미반영 환경 대비 폴백 조회 */
async function getSeller(slug: string) {
  try {
    const full = await prisma.sellerProfile.findUnique({
      where: { slug },
      include: sellerInclude(CONSULTING_PRODUCT_SELECT),
    });
    return { seller: full, hasConsultingFields: true as const };
  } catch (e) {
    console.error("점집 페이지: 상담 컬럼 조회 실패, 기본 컬럼으로 폴백", e);
    const basic = await prisma.sellerProfile.findUnique({
      where: { slug },
      include: sellerInclude(BASE_PRODUCT_SELECT),
    });
    return { seller: basic, hasConsultingFields: false as const };
  }
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const METHOD_META: Record<string, { label: string; Icon: typeof Video }> = {
  video: { label: "영상 상담", Icon: Video },
  phone: { label: "전화 상담", Icon: Phone },
  visit: { label: "방문 상담", Icon: MapPin },
};

function methodMeta(raw?: string | null) {
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (METHOD_META[key]) return METHOD_META[key];
  if (raw.includes("영상")) return METHOD_META.video;
  if (raw.includes("전화")) return METHOD_META.phone;
  if (raw.includes("방문")) return METHOD_META.visit;
  return { label: raw, Icon: Video };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const seller = await prisma.sellerProfile.findUnique({
    where: { slug },
    select: { id: true, shopName: true, shopDescription: true, shopBanner: true },
  });
  if (!seller) return { title: "점집을 찾을 수 없습니다 | 사주메이트" };

  const custom = await getShopCustomization(seller.id);
  const title = `${seller.shopName}의 점집 - 사주메이트`;
  const description =
    custom.tagline || seller.shopDescription || `${seller.shopName}에게 지금 상담을 예약하세요.`;
  const origin = resolveRequestOrigin();
  const pageUrl = absolutePublicUrl(`/shop/${slug}`, origin);
  const image = absolutePublicUrl(SOCIAL_SHARE_IMAGE_PATH, origin);

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "사주메이트",
      type: "profile",
      images: [
        {
          url: image,
          secureUrl: image,
          type: "image/png",
          width: 1200,
          height: 630,
          alt: `${seller.shopName}의 점집 - 사주메이트`,
        },
      ],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SellerShopPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { brix: FEATURE_CONTENT } = await getFeatureFlags();
  const { slug } = await Promise.resolve(params);
  const { seller, hasConsultingFields } = await getSeller(slug);
  if (!seller || !seller.isApproved) notFound();

  const customization = await getShopCustomization(seller.id);
  const themeColor = seller.shopThemeColor || "#6D4BC3";
  const avatar = resolveSellerDisplayImage(seller);
  const banner = resolveShopBanner(seller.shopBanner, seller.id);

  // ─── 상담 메뉴 ───
  const products = seller.shopProducts.map((sp) => {
    const p = sp.product as unknown as ShopProduct;
    return {
      id: p.id,
      name: p.name,
      price: Number((sp as any).sellerPrice ?? p.basePrice),
      thumbnail: p.thumbnail,
      description: p.description,
      consultingType: hasConsultingFields ? p.consultingType ?? null : null,
      consultingMethod: hasConsultingFields ? p.consultingMethod ?? null : null,
      durationMinutes: hasConsultingFields ? p.durationMinutes ?? null : null,
    };
  });

  // ─── 상담 분야 태그 (상담사 지정 > 상품 consultingType > 카테고리) ───
  const consultTags = customization.tags.length > 0
    ? customization.tags
    : Array.from(new Set(products.map((p) => p.consultingType).filter((t): t is string => !!t))).length > 0
      ? Array.from(new Set(products.map((p) => p.consultingType).filter((t): t is string => !!t)))
      : [seller.category, seller.mood].filter((v): v is string => !!v);

  // ─── 예약 가능 슬롯 (오늘 ~ 60일) ───
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeEnd = new Date(todayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 60);

  const rawSlots = await safeQuery(
    "shop page timeslots",
    () =>
      prisma.timeSlot.findMany({
        where: {
          consultantId: seller.user.id,
          isAvailable: true,
          reservationId: null,
          date: { gte: todayStart, lte: rangeEnd },
        },
        select: { date: true, startTime: true },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 800,
      }),
    [] as { date: Date; startTime: string }[],
  );

  const byDate = new Map<string, string[]>();
  for (const s of rawSlots) {
    const key = toYmd(new Date(s.date));
    const list = byDate.get(key) ?? [];
    list.push(s.startTime);
    byDate.set(key, list);
  }
  const daySlots: DaySlots[] = Array.from(byDate.entries())
    .map(([date, times]) => ({ date, times: times.sort() }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayKey = toYmd(now);

  // ─── 로그인 세션 + 내 예약 조회 ───
  const session = await auth();
  const myReservation = await safeQuery(
    "shop page my reservation",
    async (): Promise<{ reservationDate: Date; reservationTime: string } | null> => {
      if (!session?.user?.id) return null;
      return prisma.reservation.findFirst({
        where: {
          userId: session.user.id,
          sellerId: seller.id,
          reservationDate: { gte: now },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { reservationDate: true, reservationTime: true },
        orderBy: { reservationDate: "asc" },
      });
    },
    null,
  );

  // 예약 날짜 + 시간 → ISO string (클라이언트 컴포넌트에 직렬화하여 전달)
  let myReservationIso: string | null = null;
  if (myReservation) {
    const rd = new Date(myReservation.reservationDate);
    const [rh, rm] = myReservation.reservationTime.split(":").map(Number);
    rd.setHours(rh, rm, 0, 0);
    myReservationIso = rd.toISOString();
  }

  // ─── 콘텐츠 (선택) ───
  const contents = FEATURE_CONTENT && (seller.featureContent ?? true)
    ? await safeQuery(
        "shop page contents",
        () =>
          prisma.contentPost.findMany({
            where: { sellerId: seller.id, isPublished: true },
            orderBy: { createdAt: "desc" },
            take: 6,
            select: { id: true, title: true, images: true, createdAt: true },
          }),
        [] as { id: string; title: string; images: string | null; createdAt: Date }[],
      )
    : [];

  // ─── 상담상품(DirectProduct) — shopExposure 기준 ───
  const directProducts: DirectProductItem[] = await safeQuery(
    "shop page direct products",
    async () => {
      const exposure = (seller as any).shopExposure as { isEnabled: boolean; productIds: string | null } | null;
      if (!exposure || !exposure.isEnabled) return [];
      const selectedIds: string[] = (() => {
        try { return JSON.parse(exposure.productIds || "[]"); } catch { return []; }
      })();
      if (selectedIds.length === 0) return [];
      const rows = await prisma.directProduct.findMany({
        where: { sellerId: seller.id, id: { in: selectedIds }, isActive: true },
        select: { id: true, name: true, price: true, description: true, images: true },
      });
      const orderMap = new Map(selectedIds.map((id, i) => [id, i]));
      return rows
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          description: p.description,
          images: (() => { try { return JSON.parse(p.images || "[]"); } catch { return []; } })(),
        }));
    },
    [] as DirectProductItem[],
  );

  // ─── 라이브 진행 여부 ───
  const currentLive = seller.liveStreams[0] ?? null;
  const manualLiveOn = (seller as any).isManualLive ?? false;
  const showLive = manualLiveOn || !!currentLive;
  const liveHref = currentLive ? `/live/${currentLive.shareCode}` : (seller as any).liveLink || null;

  const bookHref = `/shop/${seller.slug}/book`;

  return (
    <div className="animate-fade-in min-h-screen bg-[#F7F5FC] pb-2">
      <ShopContextSync shop={{ slug: seller.slug, name: seller.shopName, logo: avatar }} />

      <SellerShopHeader
        sellerName={seller.user.name || seller.shopName}
        sellerLogo={avatar}
        sellerSlug={seller.slug}
        sellerId={seller.id}
        showLive={showLive}
        liveHref={liveHref}
      />

      {/* ───── 1. 상담사 프로필 헤더 ───── */}
      <section className="relative">
        <div className="relative h-44 overflow-hidden bg-brand-950">
          <img src={banner} alt={`${seller.shopName} 배너`} className="h-full w-full scale-[1.01] object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-950/10 via-transparent to-brand-950/55" />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to top, ${themeColor}35 0%, transparent 58%)` }}
          />
        </div>

        <div className="relative -mt-11 px-4">
          <div className="rounded-[26px] border border-white/80 bg-white/95 p-4 pb-5 shadow-[0_18px_45px_rgba(48,30,91,0.12)] backdrop-blur-sm">
            {(() => {
              // 라이브 중이면 프로필 카드(아바타+이름) 전체를 내부 라이브 뷰어 링크로 감싼다.
              // 라이브가 아니면 정적 카드(클릭 없음). 상단 바 로고는 항상 점집 홈으로 이동(그대로).
              const inner = (
                <>
                  <div className="flex flex-col items-center flex-shrink-0 -mt-8">
                    <div
                      className={`relative h-[72px] w-[72px] overflow-hidden rounded-2xl bg-white shadow-md ring-4 ${
                        showLive ? LIVE_RING_CLASS : "ring-white"
                      }`}
                    >
                      <SafeImage
                        src={avatar}
                        alt={seller.shopName}
                        width={72}
                        height={72}
                        fallbackText={seller.shopName.charAt(0)}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-[18px] font-extrabold tracking-[-0.025em] text-brand-950">{seller.user.name || seller.shopName}</h1>
                      {showLive && <OnAirBadge />}
                    </div>
                    {customization.tagline && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-gray-500">{customization.tagline}</p>
                    )}
                    {showLive && liveHref && (
                      <p className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold text-violet-600">
                        지금 라이브 보기 <span aria-hidden>›</span>
                      </p>
                    )}
                  </div>
                </>
              );
              return showLive && liveHref ? (
                <Link
                  href={liveHref}
                  aria-label={`${seller.user.name || seller.shopName} 라이브 방송 보기`}
                  className="-m-1 flex items-start gap-3 rounded-2xl p-1 transition active:opacity-80"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-3">{inner}</div>
              );
            })()}

            {/* 상담 분야 태그 */}
            {consultTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {consultTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                    style={{ color: themeColor, borderColor: `${themeColor}55`, backgroundColor: `${themeColor}12` }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 border-t border-brand-50 pt-3">
              <ShopShareButton slug={seller.slug} shopName={seller.shopName} themeColor={themeColor} />
            </div>
          </div>
        </div>
      </section>

      {/* ───── 2. 내 예약 현황 ───── */}
      <section className="mt-4 px-4">
        <div className="rounded-3xl border border-brand-100/70 bg-white p-4 shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
          <div className="flex items-center gap-1.5 mb-3">
            <CalendarDays size={15} strokeWidth={1.8} style={{ color: themeColor }} />
            <h2 className="text-sm font-bold text-gray-900">내 예약 현황</h2>
          </div>

          {myReservation && myReservationIso ? (
            <ReservationCountdown
              reservationIso={myReservationIso}
              reservationDateLabel={toYmd(new Date(myReservation.reservationDate))}
              reservationTimeStr={myReservation.reservationTime}
            />
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/65 p-3.5">
              <div>
                <p className="text-[13px] font-semibold text-brand-950">새 상담을 예약해 보세요</p>
                <p className="mt-0.5 text-[11px] text-gray-500">원하는 상담과 시간을 편하게 선택할 수 있어요.</p>
              </div>
              <Link
                href={bookHref}
                className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[12px] font-extrabold text-white shadow-sm transition-transform active:scale-[0.98]"
                style={{ backgroundColor: themeColor }}
              >
                <CalendarCheck size={15} strokeWidth={2} />
                예약하기
              </Link>
            </div>
          )}

          {daySlots.length === 0 && (
            <p className="text-[11px] text-gray-400 text-center mt-2">
              열린 예약 시간이 없어 예약 신청만 접수됩니다.
            </p>
          )}
        </div>
      </section>

      {/* ───── 3. 상담 메뉴 ───── */}
      <section className="mt-4 px-4">
        <div className="rounded-3xl border border-brand-100/70 bg-white p-4 shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={15} strokeWidth={1.8} style={{ color: themeColor }} />
            <h2 className="text-sm font-bold text-gray-900">상담 메뉴</h2>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">원하는 상담을 고르면 예약 화면으로 이동합니다</p>

          {products.length === 0 && directProducts.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-gray-400">
              아직 등록된 상담 메뉴가 없습니다.
            </p>
          ) : (
            <div className="space-y-2.5">
              {/* 달력 예약 상품 */}
              {products.length > 0 && (
                <ul className="space-y-2.5">
                  {products.map((p) => {
                    const mm = methodMeta(p.consultingMethod);
                    return (
                      <li key={p.id}>
                        <Link
                          href={`${bookHref}?productId=${p.id}`}
                          className="flex items-center gap-3 rounded-2xl border border-transparent bg-[#FAF9FD] p-3 transition-all hover:border-brand-100 hover:bg-white hover:shadow-sm active:scale-[0.99]"
                        >
                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-brand-50">
                            <SafeImage
                              src={p.thumbnail}
                              placeholder={DEFAULT_PRODUCT_IMAGE}
                              alt={p.name}
                              width={64}
                              height={64}
                              fallbackText={p.name.charAt(0)}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-gray-900 truncate">{p.name}</p>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                              {p.consultingType && (
                                <span className="px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 font-medium">
                                  {p.consultingType}
                                </span>
                              )}
                              {p.durationMinutes && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock size={11} strokeWidth={1.6} />
                                  {p.durationMinutes}분
                                </span>
                              )}
                              {mm && (
                                <span className="inline-flex items-center gap-0.5">
                                  <mm.Icon size={11} strokeWidth={1.6} />
                                  {mm.label}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[15px] font-extrabold" style={{ color: themeColor }}>
                              {formatPrice(p.price)}
                            </p>
                          </div>
                          <span
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0"
                            style={{ backgroundColor: `${themeColor}18`, color: themeColor }}
                          >
                            예약하기
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* 시간 선택 상담상품 (DirectProduct) */}
              {directProducts.length > 0 && (
                <>
                  {products.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-px bg-gray-100" />
                      <span className="text-[10px] text-gray-400 font-medium">즉시 예약</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  )}
                  <DirectProductSection
                    products={directProducts}
                    sellerId={seller.id}
                    themeColor={themeColor}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ───── 4. 상세 소개 ───── */}
      {(customization.intro || seller.shopDescription) && (
        <section className="mt-4 px-4">
          <div className="rounded-3xl border border-brand-100/70 bg-white p-4 shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} strokeWidth={1.8} style={{ color: themeColor }} />
              <h2 className="text-sm font-bold text-gray-900">{seller.shopName} 소개</h2>
            </div>
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
              {customization.intro || seller.shopDescription}
            </p>
          </div>
        </section>
      )}

      {/* ───── 5. 예약 달력 ───── */}
      <section className="mt-4 px-4">
        <ShopBookingCalendar
          sellerSlug={seller.slug}
          slots={daySlots}
          themeColor={themeColor}
          today={todayKey}
        />
      </section>

      {/* ───── 6. 콘텐츠 (feature 플래그) ───── */}
      {contents.length > 0 && (
        <section className="mt-4 px-4">
          <div className="rounded-3xl border border-brand-100/70 bg-white p-4 shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900">상담사 콘텐츠</h2>
              <Link href="/content" className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
                더보기 <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {contents.map((c) => {
                let thumb: string | null = null;
                try {
                  const arr = JSON.parse(c.images || "[]");
                  thumb = Array.isArray(arr) ? arr[0] ?? null : null;
                } catch {
                  thumb = null;
                }
                return (
                  <Link key={c.id} href={`/content/${c.id}`} className="group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                      <SafeImage
                        src={thumb}
                        placeholder={DEFAULT_PRODUCT_IMAGE}
                        alt={c.title}
                        width={160}
                        height={160}
                        fallbackText={c.title.charAt(0)}
                      />
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1 line-clamp-1 group-hover:text-gray-900">
                      {c.title}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="mt-5">
        <SellerShopFooter
          sellerInfo={{
            shopName: seller.shopName,
            businessType: seller.businessType,
            representativeName: seller.representativeName,
            businessRegistrationNo: seller.businessRegistrationNo,
            telecomSalesLicenseNo: seller.telecomSalesLicenseNo,
            businessAddress: seller.businessAddress,
            businessCategory: seller.businessCategory,
          }}
        />
      </div>

      <div className="h-16" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      <SellerShopBottomNav sellerSlug={seller.slug} />

      <style>{`
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          25% { transform: scale(1.08); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
          50% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); }
          75% { transform: scale(1.05); box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
        }
        .animate-heartbeat { animation: heartbeat 1.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
