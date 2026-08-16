import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeQuery, isMissingSchemaError } from "@/lib/safeDb";
import { generateOrderNumber } from "@/lib/utils";
import { parseVariantName, slotsForWindow } from "@/lib/consultOptions";

export const dynamic = "force-dynamic";

// GET /api/reservations — 예약 목록 조회
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const consultantId = url.searchParams.get("consultantId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const role = session.user.role;
  const where: Record<string, unknown> = {};

  if (role === "CUSTOMER") {
    where.userId = session.user.id;
  } else if (role === "CONSULTANT") {
    const seller = await prisma.sellerProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!seller) return NextResponse.json({ reservations: [] });
    where.sellerId = seller.id;
  }
  // SUPER_ADMIN: 필터만 적용

  if (status && status !== "ALL") where.status = status;
  if (consultantId && role === "SUPER_ADMIN") where.sellerId = consultantId;
  if (dateFrom || dateTo) {
    where.reservationDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const [reservations, total] = await safeQuery("reservations list", () => Promise.all([
    prisma.reservation.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        seller: { select: { id: true, shopName: true, slug: true, user: { select: { name: true, avatar: true } } } },
        items: {
          include: { variant: { select: { name: true } } },
        },
        timeSlot: { select: { id: true, startTime: true, endTime: true } },
      },
      orderBy: { reservationDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reservation.count({ where }),
  ]), [[], 0]);

  return NextResponse.json({
    reservations: reservations.map((r) => ({
      ...r,
      totalAmount: Number(r.totalAmount),
      discountAmount: Number(r.discountAmount),
      finalAmount: Number(r.finalAmount),
      items: r.items.map((i) => ({
        ...i,
        price: Number(i.price),
        totalPrice: Number(i.totalPrice),
      })),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

// POST /api/reservations — 예약 생성
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    sellerId,
    productId,
    variantId,
    timeSlotId,
    reservationDate,
    reservationTime,
    customerName,
    customerPhone,
    birthDate,
    birthTime,
    gender,
    consultingContent,
    liveStreamId,
  } = body;

  if (!sellerId || !productId || !timeSlotId || !reservationDate || !reservationTime || !customerName || !customerPhone) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 대상 상담사 확인 — body의 sellerId 는 신뢰하지 않고 슬롯·상품과의 정합성을 검증한다
      const sellerProfile = await tx.sellerProfile.findUnique({
        where: { id: sellerId },
        select: { id: true, userId: true },
      });
      if (!sellerProfile) throw new Error("상담사를 찾을 수 없습니다.");

      // 슬롯 가용 여부 확인 (비관적 잠금 대신 트랜잭션 내 재확인)
      const slot = await tx.timeSlot.findUnique({
        where: { id: timeSlotId },
      });
      if (!slot) throw new Error("존재하지 않는 예약 시간입니다.");
      // 슬롯 소유자(consultantId=User.id)와 예약 대상 상담사가 일치해야 한다
      if (slot.consultantId !== sellerProfile.userId) {
        throw new Error("해당 상담사의 예약 시간이 아닙니다.");
      }
      if (!slot.isAvailable || slot.reservationId) {
        throw new Error("SLOT_TAKEN");
      }

      // 상품 정보 조회
      const product = await tx.product.findUnique({
        where: { id: productId },
      });
      if (!product || !product.isActive) throw new Error("상담 상품을 찾을 수 없습니다.");
      // 상품 ↔ 상담사 정합성: 상담사 직접 등록 상품이거나, 해당 점집에 담긴 상품이어야 한다
      if (product.sellerId !== sellerId) {
        const shopProduct = await tx.sellerShopProduct.findFirst({
          where: { sellerId, productId, isActive: true },
          select: { id: true },
        });
        if (!shopProduct) throw new Error("해당 상담사의 상담 상품이 아닙니다.");
      }

      // 라이브 방송 유래 예약: 방송 검증 + 당일 슬롯 제한 확인
      let liveId: string | null = null;
      if (typeof liveStreamId === "string" && liveStreamId) {
        const live = await tx.liveStream.findUnique({
          where: { id: liveStreamId },
          select: { id: true, sellerId: true },
        });
        // 방송이 존재하고 예약 대상 상담사의 방송일 때만 연결 (아니면 조용히 무시)
        if (live && live.sellerId === sellerId) {
          liveId = live.id;
          // 당일 예약 가능 슬롯 수 제한 (설정 테이블 미반영 시 무제한)
          try {
            const settings = await tx.liveReservationSettings.findUnique({
              where: { liveStreamId: live.id },
              select: { dailySlotLimit: true },
            });
            if (settings?.dailySlotLimit != null && settings.dailySlotLimit > 0) {
              const dayStart = new Date();
              dayStart.setHours(0, 0, 0, 0);
              const todayCount = await tx.reservation.count({
                where: {
                  liveStreamId: live.id,
                  createdAt: { gte: dayStart },
                  status: { not: "CANCELLED" },
                },
              });
              if (todayCount >= settings.dailySlotLimit) {
                throw new Error("LIVE_SLOTS_FULL");
              }
            }
          } catch (e) {
            if ((e as Error).message === "LIVE_SLOTS_FULL") throw e;
            if (!isMissingSchemaError(e)) throw e;
            // 설정 테이블 미반영 — 제한 없이 진행
          }
        }
      }

      // 선택한 방식×시간 옵션(변형)이 있으면 그 가격/소요시간을 사용
      let variant: { id: string; name: string; price: unknown } | null = null;
      if (typeof variantId === "string" && variantId) {
        variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
          select: { id: true, name: true, price: true },
        });
        if (!variant) throw new Error("선택한 상담 옵션을 찾을 수 없습니다.");
      }
      const amount = Number(variant ? variant.price : product.basePrice);
      const durationMinutes =
        (variant ? parseVariantName(variant.name).minutes : 0) ||
        Number((product as any).durationMinutes) || 30;
      const reservationNumber = generateOrderNumber();

      // 예약 생성
      const reservation = await tx.reservation.create({
        data: {
          reservationNumber,
          userId: session.user.id,
          sellerId,
          liveStreamId: liveId,
          status: "PENDING",
          paymentStatus: "PENDING",
          totalAmount: amount,
          discountAmount: 0,
          finalAmount: amount,
          reservationDate: new Date(reservationDate),
          reservationTime,
          customerName,
          customerPhone,
          birthDate: birthDate || null,
          birthTime: birthTime || null,
          gender: gender || null,
          consultingContent: consultingContent || null,
          items: {
            create: {
              itemType: "PRODUCT",
              productId,
              variantId: variant?.id ?? null,
              variantName: variant?.name ?? null,
              productName: product.name,
              price: amount,
              quantity: 1,
              totalPrice: amount,
            },
          },
        },
      });

      if (variant) {
        // 변형(방식×시간) 예약: 선택한 소요시간만큼 연속 슬롯을 모두 차단(30분 격자 기준).
        // 시작 슬롯에만 reservationId 를 연결(1:1 unique), 나머지 구간 슬롯은 isAvailable=false.
        const daySlots = await tx.timeSlot.findMany({
          where: { consultantId: sellerProfile.userId, date: slot.date, isAvailable: true },
          select: { id: true, startTime: true, endTime: true },
        });
        const cover = slotsForWindow(daySlots, slot.startTime, durationMinutes);
        if (!cover) throw new Error("NOT_ENOUGH_TIME");
        // 시작 슬롯을 조건부 updateMany 로 원자적으로 선점 — 동시 요청 시 한 건만 성공
        const claimed = await tx.timeSlot.updateMany({
          where: { id: timeSlotId, isAvailable: true, reservationId: null },
          data: { isAvailable: false, reservationId: reservation.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");
        // 나머지 구간 슬롯도 가용 상태였던 것만 차단 — 하나라도 이미 잠겼으면 전체 롤백
        const restIds = cover.map((cs) => cs.id).filter((id) => id !== timeSlotId);
        if (restIds.length > 0) {
          const blocked = await tx.timeSlot.updateMany({
            where: { id: { in: restIds }, isAvailable: true, reservationId: null },
            data: { isAvailable: false },
          });
          if (blocked.count !== restIds.length) throw new Error("SLOT_TAKEN");
        }
      } else {
        // 레거시(단일 슬롯) 예약: 조건부 updateMany 로 원자적으로 선점 — 동시 요청 시 한 건만 성공
        const claimed = await tx.timeSlot.updateMany({
          where: { id: timeSlotId, isAvailable: true, reservationId: null },
          data: { isAvailable: false, reservationId: reservation.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");
      }

      return reservation;
    });

    return NextResponse.json({ reservation: result }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "예약 생성에 실패했습니다.";
    if (msg === "SLOT_TAKEN") {
      return NextResponse.json({ error: "이미 예약된 시간입니다. 다른 시간을 선택해 주세요." }, { status: 409 });
    }
    if (msg === "NOT_ENOUGH_TIME") {
      return NextResponse.json({ error: "선택한 시작 시간에 상담 시간만큼 연속으로 비어 있는 시간이 부족합니다. 다른 시간을 선택해 주세요." }, { status: 409 });
    }
    if (msg === "LIVE_SLOTS_FULL") {
      return NextResponse.json(
        { error: "오늘 이 방송에서 받을 수 있는 상담이 모두 마감되었습니다." },
        { status: 409 },
      );
    }
    if (isMissingSchemaError(err)) {
      return NextResponse.json(
        { error: "예약 저장소가 아직 준비되지 않았습니다. 관리자에게 문의해 주세요." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
