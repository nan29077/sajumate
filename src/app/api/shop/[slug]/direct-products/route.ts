import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 공개 API: 점집의 노출(isEnabled=true) + 선택된 활성 일반상담상품 목록 반환
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await Promise.resolve(params);

  const seller = await prisma.sellerProfile.findUnique({
    where: { slug },
    select: { id: true, isApproved: true, shopExposure: true },
  });
  if (!seller || !seller.isApproved) return NextResponse.json({ products: [] });

  const exposure = seller.shopExposure;
  if (!exposure || !exposure.isEnabled) return NextResponse.json({ products: [] });

  const selectedIds: string[] = (() => { try { return JSON.parse(exposure.productIds || "[]"); } catch { return []; } })();
  if (selectedIds.length === 0) return NextResponse.json({ products: [] });

  const products = await prisma.directProduct.findMany({
    where: { sellerId: seller.id, id: { in: selectedIds }, isActive: true },
  });

  // 상담사가 지정한 선택 순서 유지
  const orderMap = new Map(selectedIds.map((id, idx) => [id, idx]));
  const sorted = products.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return NextResponse.json({
    products: sorted.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      description: p.description,
      shippingFee: Number(p.shippingFee),
      images: (() => { try { return JSON.parse(p.images || "[]"); } catch { return []; } })(),
      stock: p.stock,
    })),
  });
}
