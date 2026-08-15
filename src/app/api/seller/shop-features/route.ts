import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  if (session.user?.role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 접근 가능" }, { status: 403 });

  const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
  if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

  const body = await req.json();
  const { content, liveCommerce } = body;

  await prisma.sellerProfile.update({
    where: { id: seller.id },
    data: {
      featureGroupBuy: false,
      featureContent: Boolean(content),
      featureLiveCommerce: Boolean(liveCommerce),
    },
  });

  return NextResponse.json({ success: true });
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  if (session.user?.role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 접근 가능" }, { status: 403 });

  const seller = await prisma.sellerProfile.findUnique({
    where: { userId: session.user!.id },
    select: { featureGroupBuy: true, featureContent: true, featureLiveCommerce: true },
  });

  return NextResponse.json({
    content: seller?.featureContent ?? true,
    liveCommerce: seller?.featureLiveCommerce ?? false,
  });
}
