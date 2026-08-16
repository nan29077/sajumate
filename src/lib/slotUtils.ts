import { prisma } from "@/lib/prisma";

/**
 * 예약에 연결된 타임슬롯을 모두 해제한다.
 * 결제 이탈(abort), PENDING 크론 정리(orderCleanup), 결제취소 승인(cancel-approve) 등
 * 예약이 취소/삭제될 때 공통으로 호출한다.
 */
export async function releaseTimeSlotByReservation(reservationId: string): Promise<void> {
  await prisma.timeSlot.updateMany({
    where: { reservationId },
    data: { isAvailable: true, reservationId: null },
  });
}
