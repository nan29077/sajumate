import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/aligo";
import { sendTemplatedAlimtalk, type TemplatedSendResult } from "@/lib/alimtalkEngine";

/** 결제 완료 시 해당 점집 상담사에게 예약 접수 알림톡 발송. 실패해도 결제 흐름에 영향 없음. */
export async function notifyOrderPlacedToSeller(orderId: string): Promise<TemplatedSendResult> {
  const order = await prisma.reservation.findUnique({
    where: { id: orderId },
    select: {
      reservationNumber: true,
      finalAmount: true,
      customerName: true,
      reservationDate: true,
      reservationTime: true,
      user: { select: { name: true } },
      seller: { select: { id: true, shopName: true, user: { select: { name: true, phone: true } } } },
    },
  });
  if (!order) return { notified: false, reason: "예약 없음" };

  const phone = normalizePhone(order.seller.user.phone);
  if (!phone) return { notified: false, reason: "상담사 전화번호 없음" };

  const kstDate = new Date(order.reservationDate.getTime() + 9 * 3600 * 1000);
  const reservationYmd = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(kstDate.getUTCDate()).padStart(2, "0")}`;
  return sendTemplatedAlimtalk({
    purpose: "ORDER_PLACED",
    variables: {
      "셀러샵명": order.seller.shopName,
      "주문자명": order.customerName || order.user.name || "고객",
      "예약번호": order.reservationNumber,
      "예약일": reservationYmd,
      "예약시간": order.reservationTime,
      "결제금액": Number(order.finalAmount).toLocaleString("ko-KR"),
    },
    recipients: [{ phone, name: order.seller.user.name || "상담사" }],
    sellerId: order.seller.id,
  });
}

/** 예약 확정 시 고객에게 상담 일정 안내 알림톡 발송. */
export async function notifyReservationConfirmedToCustomer(
  reservationId: string,
): Promise<TemplatedSendResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      customerName: true,
      customerPhone: true,
      reservationDate: true,
      reservationTime: true,
      user: { select: { name: true, phone: true } },
      seller: { select: { id: true, shopName: true } },
    },
  });
  if (!reservation) return { notified: false, reason: "예약 없음" };

  const phone = normalizePhone(reservation.customerPhone || reservation.user.phone);
  if (!phone) return { notified: false, reason: "고객 전화번호 없음" };

  // 예약일은 KST 기준
  const kstDate = new Date(reservation.reservationDate.getTime() + 9 * 3600 * 1000);
  const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(kstDate.getUTCDate()).padStart(2, "0")}`;

  return sendTemplatedAlimtalk({
    purpose: "RESERVATION_CONFIRMED",
    variables: {
      "고객명": reservation.customerName || reservation.user.name || "고객",
      "셀러샵명": reservation.seller.shopName,
      "예약일": dateStr,
      "예약시간": reservation.reservationTime,
    },
    recipients: [
      { phone, name: reservation.customerName || reservation.user.name || "고객님" },
    ],
    sellerId: reservation.seller.id,
  });
}

/** 결제취소 승인 완료 시 고객에게 취소 안내 알림톡 발송. */
export async function notifyReservationCancelledToCustomer(
  reservationId: string,
): Promise<TemplatedSendResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      reservationNumber: true,
      customerName: true,
      customerPhone: true,
      reservationDate: true,
      user: { select: { name: true, phone: true } },
      seller: { select: { id: true, shopName: true } },
    },
  });
  if (!reservation) return { notified: false, reason: "예약 없음" };

  const phone = normalizePhone(reservation.customerPhone || reservation.user.phone);
  if (!phone) return { notified: false, reason: "고객 전화번호 없음" };

  const kstDate = new Date(reservation.reservationDate.getTime() + 9 * 3600 * 1000);
  const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, "0")}-${String(kstDate.getUTCDate()).padStart(2, "0")}`;

  return sendTemplatedAlimtalk({
    purpose: "RESERVATION_CANCELLED",
    variables: {
      "고객명": reservation.customerName || reservation.user.name || "고객",
      "셀러샵명": reservation.seller.shopName,
      "예약번호": reservation.reservationNumber,
      "예약일": dateStr,
    },
    recipients: [
      { phone, name: reservation.customerName || reservation.user.name || "고객님" },
    ],
    sellerId: reservation.seller.id,
  });
}

/** 고객 회원가입 직후 환영 알림톡 발송 (카카오 승인 조건: 가입 즉시 1회). */
export async function notifySignupWelcome(opts: {
  name: string;
  phone: string | null;
  sellerRef?: string | null; // 가입 경로 상담사 slug — 있으면 해당 점집명으로 발송
}): Promise<TemplatedSendResult> {
  const phone = normalizePhone(opts.phone);
  if (!phone) return { notified: false, reason: "전화번호 없음" };

  let shopName = "사주메이트";
  let sellerId: string | null = null;
  if (opts.sellerRef) {
    const seller = await prisma.sellerProfile.findUnique({
      where: { slug: opts.sellerRef },
      select: { id: true, shopName: true },
    });
    if (seller) {
      shopName = seller.shopName;
      sellerId = seller.id;
    }
  }

  return sendTemplatedAlimtalk({
    purpose: "SIGNUP_WELCOME",
    variables: { "고객명": opts.name || "고객", "셀러샵명": shopName },
    recipients: [{ phone, name: opts.name || "고객님" }],
    sellerId,
  });
}
