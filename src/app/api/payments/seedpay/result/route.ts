import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPayRequestHash,
  buildSignVerifyHash,
  requestApproval,
  requestNetCancel,
} from "@/lib/seedpay";
import { logPayment } from "@/lib/paymentLog";
import { notifyOrderPaid } from "@/lib/notifications";
import { notifyOrderPlacedToSeller, notifyReservationConfirmedToCustomer } from "@/lib/alimtalkTriggers";
import { ensureConsultingSession } from "@/lib/consultingSession";

export const dynamic = "force-dynamic";

// SeedPay 결제창에서 인증 완료 후 POST로 호출되는 콜백.
// 1) signData 검증 → 2) 승인 API 호출 → 3) Order 업데이트 → 4) 결과 페이지로 리다이렉트 HTML 반환
export async function POST(request: Request) {
  const form = await request.formData();
  const get = (k: string) => (form.get(k)?.toString() ?? "");

  const resultCd = get("resultCd");
  const resultMsg = get("resultMsg");
  const nonce = get("nonce");
  const tid = get("tid");
  const mId = get("mId") || get("mid");
  const orderId = get("orderId") || get("ordNo");
  const amount = get("amount") || get("goodsAmt");
  const ediDate = get("ediDate");
  const payData = get("payData");
  const signData = get("signData");
  const approvalUrl = get("approvalUrl");
  const netCancelUrl = get("netCancelUrl");

  // nginx 가 Host 헤더를 전달하지 않을 때 request.url 이 localhost:3000 으로 평가되므로
  // 환경변수(NEXT_PUBLIC_APP_URL=https://sajumate.co.kr) 를 우선 사용한다.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    new URL(request.url).origin;
  const successRedirect = (oid: string) =>
    `${origin}/checkout/complete?orderId=${oid}`;
  const failRedirect = (oid: string | null, msg: string) =>
    `${origin}/checkout/complete?` +
    (oid ? `orderId=${oid}&` : "") +
    `status=fail&msg=${encodeURIComponent(msg)}`;

  const mbsReserved = get("mbsReserved");
  let order = mbsReserved
    ? await prisma.reservation.findUnique({ where: { id: mbsReserved } })
    : null;
  if (!order && orderId) {
    order = await prisma.reservation.findUnique({ where: { reservationNumber: orderId } });
  }

  // 멱등성 가드: 이미 결제완료(COMPLETED)된 예약은 중복 콜백(인증토큰 재사용으로 인한
  // resultCd=9999 등)으로 다시 들어와도 절대 실패/취소 처리하지 않고 성공 페이지로 보낸다.
  // SeedPay 결제창이 /result 를 2번 호출하면서 정상 결제건이 CANCELLED 로 덮어써지던 버그 방지.
  if (order && order.paymentStatus === "COMPLETED") {
    await logPayment({
      orderId: order.id,
      provider: "seedpay",
      stage: "result",
      status: "info",
      message: `중복 콜백 무시 (이미 결제완료) resultCd=${resultCd}`,
      pgTid: tid || order.pgTid || null,
      payload: Object.fromEntries(form),
    });
    return htmlRedirect(successRedirect(order.id));
  }

  if (resultCd !== "0000") {
    if (order) {
      await markOrderFailed(order.id, `[${resultCd}] ${resultMsg}`);
    }
    await logPayment({
      orderId: order?.id ?? null,
      provider: "seedpay",
      stage: "result",
      status: "fail",
      message: `인증 실패 [${resultCd}] ${resultMsg}`,
      pgTid: tid || null,
      payload: Object.fromEntries(form),
    });
    return htmlRedirect(failRedirect(order?.id ?? null, resultMsg || "결제 인증 실패"));
  }

  const expectedSign = buildSignVerifyHash(tid, mId, ediDate, amount, orderId);
  if (signData && signData !== expectedSign) {
    await logPayment({
      orderId: order?.id ?? null,
      provider: "seedpay",
      stage: "result",
      status: "fail",
      message: "signData 불일치 (위·변조 의심) — 결제 차단",
      pgTid: tid || null,
      payload: { received: signData, expected: expectedSign },
    });
    if (order) {
      await markOrderFailed(order.id, "signData 불일치");
    }
    return htmlRedirect(failRedirect(order?.id ?? null, "결제 서명 검증 실패"));
  }

  if (!order) {
    await logPayment({
      provider: "seedpay",
      stage: "result",
      status: "fail",
      message: "ORDER_NOT_FOUND",
      pgTid: tid || null,
      payload: Object.fromEntries(form),
    });
    return htmlRedirect(failRedirect(null, "예약 매핑 실패"));
  }
  if (Math.round(Number(order.finalAmount)) !== Number(amount)) {
    await markOrderFailed(order.id, "금액 불일치");
    await logPayment({
      orderId: order.id,
      provider: "seedpay",
      stage: "result",
      status: "fail",
      message: `AMOUNT_MISMATCH paid=${amount} expected=${Math.round(Number(order.finalAmount))}`,
      pgTid: tid || null,
    });
    return htmlRedirect(failRedirect(order.id, "결제 금액 불일치"));
  }

  const approvalHash = buildPayRequestHash(ediDate, amount);
  try {
    const approval = await requestApproval(approvalUrl, {
      nonce,
      tid,
      mid: mId,
      goodsAmt: amount,
      ediDate,
      mbsReserved,
      hashString: approvalHash,
      payData,
    });
    if (approval.resultCd !== "0000") {
      await markOrderFailed(order.id, `[${approval.resultCd}] ${approval.resultMsg}`);
      await logPayment({
        orderId: order.id,
        provider: "seedpay",
        stage: "approval",
        status: "fail",
        message: `승인 실패 [${approval.resultCd}] ${approval.resultMsg}`,
        pgTid: approval.tid ?? tid,
        payload: approval,
      });
      return htmlRedirect(failRedirect(order.id, approval.resultMsg || "승인 실패"));
    }

    await prisma.reservation.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        paymentStatus: "COMPLETED",
        paymentMethod: "CARD",
        pgProvider: "seedpay",
        pgTid: approval.tid ?? tid,
        pgAuthData: JSON.stringify(approval),
        paidAt: new Date(),
        ...(({ deliveryStatus: "PAYMENT_COMPLETED" }) as any),
      },
    });
    // 영상 상담 예약이면 세션 자동 생성 (실패해도 결제 처리에 영향 없음)
    await ensureConsultingSession(order.id).catch((e) =>
      console.error("[seedpay] 영상 세션 생성 오류:", e),
    );
    // 결제 완료 → 해당 점집 상담사에게 예약접수 알림톡 (실패해도 결제 처리에 영향 없음)
    await notifyOrderPlacedToSeller(order.id).catch((e) => console.error("[seedpay] 예약접수 알림톡 오류:", e));
    // 결제 완료(=바로 CONFIRMED) → 고객에게 예약 확정 알림톡 발송 (실패해도 결제 흐름은 막지 않음)
    await notifyReservationConfirmedToCustomer(order.id).catch((e) => console.error("[seedpay] 고객 확정 알림톡 오류:", e));
    await logPayment({
      orderId: order.id,
      provider: "seedpay",
      stage: "approval",
      status: "success",
      message: `SeedPay 결제 완료 amount=${amount}`,
      pgTid: approval.tid ?? tid,
      payload: approval,
    });
    // 고객에게 예약 완료 인앱 알림 (실패해도 결제 흐름은 막지 않음)
    await notifyOrderPaid(order.id).catch(() => {});

    return htmlRedirect(successRedirect(order.id));
  } catch (e: any) {
    if (netCancelUrl) {
      await requestNetCancel(netCancelUrl, tid, mId);
    }
    await markOrderFailed(order.id, `승인 요청 오류: ${e?.message ?? "unknown"}`);
    await logPayment({
      orderId: order.id,
      provider: "seedpay",
      stage: "approval",
      status: "fail",
      message: `승인 요청 예외: ${e?.message ?? "unknown"}`,
      pgTid: tid || null,
      payload: { netCancelTriggered: !!netCancelUrl },
    });
    return htmlRedirect(failRedirect(order.id, "승인 요청 실패"));
  }
}

async function markOrderFailed(orderId: string, reason: string) {
  // 방어선 2: 이미 결제완료된 예약은 어떤 경로로도 실패로 덮어쓰지 않는다.
  const existing = await prisma.reservation.findUnique({
    where: { id: orderId },
    select: { paymentStatus: true },
  });
  if (existing?.paymentStatus === "COMPLETED") {
    console.warn(`[seedpay/result] markOrderFailed 무시 — 이미 결제완료 (orderId=${orderId}, reason=${reason})`);
    return;
  }
  await prisma.reservation.update({
    where: { id: orderId },
    data: {
      status: "CANCELLED",
      paymentStatus: "FAILED",
      cancelledAt: new Date(),
      pgAuthData: JSON.stringify({ failed: true, reason }),
    },
  });
}

function htmlRedirect(url: string) {
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>결제 처리 중</title></head>
<body>
<script>
(function(){
  var target = ${JSON.stringify(url)};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location.href = target;
      window.close();
      return;
    }
    if (window.top && window.top !== window.self) {
      window.top.location.href = target;
      return;
    }
  } catch (e) {}
  window.location.href = target;
})();
</script>
<p>결제 결과를 처리 중입니다. 이동되지 않으면 <a href="${url}">여기</a>를 클릭하세요.</p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
