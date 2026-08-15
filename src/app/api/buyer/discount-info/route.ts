import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 특정 상담사에서 현재 고객이 받을 수 있는 할인 정보
// 추천인/픽(채널인증) 할인은 2026-07 폐지 — 장바구니 할인 설정만 반환한다.
// - cartDiscount: 장바구니 할인 설정 (금액 조건은 클라이언트가 소계로 판정, 확정 계산은 api/orders)
// - discount/potentialDiscount 키는 구버전 클라이언트 호환을 위해 null 로 유지.
export async function GET(req: NextRequest) {
  const empty = { discount: null, potentialDiscount: null, cartDiscount: null };

  const session = await auth();
  if (!session) return NextResponse.json(empty);

  const { searchParams } = new URL(req.url);
  const sellerId = searchParams.get("sellerId");
  if (!sellerId) return NextResponse.json(empty);

  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      cartDiscountEnabled: true,
      cartDiscountThreshold: true,
      cartDiscountRate: true,
    },
  });
  if (!seller) return NextResponse.json(empty);

  // 장바구니 할인 설정 (스위치 켜짐 + 유효값일 때만 노출)
  const cartDiscount =
    seller.cartDiscountEnabled &&
    Number(seller.cartDiscountRate) > 0 &&
    Number(seller.cartDiscountThreshold) > 0
      ? {
          threshold: Number(seller.cartDiscountThreshold),
          rate: Number(seller.cartDiscountRate),
          label: "묶음 예약 할인",
        }
      : null;

  return NextResponse.json({ discount: null, potentialDiscount: null, cartDiscount });
}
