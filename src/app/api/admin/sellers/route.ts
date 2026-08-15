import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT: 상담사 판매 수수료율 수정
export async function PUT(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sellerId, commissionRate } = body;

    if (!sellerId) {
      return NextResponse.json({ error: "상담사 ID가 필요합니다." }, { status: 400 });
    }

    // 값이 넘어온 필드만 부분 업데이트
    const data: Record<string, unknown> = {};
    if (commissionRate !== undefined) {
      const c = Number(commissionRate);
      data.commissionRate = Number.isFinite(c) && c >= 0 && c <= 100 ? c : 0;
    }

    const seller = await prisma.sellerProfile.update({
      where: { id: sellerId },
      data,
    });

    return NextResponse.json({ success: true, seller });
  } catch (error) {
    console.error("Seller margin update error:", error);
    return NextResponse.json(
      { error: "상담사 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}
