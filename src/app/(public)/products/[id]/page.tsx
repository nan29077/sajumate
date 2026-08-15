import { Icon } from '@/components/shared/Icon';
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import ShareButton from "@/components/shared/ShareButton";
import SafeImage from "@/components/shared/SafeImage";
import ProductBuySection from "@/components/shared/ProductBuySection";
import ProductImageGallery from "@/components/shared/ProductImageGallery";
import ProductDetailTabs from "@/components/shared/ProductDetailTabs";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}) {
  // Next.js 14.2+ 에서 params는 Promise일 수 있음
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  // 점집에서 진입한 경우(?ref=상담사slug) 뒤로가기를 해당 점집 메인으로 연결
  const refSlug = typeof resolvedSearchParams.ref === "string" ? resolvedSearchParams.ref : null;
  const backHref = refSlug ? `/shop/${refSlug}` : "/";
  // 라이브 시청화면(?from=live)에서 진입한 경우에만 뒤로가기 버튼 숨김
  const fromLive = resolvedSearchParams.from === "live";
  // 라이브 팝업(iframe, ?embedded=true) 또는 라이브 진입 시 상단 헤더 전체 숨김
  const embedded = resolvedSearchParams.embedded === "true";
  const hideChrome = fromLive || embedded;
  // 라이브에서 진입 시 URL에 상담사ID 포함 → 점집 미등록 상담상품도 구매 가능하도록 폴백
  const sellerIdFromUrl = typeof resolvedSearchParams.sellerId === "string" ? resolvedSearchParams.sellerId : null;
  const id = resolvedParams.id;
  // id가 유효한지 먼저 확인
  if (!id || typeof id !== "string" || id.length < 1) {
    notFound();
  }

  let product;
  try {
    product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
        images: { orderBy: { sortOrder: "asc" } },
        reviews: {
          include: { user: { select: { name: true, avatar: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        sellerProducts: {
          where: { isActive: true },
          include: { seller: { select: { id: true, shopName: true, shopLogo: true, slug: true, category: true } } },
          take: 5,
        },
      },
    });
  } catch (e: any) {
    console.error("Product fetch error:", e?.message || e);
    // Prisma 오류 (잘못된 ID 형식 등)는 notFound로 처리
    notFound();
  }

  if (!product) notFound();

  // Safely convert all Decimal values to numbers to prevent serialization errors
  const basePrice = Number(product.basePrice) || 0;
  const comparePrice = product.comparePrice ? Number(product.comparePrice) : null;

  // (배송 관련 변수 제거됨 — 상담 서비스는 배송 없음)

  const allImages = product.images.length > 0
    ? product.images.map((img) => img.url)
    : product.thumbnail
      ? [product.thumbnail]
      : [];

  const avgRating = product.reviews.length > 0
    ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
    : 0;

  // 라이브에서 진입 시 sellerIdFromUrl을 최우선 적용 (상담사 미등록 상담상품도 구매 가능하도록)
  const defaultSellerId = sellerIdFromUrl
    || product.sellerProducts[0]?.sellerId
    || null;

  // Serialize variant data
  const variants = product.variants.map(v => ({
    id: v.id,
    name: v.name,
    price: Number(v.price) || 0,
  }));

  // 다차원 옵션 그룹 파싱
  let optionGroups: { groupName: string; options: string[] }[] = [];
  try {
    const raw = (product as any).optionGroups;
    if (raw) optionGroups = JSON.parse(raw);
  } catch {};

  // Serialize seller products
  const sellerProducts = product.sellerProducts.map(sp => ({
    id: sp.id,
    sellerId: sp.sellerId,
    sellerPrice: sp.sellerPrice != null ? Number(sp.sellerPrice) : null,
    seller: {
      shopName: sp.seller.shopName,
      shopLogo: sp.seller.shopLogo,
      slug: sp.seller.slug,
      category: sp.seller.category,
    },
  }));

  // refSlug 또는 sellerIdFromUrl 기준으로 상담사 판매가 결정
  const refSellerProduct = refSlug
    ? sellerProducts.find(sp => sp.seller.slug === refSlug)
    : sellerIdFromUrl
      ? sellerProducts.find(sp => sp.sellerId === sellerIdFromUrl)
      : null;
  const displayPrice = refSellerProduct?.sellerPrice ?? basePrice;
  const effectiveComparePrice = comparePrice;
  const discountPercent = effectiveComparePrice && effectiveComparePrice > displayPrice
    ? Math.round((1 - displayPrice / effectiveComparePrice) * 100)
    : 0;

  // Build reviews HTML for tabs component
  const reviewsHtml = product.reviews.map(r => `
    <div class="pb-3 border-b border-gray-100 last:border-0 mb-3">
      <div class="flex items-center gap-2 mb-1.5">
        <div class="flex gap-0.5">
          ${Array.from({ length: 5 }).map((_, i) =>
            `<svg width="10" height="10" viewBox="0 0 24 24" fill="${i < r.rating ? 'black' : 'none'}" stroke="${i < r.rating ? 'black' : '#e5e7eb'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
          ).join('')}
        </div>
        <span class="text-[11px] text-gray-500 font-medium">${r.user.name || '익명'}</span>
        <span class="text-[10px] text-gray-300">${new Date(r.createdAt).toLocaleDateString('ko-KR')}</span>
      </div>
      <p class="text-sm text-gray-700 leading-relaxed">${r.content}</p>
    </div>
  `).join('');

  return (
    <div className="animate-fade-in pb-32 bg-white">
      {/* ── Sticky Header (라이브 팝업/라이브 진입 시 전체 숨김) ── */}
      {!hideChrome && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
          <div className="flex items-center justify-between px-3 h-14">
            <Link href={backHref} className="-ml-1 p-1.5 text-gray-900 hover:opacity-60 transition-opacity" aria-label="뒤로 가기">
              <Icon name="ArrowRight" size={28} strokeWidth={1.5} className="rotate-180" />
            </Link>
            <ShareButton title={product.name} />
          </div>
        </div>
      )}

      {/* ── Product Images Gallery (Client Component) ── */}
      <ProductImageGallery images={allImages} productName={product.name} />

      {/* ── 상담상품명 ── */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-[17px] font-semibold text-gray-900 leading-snug">
          {product.name}
        </h1>

        {/* Rating */}
        {avgRating > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon name="Star" key={i} size={12} className={i < Math.round(avgRating) ? "fill-black text-black" : "text-gray-200"} />
              ))}
            </div>
            <span className="text-xs text-gray-500">{avgRating.toFixed(1)}</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">후기 {product.reviews.length}</span>
          </div>
        )}
      </div>

      {/* ── Price Block ── */}
      <div className="px-4 pb-4">
        <div className="flex items-baseline gap-2">
          {discountPercent > 0 && (
            <span className="text-xl font-bold text-red-500">{discountPercent}%</span>
          )}
          <span className="text-xl font-bold text-gray-900">
            {formatPrice(displayPrice)}
          </span>
          {discountPercent > 0 && effectiveComparePrice && (
            <span className="text-sm text-gray-400 line-through">
              {formatPrice(effectiveComparePrice)}
            </span>
          )}
        </div>
      </div>

      <div className="h-2 bg-gray-50" />


      {/* ── 상담 안내 ── */}
      <div className="px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Icon name="Calendar" size={18} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
            <span>결제 완료 후 예약 즉시 확정</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Icon name="Certified" size={18} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
            <span>상담 시작 전 전액 취소·환불 가능</span>
          </div>
        </div>
      </div>

      <div className="h-2 bg-gray-50" />

      {/* ── Variants / Options + Seller Info + Tabs + Fixed Bottom Bar ──
          옵션 선택 상태를 하단 구매 버튼과 공유하기 위해 클라이언트 컴포넌트로 묶음 */}
      <ProductBuySection
        productId={product.id}
        basePrice={displayPrice}
        variants={variants}
        optionGroups={optionGroups}
        defaultSellerId={defaultSellerId}
        campaign={null}
        fromLive={fromLive}
        productName={product.name}
      >
      {/* ── Seller Info ── */}
      {sellerProducts.length > 0 && (
        <>
          <div className="px-4 py-4">
            <h2 className="text-[15px] font-bold text-gray-900 mb-3">판매 상담사</h2>
            <div className="space-y-2">
              {sellerProducts.map((sp) => (
                <Link
                  key={sp.id}
                  href={`/shop/${sp.seller.slug}`}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white flex-shrink-0">
                    <SafeImage src={sp.seller.shopLogo} alt={sp.seller.shopName} width={40} height={40} fallbackText={sp.seller.shopName.charAt(0)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{sp.seller.shopName}</p>
                    {sp.seller.category && <p className="text-xs text-gray-400 truncate">{sp.seller.category}</p>}
                  </div>
                  <Icon name="ChevronDown" size={16} className="text-gray-300 -rotate-90" />
                </Link>
              ))}
            </div>
          </div>
          <div className="h-2 bg-gray-50" />
        </>
      )}

      {/* ── Tabbed Detail / Reviews / Shipping Info ── */}
      <ProductDetailTabs
        description={product.description}
        detailContent={product.detailContent}
        reviewCount={product.reviews.length}
        reviewsHtml={reviewsHtml}
        embedded={hideChrome}
      />

      </ProductBuySection>
    </div>
  );
}
