import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMissingSchemaError, safeQuery } from "@/lib/safeDb";
import {
  ensureConsultingSession,
  completeConsultingSession,
  getReservationConsultingInfo,
} from "@/lib/consultingSession";
import { notifyReservationConfirmedToCustomer } from "@/lib/alimtalkTriggers";
import { releaseTimeSlot } from "@/lib/timeSlotUtils";

// 예약 상태 전환 허용 맵 — 종결 상태(COMPLETED/CANCELLED/NO_SHOW)는 되돌릴 수 없다.
// (취소된 예약을 CONFIRMED 로 되돌리면 이미 해제된 슬롯에 이중 예약이 발생)
const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const dynamic = "force-dynamic";

// 운영 DB에 reservations/time_slots 테이블이 아직 없는 환경(P2021)에서는
// 500 대신 명확한 503을 반환한다 (DB 스키마 드리프트 안전망).
const schemaDriftResponse = () =>
  NextResponse.json({ error: "예약 기능이 아직 준비 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });

// PATCH /api/reservations/[id] — 상태 변경
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await Promise.resolve(params);
  const body = await request.json();
  const { status } = body;

  if (!status) {
    return NextResponse.json({ error: "상태 값이 필요합니다." }, { status: 400 });
  }

  let reservation;
  try {
    reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { seller: true },
    });
  } catch (e) {
    if (isMissingSchemaError(e)) return schemaDriftResponse();
    throw e;
  }

  if (!reservation) {
    return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
  }

  const role = session.user.role;

  // 권한 체크
  if (role === "CUSTOMER") {
    // 고객은 본인 예약만, CANCELLED만 가능
    if (reservation.userId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    if (status !== "CANCELLED") {
      return NextResponse.json({ error: "고객은 취소만 가능합니다." }, { status: 403 });
    }
    if (reservation.status !== "PENDING") {
      return NextResponse.json({ error: "대기 중인 예약만 취소할 수 있습니다." }, { status: 400 });
    }
  } else if (role === "CONSULTANT") {
    // 상담사는 본인 샵 예약만
    if (reservation.seller.userId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    const allowed = ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "허용되지 않은 상태 변경입니다." }, { status: 400 });
    }
  }
  // SUPER_ADMIN: 역할 제한은 없지만 아래 상태 전환 규칙은 동일하게 적용

  // 동일 상태로의 변경은 무시 (중복 클릭 등) — 부수효과 없이 현재 예약 반환
  if (status === reservation.status) {
    return NextResponse.json({ reservation });
  }

  // 상태 전환 검증 — 허용되지 않은 전환(예: CANCELLED → CONFIRMED)은 400
  const allowedNext = STATUS_TRANSITIONS[reservation.status] ?? [];
  if (!allowedNext.includes(status)) {
    return NextResponse.json(
      { error: `현재 상태(${reservation.status})에서 ${status} 상태로 변경할 수 없습니다.` },
      { status: 400 },
    );
  }

  // 상태 변경 시각 업데이트
  const now = new Date();
  const extraData: Record<string, unknown> = {};
  if (status === "CONFIRMED") extraData.confirmedAt = now;
  else if (status === "COMPLETED") extraData.completedAt = now;
  else if (status === "CANCELLED") extraData.cancelledAt = now;
  else if (status === "NO_SHOW") extraData.noShowAt = now;

  // 슬롯 해제(취소 시)와 예약 상태 갱신을 하나의 트랜잭션으로 원자화한다.
  // 취소 시 슬롯 해제는 변형(방식×시간) 예약이면 소요시간 구간 전체를,
  // 레거시면 시작 슬롯만 되돌린다 (releaseTimeSlot 공통 로직).
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (status === "CANCELLED") {
        await releaseTimeSlot(id, tx);
      }
      return tx.reservation.update({
        where: { id },
        data: { status, ...extraData },
      });
    });
  } catch (e) {
    if (isMissingSchemaError(e)) return schemaDriftResponse();
    throw e;
  }

  // 예약 확정 → 영상 상담이면 세션 자동 생성 + 고객 알림톡 (실패해도 확정 흐름은 유지)
  if (status === "CONFIRMED") {
    try {
      await ensureConsultingSession(id);
    } catch (e) {
      console.error(`[reservations] 영상 세션 생성 실패 (${id}):`, e);
    }
    notifyReservationConfirmedToCustomer(id).catch((e) =>
      console.error(`[reservations] 확정 알림톡 발송 실패 (${id}):`, e),
    );
  }

  // 상담 완료/취소 → 열려 있는 영상 세션 정리
  if (status === "COMPLETED" || status === "CANCELLED") {
    try {
      const cs = await prisma.consultingSession.findUnique({
        where: { reservationId: id },
        select: { id: true, status: true },
      });
      if (cs && (cs.status === "WAITING" || cs.status === "ACTIVE")) {
        await completeConsultingSession(cs.id, { cancelled: status === "CANCELLED" });
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) {
        console.error(`[reservations] 영상 세션 정리 실패 (${id}):`, e);
      }
    }
  }

  return NextResponse.json({ reservation: updated });
}

// GET /api/reservations/[id] — 예약 상세
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await Promise.resolve(params);

  let reservation;
  try {
    reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        seller: { select: { id: true, shopName: true, slug: true, user: { select: { name: true, avatar: true } } } },
        items: { include: { variant: { select: { name: true } } } },
        timeSlot: { select: { id: true, startTime: true, endTime: true } },
      },
    });
  } catch (e) {
    if (isMissingSchemaError(e)) return schemaDriftResponse();
    throw e;
  }

  if (!reservation) {
    return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
  }

  // 권한 체크
  const role = session.user.role;
  if (role === "CUSTOMER" && reservation.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  // 상담사는 본인 점집 예약만 열람 가능 (조건 없이 항상 소유권 검사)
  if (role === "CONSULTANT") {
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user.id } });
    if (!seller || seller.id !== reservation.sellerId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  // 상담 방식(영상/전화/방문) — Reservation 에 저장되지 않으므로 상품에서 역조회
  const { method: consultingMethod } = await getReservationConsultingInfo(id);

  // 영상 상담 세션 (테이블 미반영 환경에서는 null)
  const consultingSession = await safeQuery(
    `reservation session (${id})`,
    () =>
      prisma.consultingSession.findUnique({
        where: { reservationId: id },
        select: { id: true, status: true },
      }),
    null,
  );

  // 확정된 전화/방문 상담이면 상담사 연락처·상담소 주소를 공개한다 (마스킹 해제)
  // UI에서 저장되는 값: "전화 상담", "방문 상담" (consultOptions.ts CONSULT_METHODS)
  // 레거시 값: "전화", "방문" — 두 형태 모두 인식한다.
  const isPhoneMethod = consultingMethod === "전화" || consultingMethod === "전화 상담";
  const isVisitMethod = consultingMethod === "방문" || consultingMethod === "방문 상담";
  let consultantContact: { phone?: string | null; address?: string | null } | null = null;
  if (
    (reservation.status === "CONFIRMED" || reservation.status === "COMPLETED") &&
    (isPhoneMethod || isVisitMethod)
  ) {
    const sellerDetail = await prisma.sellerProfile.findUnique({
      where: { id: reservation.sellerId },
      select: {
        businessAddress: true,
        user: { select: { phone: true } },
      },
    });
    consultantContact = {
      ...(isPhoneMethod ? { phone: sellerDetail?.user.phone ?? null } : {}),
      ...(isVisitMethod ? { address: sellerDetail?.businessAddress ?? null } : {}),
    };
  }

  return NextResponse.json({
    reservation: {
      ...reservation,
      totalAmount: Number(reservation.totalAmount),
      discountAmount: Number(reservation.discountAmount),
      finalAmount: Number(reservation.finalAmount),
      consultingMethod,
      consultingSession,
      consultantContact,
      items: reservation.items.map((i) => ({
        ...i,
        price: Number(i.price),
        totalPrice: Number(i.totalPrice),
      })),
    },
  });
}
