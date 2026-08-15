import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import SafeImage from "@/components/shared/SafeImage";
import BrandWordmark from "@/components/shared/BrandWordmark";
import {
  SOCIAL_SHARE_IMAGE_PATH,
  absolutePublicUrl,
  resolveRequestOrigin,
} from "@/lib/siteUrl";
import { resolveSellerDisplayImage, DEFAULT_PRODUCT_IMAGE } from "@/lib/defaults";
import { getShopCustomization } from "@/lib/shopCustomization";
import { Clock, Video, CalendarCheck, Sparkles, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// /c/[slug] — 상담사 전용 짧은 예약 URL.
// 유튜브 설명란·고정댓글·인스타 프로필에 그대로 붙여 쓰는 랜딩 페이지.
// 위젯 QR 코드도 이 주소를 가리킨다.
// ─────────────────────────────────────────────

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

// consultantQuery 가 select 를 런타임에 바꾸므로 Prisma 가 product 타입을 좁혀주지 못한다.
// 두 select 의 합집합을 명시해 매핑 단계에서 타입을 되찾는다.
interface LandingProduct {
  id: string;
  name: string;
  basePrice: unknown; // Prisma.Decimal — Number() 로만 사용
  thumbnail: string | null;
  description: string | null;
  consultingType?: string;
  consultingMethod?: string;
  durationMinutes?: number;
}

function consultantQuery(productSelect: object) {
  return {
    user: { select: { id: true, name: true, avatar: true } },
    shopProducts: {
      where: { isActive: true, isApproved: true },
      include: { product: { select: productSelect } },
      orderBy: { displayOrder: "asc" as const },
    },
  };
}

/**
 * 상담사 + 상담상품 조회.
 * 상담 관련 컬럼(consultingType 등)이 아직 DB에 없는 환경에서도 랜딩 페이지가 죽지 않도록,
 * 실패하면 기본 컬럼만으로 한 번 더 조회한다. (이 URL 은 유튜브 설명란 등 외부에 배포된다)
 */
async function getConsultant(slug: string) {
  try {
    const full = await prisma.sellerProfile.findUnique({
      where: { slug },
      include: consultantQuery(CONSULTING_PRODUCT_SELECT),
    });
    return { seller: full, hasConsultingFields: true as const };
  } catch (e) {
    console.error("Consultant landing: 상담 컬럼 조회 실패, 기본 컬럼으로 폴백", e);
    const basic = await prisma.sellerProfile.findUnique({
      where: { slug },
      include: consultantQuery(BASE_PRODUCT_SELECT),
    });
    return { seller: basic, hasConsultingFields: false as const };
  }
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
  if (!seller) return { title: "사주메이트" };

  const custom = await getShopCustomization(seller.id);
  const title = `${seller.shopName}의 점집 - 사주메이트`;
  const description =
    custom.tagline || seller.shopDescription || `${seller.shopName}에게 지금 상담을 예약하세요.`;
  const origin = resolveRequestOrigin();
  const pageUrl = absolutePublicUrl(`/c/${slug}`, origin);
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

export default async function ConsultantLandingPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await Promise.resolve(params);
  const { seller, hasConsultingFields } = await getConsultant(slug);
  if (!seller || !seller.isApproved) notFound();

  const products = seller.shopProducts.map((sp) => {
    const p = sp.product as unknown as LandingProduct;
    return {
      id: p.id,
      name: p.name,
      price: Number(sp.sellerPrice ?? p.basePrice),
      thumbnail: p.thumbnail,
      description: p.description,
      consultingType: hasConsultingFields ? p.consultingType ?? null : null,
      consultingMethod: hasConsultingFields ? p.consultingMethod ?? null : null,
      durationMinutes: hasConsultingFields ? p.durationMinutes ?? null : null,
    };
  });

  // 점집 커스터마이징(한줄 소개·상세 소개·상담 분야 태그)
  const customization = await getShopCustomization(seller.id);

  // 상담 종류 태그 — 상담사가 지정한 분야 태그 + 등록된 상담상품의 consultingType 을 중복 없이 모은다.
  const consultingTags = Array.from(
    new Set([
      ...customization.tags,
      ...products.map((p) => p.consultingType).filter((t): t is string => !!t),
    ])
  );

  const bookHref = `/shop/${seller.slug}/book`;
  const avatar = resolveSellerDisplayImage(seller);

  return (
    <div className="animate-fade-in bg-gradient-to-b from-[#1a0b33] via-[#2d1b69] to-white min-h-screen">
      {/* ───── 상담사 프로필 헤더 ───── */}
      <section className="relative px-5 pt-8 pb-6 text-center overflow-hidden">
        {/* 별빛 장식 */}
        <Sparkles
          size={16}
          className="absolute top-6 left-8 text-amber-300/60 animate-pulse"
          aria-hidden="true"
        />
        <Sparkles
          size={12}
          className="absolute top-16 right-10 text-purple-200/50 animate-pulse"
          aria-hidden="true"
        />

        <div className="flex justify-center mb-4">
          <BrandWordmark size="sm" variant="light" className="opacity-80" />
        </div>

        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-purple-300/40 shadow-xl bg-white mx-auto">
            <SafeImage
              src={avatar}
              placeholder={resolveSellerDisplayImage(seller)}
              alt={seller.shopName}
              width={96}
              height={96}
              fallbackText={seller.shopName.charAt(0)}
            />
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold text-white tracking-tight">
          {seller.shopName}
        </h1>

        {customization.tagline && (
          <p className="mt-1.5 text-[13px] font-semibold text-amber-200/90 px-2">
            {customization.tagline}
          </p>
        )}

        {seller.shopDescription && (
          <p className="mt-2 text-[13px] text-purple-100/80 leading-relaxed line-clamp-2 px-2">
            {seller.shopDescription}
          </p>
        )}

        {/* 상담 종류 태그 */}
        {consultingTags.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {consultingTags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-purple-100 bg-white/10 border border-purple-200/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 메인 CTA */}
        <Link
          href={bookHref}
          className="mt-6 inline-flex items-center justify-center gap-2 w-full max-w-[320px] px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-[#2d1b69] font-extrabold text-[15px] shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-transform"
        >
          <CalendarCheck size={18} strokeWidth={2} />
          지금 상담 예약하기
        </Link>
      </section>

      {/* ───── 상담 상품 목록 ───── */}
      <section className="bg-white rounded-t-3xl px-4 pt-6 pb-8 min-h-[40vh]">
        <h2 className="text-base font-bold text-gray-900 mb-1">상담 메뉴</h2>
        <p className="text-[11px] text-gray-400 mb-4">
          원하는 상담을 선택하면 예약 화면으로 이동합니다
        </p>

        {products.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-400">아직 등록된 상담 상품이 없습니다.</p>
            <Link
              href={`/shop/${seller.slug}`}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2d1b69]"
            >
              상담사 점집 둘러보기
              <ChevronRight size={14} strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={bookHref}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-purple-200 hover:shadow-md active:scale-[0.99] transition-all"
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
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
                    {(p.durationMinutes || p.consultingMethod) && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                        {p.durationMinutes && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock size={11} strokeWidth={1.5} />
                            {p.durationMinutes}분
                          </span>
                        )}
                        {p.consultingMethod && (
                          <span className="inline-flex items-center gap-0.5">
                            <Video size={11} strokeWidth={1.5} />
                            {p.consultingMethod}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-[15px] font-extrabold text-[#2d1b69]">
                      {formatPrice(p.price)}
                    </p>
                  </div>

                  <ChevronRight size={16} strokeWidth={1.5} className="text-gray-300 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* ───── 상담사 소개 ───── */}
        {customization.intro && (
          <div className="mt-7 pt-6 border-t border-gray-100">
            <h2 className="text-base font-bold text-gray-900 mb-2">{seller.shopName} 소개</h2>
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
              {customization.intro}
            </p>
          </div>
        )}

        {/* ───── Powered by ───── */}
        <div className="mt-8 pt-5 border-t border-gray-100 text-center">
          <Link href="/" className="inline-flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-400 tracking-wide">Powered by</span>
            <BrandWordmark size="sm" />
          </Link>
        </div>
      </section>
    </div>
  );
}
