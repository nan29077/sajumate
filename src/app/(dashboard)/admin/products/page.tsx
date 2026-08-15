import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminProductsClient from "@/components/admin/AdminProductsClient";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/");

  const [products, pendingShopProducts, soldSellerProducts, sellers, shopSellerRows, activeSellerRows] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: true,
        registrarSeller: { select: { shopName: true } },
        _count: { select: { reviews: true, sellerProducts: true, chats: true, wishlists: true } },
        sellerProducts: {
          include: { seller: { select: { id: true, shopName: true, shopLogo: true } } },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 관리자 카탈로그 상담상품에 대한 상담사 승인 대기 목록.
    prisma.sellerShopProduct.findMany({
      where: {
        isApproved: false,
        rejectionReason: null,
        product: { sellerId: null },
      },
      include: {
        product: { include: { category: true } },
        seller: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 판매 중인 상담상품 — 최고관리자가 승인해 상담사가 현재 판매 중(승인+활성)인 상담상품
    prisma.sellerShopProduct.findMany({
      where: {
        isApproved: true,
        isActive: true,
        product: { sellerId: null },
      },
      include: {
        product: { select: { id: true, name: true, thumbnail: true } },
        seller: { select: { shopName: true, shopLogo: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // 상담사별 필터용 목록
    prisma.sellerProfile.findMany({
      select: { id: true, shopName: true },
      orderBy: { shopName: "asc" },
    }),
    // 상담상품별 상담사 점집 매핑 (상담사별 필터용)
    prisma.sellerShopProduct.findMany({
      select: { productId: true, sellerId: true },
    }),
    // 판매중(승인+활성) 상담사 매핑 — "판매중" 탭 필터용
    prisma.sellerShopProduct.findMany({
      where: { isApproved: true, isActive: true },
      select: {
        productId: true,
        seller: { select: { id: true, shopName: true, shopLogo: true } },
      },
    }),
  ]);

  // 상담상품ID → 해당 상담상품이 담긴 상담사 점집 sellerId 목록
  const shopSellerMap = new Map<string, string[]>();
  for (const row of shopSellerRows) {
    const list = shopSellerMap.get(row.productId) ?? [];
    list.push(row.sellerId);
    shopSellerMap.set(row.productId, list);
  }

  // 상담상품ID → 판매중(승인+활성) 상담사 목록
  const activeSellerMap = new Map<string, { id: string; shopName: string; shopLogo: string | null }[]>();
  for (const row of activeSellerRows) {
    const list = activeSellerMap.get(row.productId) ?? [];
    list.push({ id: row.seller.id, shopName: row.seller.shopName, shopLogo: row.seller.shopLogo });
    activeSellerMap.set(row.productId, list);
  }

  const serializedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    basePrice: Number(p.basePrice),
    supplyPrice: p.supplyPrice != null ? Number(p.supplyPrice) : null,
    thumbnail: p.thumbnail,
    isApproved: p.isApproved,
    isActive: p.isActive,
    brandName: null,
    registrarSellerId: p.sellerId,
    shopSellerIds: shopSellerMap.get(p.id) ?? [],
    categoryName: p.category?.name || null,
    // 등록자 유형: 상담사 > 관리자
    registrarType: (p.sellerId ? "CONSULTANT" : "ADMIN") as "CONSULTANT" | "ADMIN",
    registeredBy: p.sellerId ? `상담사 (${p.registrarSeller?.shopName || ""})` : "관리자",
    sellerNames: p.sellerProducts.map(sp => sp.seller.shopName),
    sellerCount: p._count.sellerProducts,
    reviewCount: p._count.reviews,
    chatCount: p._count.chats,
    soldCount: p.soldCount,
    wishlistCount: p._count.wishlists,
    createdAt: p.createdAt.toISOString(),
    sellerLogos: p.sellerProducts.map(sp => ({ id: sp.seller.id, shopName: sp.seller.shopName, shopLogo: sp.seller.shopLogo })),
    // 판매중(승인+활성) 상담사 정보
    activeSellers: (activeSellerMap.get(p.id) ?? []).slice(0, 5),
    isSelling: (activeSellerMap.get(p.id) ?? []).length > 0,
  }));

  const serializedPending = pendingShopProducts.map((sp) => ({
    id: sp.id,
    productId: sp.product.id,
    productName: sp.product.name,
    productThumbnail: sp.product.thumbnail,
    brandName: null,
    sellerName: sp.seller.shopName,
    sellerPrice: sp.sellerPrice != null ? Number(sp.sellerPrice) : null,
    createdAt: sp.createdAt.toISOString(),
  }));

  const serializedSold = soldSellerProducts.map((sp) => ({
    id: sp.id,
    productId: sp.product.id,
    productName: sp.product.name,
    productThumbnail: sp.product.thumbnail,
    sellerName: sp.seller.shopName,
    sellerShopLogo: sp.seller.shopLogo || null,
    sellerPrice: sp.sellerPrice != null ? Number(sp.sellerPrice) : null,
    approvedAt: sp.createdAt.toISOString(),
  }));

  const serializedSellers = sellers.map((s) => ({ id: s.id, shopName: s.shopName }));

  return (
    <div className="animate-fade-in">
      <AdminProductsClient
        products={serializedProducts}
        pendingShopProducts={serializedPending}
        soldSellerProducts={serializedSold}
        brands={[]}
        sellers={serializedSellers}
      />
    </div>
  );
}
