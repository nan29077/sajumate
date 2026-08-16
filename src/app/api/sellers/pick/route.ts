import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: Toggle pick (follow/unfollow) a seller
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const { sellerId } = await req.json();
    if (!sellerId) {
      return NextResponse.json({ error: "sellerId 필수" }, { status: 400 });
    }

    // Get or create buyer profile
    let buyerProfile = await prisma.buyerProfile.findUnique({
      where: { userId: session.user!.id },
    });
    if (!buyerProfile) {
      buyerProfile = await prisma.buyerProfile.create({
        data: { userId: session.user!.id },
      });
    }

    // Check existing follow
    const existing = await prisma.sellerFollower.findUnique({
      where: {
        buyerId_sellerId: {
          buyerId: buyerProfile.id,
          sellerId,
        },
      },
    });

    if (existing) {
      // Unfollow — 팔로우 삭제와 팬 수 감소를 트랜잭션으로 묶어 드리프트 방지
      await prisma.$transaction([
        prisma.sellerFollower.delete({ where: { id: existing.id } }),
        prisma.sellerProfile.update({
          where: { id: sellerId },
          data: { totalFans: { decrement: 1 } },
        }),
      ]);
      return NextResponse.json({ picked: false });
    } else {
      // Follow — 팔로우 생성과 팬 수 증가를 트랜잭션으로 묶어 드리프트 방지
      await prisma.$transaction([
        prisma.sellerFollower.create({
          data: {
            buyerId: buyerProfile.id,
            sellerId,
          },
        }),
        prisma.sellerProfile.update({
          where: { id: sellerId },
          data: { totalFans: { increment: 1 } },
        }),
      ]);
      return NextResponse.json({ picked: true });
    }
  } catch (error) {
    console.error("Pick error:", error);
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}

// GET: Check if current user has picked a seller
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ picked: false });
    }

    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get("sellerId");
    if (!sellerId) {
      return NextResponse.json({ picked: false });
    }

    const buyerProfile = await prisma.buyerProfile.findUnique({
      where: { userId: session.user!.id },
    });
    if (!buyerProfile) {
      return NextResponse.json({ picked: false });
    }

    const existing = await prisma.sellerFollower.findUnique({
      where: {
        buyerId_sellerId: {
          buyerId: buyerProfile.id,
          sellerId,
        },
      },
    });

    return NextResponse.json({ picked: !!existing });
  } catch {
    return NextResponse.json({ picked: false });
  }
}
