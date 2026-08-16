// 1:1 영상 상담 세션 도메인 로직 — 서버 전용.
// 예약 확정(CONFIRMED) 시점에 Daily.co 룸·토큰을 만들어 ConsultingSession 레코드와 매핑한다.
// ⚠️ consulting_sessions 테이블은 운영 DB에 아직 없을 수 있다(P2021) — 모든 접근은 폴백 필수.
import { prisma } from "@/lib/prisma";
import { safeQuery, isMissingSchemaError } from "@/lib/safeDb";
import {
  createRoom,
  createMeetingToken,
  deleteRoom,
} from "@/lib/daily";
import { createNotification } from "@/lib/notifications";
import type { ConsultingSession } from "@/generated/prisma";

/** 영상 상담으로 취급하는 consultingMethod 값 */
const VIDEO_METHODS = new Set(["영상통화", "영상", "화상", "영상 상담"]);

export const CONSULTING_METHOD_FALLBACK = "영상통화";

export function isVideoMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  // Set 에 없더라도 "영상"으로 시작하는 모든 값을 영상 상담으로 인식
  return VIDEO_METHODS.has(method) || method.startsWith("영상");
}

/**
 * 예약의 상담 방식·상담 시간(분)을 조회한다.
 * 상담 방식은 Reservation에 저장되지 않으므로 첫 아이템의 Product를 역조회한다.
 * - itemType=DIRECT(상담사 자체 상품)는 상담 속성이 없어 방식 null 처리.
 * - consultingMethod/durationMinutes 컬럼은 운영 DB 드리프트(P2022) 가능 — 폴백 기본값 사용.
 */
export async function getReservationConsultingInfo(
  reservationId: string,
): Promise<{ method: string | null; durationMinutes: number }> {
  const item = await safeQuery(
    `consulting info item (${reservationId})`,
    () =>
      prisma.reservationItem.findFirst({
        where: { reservationId },
        select: { itemType: true, productId: true },
        orderBy: { createdAt: "asc" },
      }),
    null,
  );
  if (!item || item.itemType !== "PRODUCT") {
    return { method: null, durationMinutes: 30 };
  }

  // 명시적 select 는 전역 omit 을 우회하므로 P2022 가능 → 실패 시 기본값
  try {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { consultingMethod: true, durationMinutes: true },
    });
    if (!product) return { method: CONSULTING_METHOD_FALLBACK, durationMinutes: 30 };
    return {
      method: product.consultingMethod || CONSULTING_METHOD_FALLBACK,
      durationMinutes: product.durationMinutes || 30,
    };
  } catch (e) {
    if (isMissingSchemaError(e)) {
      return { method: CONSULTING_METHOD_FALLBACK, durationMinutes: 30 };
    }
    throw e;
  }
}

/** 예약 날짜("2026-08-20T00:00:00Z")와 시간("14:00")을 합쳐 예정 시각으로 변환 */
export function reservationScheduledAt(
  reservationDate: Date,
  reservationTime: string,
): Date {
  const [h, m] = (reservationTime || "00:00").split(":").map((v) => parseInt(v, 10));
  const d = new Date(reservationDate);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

/**
 * 예약 확정 시 영상 상담 세션을 생성한다 (멱등 — 이미 있으면 기존 세션 반환).
 * 영상 상담이 아닌 예약(전화/방문/채팅/DIRECT)은 null 을 반환한다.
 * consulting_sessions 테이블 미반영(P2021) 환경에서는 경고만 남기고 null 을 반환해
 * 예약 확정 흐름 자체는 절대 막지 않는다.
 */
export async function ensureConsultingSession(
  reservationId: string,
): Promise<ConsultingSession | null> {
  // 1) 멱등: 기존 세션이 있으면 그대로 반환
  const existing = await safeQuery(
    `consulting session lookup (${reservationId})`,
    () =>
      prisma.consultingSession.findUnique({ where: { reservationId } }),
    null,
  );
  if (existing) return existing;

  // 2) 예약·상담 방식 확인
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      customerName: true,
      reservationDate: true,
      reservationTime: true,
      status: true,
      seller: {
        select: {
          shopName: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!reservation) return null;
  if (reservation.status === "CANCELLED") return null;

  const { method, durationMinutes } = await getReservationConsultingInfo(reservationId);
  if (!isVideoMethod(method)) return null;

  // 3) Daily.co 룸·토큰 생성
  const scheduledAt = reservationScheduledAt(
    reservation.reservationDate,
    reservation.reservationTime,
  );
  const room = await createRoom(reservationId, scheduledAt, durationMinutes);
  const tokenExp = new Date(
    scheduledAt.getTime() + (durationMinutes + 60) * 60 * 1000,
  );
  const [hostToken, guestToken] = await Promise.all([
    createMeetingToken(
      room.roomName,
      true,
      reservation.seller.user.name || reservation.seller.shopName,
      tokenExp,
    ),
    createMeetingToken(
      room.roomName,
      false,
      reservation.customerName || "고객",
      tokenExp,
    ),
  ]);

  // 4) 세션 저장 (P2021 폴백 — 테이블 미반영 시 세션 없이 진행)
  let session: ConsultingSession;
  try {
    session = await prisma.consultingSession.create({
      data: {
        reservationId,
        roomName: room.roomName,
        roomUrl: room.roomUrl,
        hostToken,
        guestToken,
        status: "WAITING",
      },
    });
  } catch (e) {
    if (isMissingSchemaError(e)) {
      console.warn(
        "[consultingSession] consulting_sessions 테이블 미반영 — 세션 생성 생략 (DB 스키마 드리프트)",
      );
      return null;
    }
    // 동시 생성 경합(유니크 충돌) → 기존 세션 반환
    if ((e as { code?: string })?.code === "P2002") {
      return safeQuery(
        `consulting session race (${reservationId})`,
        () => prisma.consultingSession.findUnique({ where: { reservationId } }),
        null,
      );
    }
    throw e;
  }

  // 5) 인앱 알림 (실패해도 흐름 유지)
  await Promise.all([
    createNotification({
      userId: reservation.userId,
      title: "영상 상담이 준비되었습니다",
      message: `${reservation.seller.shopName} 예약이 확정되어 영상 상담실이 열렸습니다. 예약 시간에 입장해 주세요.`,
      type: "order",
      linkUrl: `/my/sessions/${session.id}`,
    }),
    createNotification({
      userId: reservation.seller.user.id,
      title: "영상 상담 예약 확정",
      message: `${reservation.customerName}님과의 영상 상담실이 생성되었습니다.`,
      type: "order",
      linkUrl: `/seller/sessions/${session.id}`,
    }),
  ]);

  return session;
}

/**
 * 상담 종료 처리 — 세션 COMPLETED + 실제 상담 분 기록 + Daily 룸 삭제.
 * 예약도 COMPLETED 로 전환한다 (completedAt 포함).
 */
export async function completeConsultingSession(
  sessionId: string,
  options?: { memo?: string | null; cancelled?: boolean },
): Promise<ConsultingSession | null> {
  const session = await safeQuery(
    `consulting session complete lookup (${sessionId})`,
    () => prisma.consultingSession.findUnique({ where: { id: sessionId } }),
    null,
  );
  if (!session) return null;
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    return session;
  }

  const now = new Date();
  const duration = session.startedAt
    ? Math.max(1, Math.round((now.getTime() - session.startedAt.getTime()) / 60000))
    : null;

  const updated = await prisma.consultingSession.update({
    where: { id: sessionId },
    data: {
      status: options?.cancelled ? "CANCELLED" : "COMPLETED",
      endedAt: now,
      duration,
    },
  });

  // 예약 상태 동기화 + 상담 메모 저장 (취소 강제종료 시에는 예약을 건드리지 않는다)
  if (!options?.cancelled) {
    await prisma.reservation.update({
      where: { id: session.reservationId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        ...(options?.memo !== undefined && options.memo !== null
          ? { consultantMemo: options.memo }
          : {}),
      },
    });
  }

  // 룸 삭제는 실패해도 무시 (만료 시 자동 삭제됨)
  void deleteRoom(session.roomName);

  return updated;
}
