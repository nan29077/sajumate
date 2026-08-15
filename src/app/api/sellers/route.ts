import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const where: any = { isApproved: true };
  if (category) where.category = category;

  const [sellers, total] = await Promise.all([
    prisma.sellerProfile.findMany({
      where,
      include: {
        user: { select: { name: true, avatar: true } },
        _count: { select: { shopProducts: true, fans: true, followers: true } },
      },
      orderBy: { totalFans: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.sellerProfile.count({ where }),
  ]);

  return NextResponse.json({
    sellers: sellers.map((s) => ({
      id: s.id,
      slug: s.slug,
      shopName: s.shopName,
      shopDescription: s.shopDescription,
      shopBanner: s.shopBanner,
      shopLogo: s.shopLogo,
      category: s.category,
      mood: s.mood,
      instagramUrl: s.instagramUrl,
      youtubeUrl: s.youtubeUrl,
      totalFans: s.totalFans,
      totalSales: Number(s.totalSales),
      _count: s._count,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
