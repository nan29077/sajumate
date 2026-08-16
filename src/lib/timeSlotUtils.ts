import type { PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * 예약에 연결된 타임슬롯을 모두 해제한다.
 * isAvailable=true, reservationId=null 로 초기화하여 재예약 가능 상태로 되돌린다.
 *
 * abort, orderCleanup, cancel-approve 세 곳에서 공통으로 호출된다.
 * 트랜잭션 내에서 호출할 경우 tx 클라이언트를 넘긴다.
 */
export async function releaseTimeSlot(
  reservationId: string,
  prismaClient: Pick<PrismaClient, "timeSlot"> = prisma,
): Promise<void> {
  await (prismaClient.timeSlot as typeof prisma.timeSlot).updateMany({
    where: { reservationId },
    data: { isAvailable: true, reservationId: null },
  });
}
