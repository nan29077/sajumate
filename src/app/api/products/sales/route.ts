import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "상담상품 정보가 필요합니다." }, { status: 400 });

  const productInfo = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, thumbnail: true, basePrice: true, supplyPrice: true, soldCount: true },
  });
  if (!productInfo) return NextResponse.json({ error: "상담상품을 찾을 수 없습니다." }, { status: 404 });

  const [sellerProducts, reservations] = await Promise.all([
    prisma.sellerShopProduct.findMany({
      where: { productId },
      include: { seller: { select: { id: true, shopName: true, shopLogo: true, slug: true } } },
    }),
    prisma.reservation.findMany({
      where: { items: { some: { productId } }, paymentStatus: "COMPLETED" },
      include: {
        seller: { select: { id: true, shopName: true, shopLogo: true, slug: true } },
        items: { where: { productId } },
      },
    }),
  ]);

  type SellerSales = {
    sellerId: string;
    shopName: string;
    shopLogo: string | null;
    slug: string;
    totalOrders: number;
    totalQuantity: number;
    totalRevenue: number;
    isShopProduct: boolean;
  };
  const bySeller: Record<string, SellerSales> = {};

  for (const item of sellerProducts) {
    bySeller[item.seller.id] = {
      sellerId: item.seller.id,
      shopName: item.seller.shopName,
      shopLogo: item.seller.shopLogo,
      slug: item.seller.slug,
      totalOrders: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      isShopProduct: true,
    };
  }

  for (const reservation of reservations) {
    const current = bySeller[reservation.sellerId] ?? {
      sellerId: reservation.sellerId,
      shopName: reservation.seller.shopName,
      shopLogo: reservation.seller.shopLogo,
      slug: reservation.seller.slug,
      totalOrders: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      isShopProduct: false,
    };
    current.totalOrders += 1;
    for (const item of reservation.items) {
      current.totalQuantity += item.quantity;
      current.totalRevenue += Number(item.totalPrice);
    }
    bySeller[reservation.sellerId] = current;
  }

  const sellerSales = Object.values(bySeller).sort((a, b) => b.totalRevenue - a.totalRevenue);
  return NextResponse.json({
    product: {
      ...productInfo,
      basePrice: Number(productInfo.basePrice),
      supplyPrice: productInfo.supplyPrice == null ? null : Number(productInfo.supplyPrice),
    },
    sellerSales,
    totalSellers: sellerSales.length,
    totalOrders: sellerSales.reduce((sum, seller) => sum + seller.totalOrders, 0),
    totalRevenue: sellerSales.reduce((sum, seller) => sum + seller.totalRevenue, 0),
  });
}
