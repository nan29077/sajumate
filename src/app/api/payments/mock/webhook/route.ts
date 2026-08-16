import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMockPgEnabled, verifyMockWebhook } from "@/lib/mockPg";
import { logPayment } from "@/lib/paymentLog";
import { notifyOrderPaid } from "@/lib/notifications";
import { notifyOrderPlacedToSeller, notifyReservationConfirmedToCustomer } from "@/lib/alimtalkTriggers";
import { ensureConsultingSession } from "@/lib/consultingSession";

export const dynamic = "force-dynamic";

// Mock PG 웹훅 — 실제 PG의 서버통지(ONGI callback 등)와 동일한 처리 흐름을 시뮬레이션한다.
// body: { reservationId, result: "success"|"fail", timestamp, signature }
// 시그니처는 HMAC-SHA256 서명으로 검증한다 (5분 유효).
export async function POST(request: Request) {
  if (!isMockPgEnabled()) {
    return NextResponse.json({ error: "Mock PG가 비활성화되어 있습니다." }, { status: 404 });
  }

  let body: {
    reservationId?: string;
    result?: "success" | "fail";
    timestamp?: number;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const { reservationId, result, timestamp, signature } = body;
  if (!reservationId || !result || !timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }

  // 시그니처 검증
  const verdict = verifyMockWebhook({ reservationId, result, timestamp }, signature);
  if (!verdict.ok) {
    await logPayment({
      orderId: reservationId,
      provider: "mock",
      stage: "webhook",
      status: "fail",
      message: `시그니처 검증 실패: ${verdict.reason}`,
    });
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const order = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!order) {
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  // 멱등 — 이미 완료된 예약이면 추가 처리 없이 종료
  if (order.paymentStatus === "COMPLETED") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const mockTid = `MOCK-${reservationId.slice(-8)}-${timestamp}`;

  if (result === "fail") {
    await prisma.reservation.update({
      where: { id: order.id },
      data: {
        paymentStatus: "FAILED",
        pgProvider: "mock",
        pgTid: mockTid,
        pgAuthData: JSON.stringify({ mock: true, result: "fail", timestamp }),
      },
    });
    await logPayment({
      orderId: order.id,
      provider: "mock",
      stage: "webhook",
      status: "fail",
      message: "Mock 결제 실패 시뮬레이션",
      pgTid: mockTid,
    });
    return NextResponse.json({ ok: true, result: "fail" });
  }

  // 결제 성공 — 실제 PG 콜백과 동일하게 예약 확정 처리
  await prisma.reservation.update({
    where: { id: order.id },
    data: {
      status: "CONFIRMED",
      paymentStatus: "COMPLETED",
      paymentMethod: "MOCK",
      pgProvider: "mock",
      pgTid: mockTid,
      pgAuthData: JSON.stringify({ mock: true, result: "success", timestamp }),
      paidAt: new Date(),
      confirmedAt: new Date(),
    },
  });

  await logPayment({
    orderId: order.id,
    provider: "mock",
    stage: "webhook",
    status: "success",
    message: `Mock 결제 완료 amount=${Math.round(Number(order.finalAmount))}`,
    pgTid: mockTid,
  });

  // 영상 상담 예약이면 세션 자동 생성 (실패해도 결제 흐름 유지)
  try {
    await ensureConsultingSession(order.id);
  } catch (e) {
    console.error(`[mock/webhook] 영상 세션 생성 실패 (${order.id}):`, e);
  }

  // 상담사 알림톡 + 고객 확정 알림톡 + 고객 인앱 알림 (실제 PG 흐름과 동일)
  await notifyOrderPlacedToSeller(order.id).catch((e) =>
    console.error("[mock] 예약접수 알림톡 오류:", e),
  );
  // 결제 완료(=바로 CONFIRMED) → 고객에게 예약 확정 알림톡 발송
  await notifyReservationConfirmedToCustomer(order.id).catch((e) =>
    console.error("[mock] 고객 확정 알림톡 오류:", e),
  );
  await notifyOrderPaid(order.id).catch(() => {});

  return NextResponse.json({ ok: true, result: "success" });
}
