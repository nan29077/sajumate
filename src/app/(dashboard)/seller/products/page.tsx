import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SellerConsultProducts, { type ConsultProduct } from "@/components/seller/SellerConsultProducts";

export const dynamic = "force-dynamic";

// 상담사 상담상품 관리 — DirectProduct(영상/전화/방문 상담) 목록만 다룬다.
export default async function SellerProductsPage() {
  const session = await auth();
  if (session?.user?.role !== "CONSULTANT") redirect("/");

  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: session!.user!.id },
    select: { id: true },
  });
  if (!seller) redirect("/");

  const rows = await prisma.directProduct.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
  });

  const initialProducts: ConsultProduct[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    description: p.description,
    images: (() => {
      try {
        const parsed = JSON.parse(p.images || "[]");
        return Array.isArray(parsed) ? parsed.filter((u: unknown): u is string => typeof u === "string") : [];
      } catch {
        return [];
      }
    })(),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="animate-fade-in">
      <div className="mb-5 pt-1">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">상담상품 관리</h1>
        <p className="text-xs text-gray-400 mt-0.5">영상·전화·방문 상담 상품을 등록하고 관리합니다.</p>
      </div>

      <SellerConsultProducts initialProducts={initialProducts} />
    </div>
  );
}
