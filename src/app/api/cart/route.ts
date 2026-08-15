import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 장바구니 조회
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const items = await prisma.cartItem.findMany({
    where: { userId: session.user!.id, campaignId: null },
    include: {
      product: true,
      variant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      sellerId: item.sellerId,
      campaignId: item.campaignId,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        thumbnail: item.product.thumbnail,
        basePrice: Number(item.product.basePrice),
      },
      variant: item.variant
        ? {
            id: item.variant.id,
            name: item.variant.name,
            price: Number(item.variant.price),
              }
        : null,
    })),
  });
}

// 장바구니 추가
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { productId, variantId, sellerId, quantity = 1 } = await request.json();

  if (!productId || !sellerId) {
    return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
  }

  // upsert: 같은 상담상품+옵션+상담사+캠페인 조합이면 수량 증가
  const existing = await prisma.cartItem.findFirst({
    where: {
      userId: session.user!.id,
      productId,
      variantId: variantId || null,
      sellerId,
      campaignId: null,
    },
  });

  if (existing) {
    const updated = await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    });
    return NextResponse.json({ item: updated });
  }

  const item = await prisma.cartItem.create({
    data: {
      userId: session.user!.id,
      productId,
      variantId: variantId || null,
      sellerId,
      campaignId: null,
      quantity,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}

// 장바구니 수량 변경
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { itemId, quantity } = await request.json();

  if (!itemId || !quantity || quantity < 1) {
    return NextResponse.json({ error: "올바르지 않은 요청입니다." }, { status: 400 });
  }

  const updated = await prisma.cartItem.updateMany({
    where: { id: itemId, userId: session.user!.id },
    data: { quantity },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// 장바구니 삭제
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { itemId } = await request.json();

  await prisma.cartItem.deleteMany({
    where: { id: itemId, userId: session.user!.id },
  });

  return NextResponse.json({ success: true });
}
