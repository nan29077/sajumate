import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/utils";
import { getShopAwareLoginPath } from "@/lib/shopLoginRedirect";
import CheckoutClient from "./CheckoutClient";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: {
    type?: string;
    productId?: string;
    variantId?: string;
    sellerId?: string;
    campaignId?: string;
    quantity?: string;
  };
}) {
  const session = await auth();
  if (!session) redirect(getShopAwareLoginPath());

  const { type, productId, variantId, sellerId, quantity } = searchParams;
  if (!productId || !sellerId) redirect("/");

  const qty = Math.max(1, parseInt(quantity || "1", 10) || 1);

  // ── 상담사 일반상담상품(DirectProduct) 결제 ──
  // 카탈로그 Product 가 아닌 별도 모델이라 조회 경로가 다르다.
  // 옵션(variant)·단체 상담 캠페인은 일반상담상품에 존재하지 않으므로 무시한다.
  if (type === "direct") {
    const [direct, directSeller] = await Promise.all([
      prisma.directProduct.findUnique({
        where: { id: productId },
        select: { id: true, name: true, images: true, price: true, isActive: true, sellerId: true },
      }),
      prisma.sellerProfile.findUnique({ where: { id: sellerId }, select: { id: true, shopName: true } }),
    ]);
    // 상담상품이 없거나 비활성이거나, 다른 상담사의 상담상품을 이 상담사 이름으로 사려는 경우 차단
    // (상담 서비스라 재고 검증은 하지 않는다)
    if (!direct || !direct.isActive || !directSeller || direct.sellerId !== directSeller.id) redirect("/");

    const images = parseJsonArray(direct.images);

    return (
      <CheckoutClient
        item={{
          itemType: "DIRECT",
          productId: direct.id,
          name: direct.name,
          thumbnail: images[0] || null,
          sellerId: directSeller.id,
          sellerName: directSeller.shopName,
          variantId: null,
          variantName: null,
          campaignId: null,
          campaignTitle: null,
          price: Number(direct.price),
          quantity: qty,
          isCampaign: false,
          // 상담 서비스라 배송비가 없다.
          shippingFee: 0,
          freeShipping: true,
          freeShippingThreshold: null,
        }}
      />
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      thumbnail: true,
      basePrice: true,
    },
  });
  if (!product) redirect("/");

  let variantInfo: { id: string; name: string; price: number } | null = null;
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, name: true, price: true },
    });
    if (variant) {
      variantInfo = {
        id: variant.id,
        name: variant.name,
        price: Number(variant.price),
      };
    }
  }

  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { id: true, shopName: true },
  });
  if (!seller) redirect("/");

  const price = variantInfo?.price ?? Number(product.basePrice);

  const item = {
    itemType: "PRODUCT" as const,
    productId: product.id,
    name: product.name,
    thumbnail: product.thumbnail,
    sellerId: seller.id,
    sellerName: seller.shopName,
    variantId: variantInfo?.id || null,
    variantName: variantInfo?.name || null,
    campaignId: null,
    campaignTitle: null,
    price,
    quantity: qty,
    isCampaign: false,
    // 상담 방식 설정 (상담상품 기준)
    shippingFee: 0,
    freeShipping: true,
    freeShippingThreshold: null,
  };

  return <CheckoutClient item={item} />;
}
