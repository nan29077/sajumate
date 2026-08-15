import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/safeDb";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      buyerProfile: {
        include: {
          follows: {
            include: {
              seller: {
                select: {
                  id: true, shopName: true, slug: true, shopLogo: true, pickDiscountRate: true, isManualLive: true,
                  user: { select: { avatar: true } },
                  liveStreams: { where: { status: "LIVE" }, take: 1, select: { id: true, shareCode: true } },
                },
              },
            },
          },
        },
      },
      wishlists: {
        include: {
          product: {
            include: {
              sellerProducts: {
                where: { isActive: true },
                include: { seller: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      sellerProfile: { select: { id: true, isApproved: true } },
      _count: { select: { reviews: true, cartItems: true, wishlists: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "유저 없음" }, { status: 404 });

  // 예약 조회는 운영 DB에 reservations 테이블이 아직 없을 수 있어(P2021)
  // 메인 include에서 분리해 safeQuery 폴백으로 감싼다.
  const [reservations, reservationCount] = await Promise.all([
    safeQuery(
      "my overview reservations",
      () =>
        prisma.reservation.findMany({
          where: { userId },
          include: { seller: true, items: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      [],
    ),
    safeQuery("my overview reservation count", () => prisma.reservation.count({ where: { userId } }), 0),
  ]);

  const gameCouponCount = await prisma.userGameCoupon.count({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
  });

  // Decimal → number 직렬화
  const wishlists = user.wishlists.map((w) => ({
    ...w,
    product: {
      ...w.product,
      basePrice: Number(w.product.basePrice),
      comparePrice: w.product.comparePrice ? Number(w.product.comparePrice) : null,
    },
  }));

  const orders = reservations.map((o) => ({
    ...o,
    finalAmount: Number(o.finalAmount),
    discountAmount: o.discountAmount ? Number(o.discountAmount) : null,
    createdAt: o.createdAt.toISOString(),
  }));

  const pickedSellers = user.buyerProfile?.follows || [];

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
    counts: { ...user._count, reservations: reservationCount },
    orders,
    wishlists,
    pickedSellers: pickedSellers.map((f) => ({
      seller: {
        ...f.seller,
        liveStreams: f.seller.liveStreams,
      },
    })),
    gameCouponCount,
    sellerApplied: !!user.sellerProfile,
  });
}
