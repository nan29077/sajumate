import type { PrismaClient } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { parseVariantName, timeToMinutes } from "@/lib/consultOptions";

/**
 * 예약에 연결된 타임슬롯을 모두 해제한다.
 * isAvailable=true, reservationId=null 로 초기화하여 재예약 가능 상태로 되돌린다.
 *
 * 변형(방식×시간) 예약은 생성 시 "시작 슬롯"에만 reservationId 가 연결되고(1:1 unique),
 * 나머지 연속 구간 슬롯은 isAvailable=false 만 설정된다. 따라서 reservationId 일치
 * 조건만으로 해제하면 나머지 구간 슬롯이 영구히 잠긴다. 여기서는 예약 항목의
 * variantName 에서 소요시간(분)을 파악해 시작 시각부터 소요시간 구간 전체를 해제한다.
 *
 * abort, orderCleanup, cancel-approve, 예약 상태변경(PATCH) 등에서 공통으로 호출된다.
 * 트랜잭션 내에서 호출할 경우 tx 클라이언트를 넘긴다.
 */
export async function releaseTimeSlot(
  reservationId: string,
  prismaClient: Pick<PrismaClient, "timeSlot" | "reservationItem"> = prisma,
): Promise<void> {
  const timeSlot = prismaClient.timeSlot as typeof prisma.timeSlot;
  const reservationItem = prismaClient.reservationItem as typeof prisma.reservationItem;

  // 시작 슬롯(reservationId 연결 슬롯) — 변형 예약의 연속 구간 해제 기준점
  const startSlot = await timeSlot.findFirst({
    where: { reservationId },
    select: { consultantId: true, date: true, startTime: true },
  });

  if (startSlot) {
    const item = await reservationItem.findFirst({
      where: { reservationId },
      select: { variantName: true },
    });
    const minutes = item?.variantName ? parseVariantName(item.variantName).minutes : 0;

    if (minutes > 0) {
      // 변형 예약: 시작 시각부터 소요시간 구간에 속한 닫힌 슬롯을 전부 해제한다.
      // 다른 예약의 시작 슬롯을 건드리지 않도록 reservationId 가 null(구간 슬롯)이거나
      // 이 예약(시작 슬롯)인 것만 대상으로 한다.
      const startMin = timeToMinutes(startSlot.startTime);
      const windowEnd = startMin + minutes;
      const closed = await timeSlot.findMany({
        where: {
          consultantId: startSlot.consultantId,
          date: startSlot.date,
          isAvailable: false,
          OR: [{ reservationId }, { reservationId: null }],
        },
        select: { id: true, startTime: true },
      });
      const toFree = closed
        .filter((s) => {
          const st = timeToMinutes(s.startTime);
          return st >= startMin && st < windowEnd;
        })
        .map((s) => s.id);
      if (toFree.length > 0) {
        await timeSlot.updateMany({
          where: { id: { in: toFree } },
          data: { isAvailable: true, reservationId: null },
        });
        return;
      }
    }
  }

  // 레거시(단일 슬롯) 예약 또는 이미 부분 해제된 경우 — reservationId 일치 슬롯만 해제
  await timeSlot.updateMany({
    where: { reservationId },
    data: { isAvailable: true, reservationId: null },
  });
}
