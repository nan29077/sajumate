import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { releaseTimeSlot } from "@/lib/timeSlotUtils";

export const dynamic = "force-dynamic";

// 결제 시작 전/중 사용자가 취소했거나 결제 준비가 실패한 경우, PENDING 예약을 정리.
// 캠페인 카운터·추천 커미션도 함께 롤백한다.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const order = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: { items: true, referralCommissions: true },
  });
  if (!order) {
    return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (order.userId !== session.user!.id) {
    return NextResponse.json({ error: "본인 예약만 취소할 수 있습니다." }, { status: 403 });
  }
  if (order.paymentStatus === "COMPLETED") {
    return NextResponse.json({ error: "이미 결제 완료된 예약은 취소 API로 처리하세요." }, { status: 400 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  await prisma.$transaction(async (tx) => {
    // 캠페인 카운터 롤백
    if (order.campaignId) {
      const totalQty = order.items.reduce((acc, i) => acc + i.quantity, 0);
      await tx.groupBuyCampaign.update({
        where: { id: order.campaignId },
        data: {
          participantCount: { decrement: 1 },
          currentQuantity: { decrement: totalQty },
          totalRevenue: { decrement: Number(order.finalAmount) },
        },
      });
    }

    // 추천 커미션 PENDING 롤백
    for (const c of order.referralCommissions) {
      if (c.status === "PENDING") {
        await tx.referralCommission.delete({ where: { id: c.id } });
        await tx.sellerProfile.update({
          where: { id: c.sellerId },
          data: { totalReferralEarnings: { decrement: Number(c.commissionAmount) } },
        });
      }
    }

    // 타임슬롯 해제 — 예약과 연결된 슬롯을 재예약 가능 상태로 되돌린다
    await releaseTimeSlot(order.id, tx);

    await tx.reservation.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        paymentStatus: "FAILED",
        cancelledAt: new Date(),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
