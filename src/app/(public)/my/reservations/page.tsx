import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopAwareLoginPath } from "@/lib/shopLoginRedirect";
import { safeQuery } from "@/lib/safeDb";
import { formatPrice } from "@/lib/utils";
import { isVideoMethod, CONSULTING_METHOD_FALLBACK } from "@/lib/consultingSession";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Video,
  Phone,
  MapPin,
  CalendarX2,
  Star,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "예약 대기", color: "bg-yellow-50 text-yellow-700" },
  CONFIRMED: { label: "예약 확정", color: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "상담 완료", color: "bg-green-50 text-green-700" },
  CANCELLED: { label: "취소됨", color: "bg-gray-100 text-gray-500" },
  NO_SHOW: { label: "노쇼", color: "bg-red-50 text-red-600" },
};

const FILTER_TABS = [
  { value: "ALL", label: "전체" },
  { value: "PENDING", label: "대기" },
  { value: "CONFIRMED", label: "확정" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELLED", label: "취소" },
];

/** 상담 방식 배지 (영상/전화/방문) */
function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const icon = isVideoMethod(method) ? (
    <Video size={11} strokeWidth={1.8} />
  ) : method === "전화" ? (
    <Phone size={11} strokeWidth={1.8} />
  ) : method === "방문" ? (
    <MapPin size={11} strokeWidth={1.8} />
  ) : null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
      {icon}
      {method} 상담
    </span>
  );
}

export default async function MyReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }> | { status?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect(getShopAwareLoginPath());

  const { status } = await Promise.resolve(searchParams);
  const statusFilter = status && status !== "ALL" ? status : undefined;

  const reservations = await safeQuery("my reservations list", () =>
    prisma.reservation.findMany({
      where: {
        userId: session.user.id,
        ...(statusFilter ? { status: statusFilter as "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" } : {}),
      },
      include: {
        seller: {
          select: {
            shopName: true,
            slug: true,
            shopLogo: true,
            user: { select: { name: true, avatar: true } },
          },
        },
        items: true,
        timeSlot: { select: { startTime: true, endTime: true } },
      },
      orderBy: { reservationDate: "desc" },
    }), []);

  // ── 상담 방식(영상/전화/방문) 역조회 ───────────────────────────────
  // Reservation 에는 상담 방식이 없어 첫 아이템의 Product 에서 가져온다.
  // 명시적 select 는 전역 omit 을 우회해 P2022 가능 → safeQuery 폴백.
  const productIds = Array.from(
    new Set(
      reservations
        .map((r) => r.items[0])
        .filter((i) => i && i.itemType === "PRODUCT")
        .map((i) => i!.productId),
    ),
  );
  const products = productIds.length
    ? await safeQuery(
        "my reservations consulting methods",
        () =>
          prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, consultingMethod: true },
          }),
        [],
      )
    : [];
  const methodByProduct = new Map(products.map((p) => [p.id, p.consultingMethod || CONSULTING_METHOD_FALLBACK]));

  // ── 영상 상담 세션 매핑 (테이블 미반영 환경에서는 빈 값) ─────────────
  const sessionRows = reservations.length
    ? await safeQuery(
        "my reservations sessions",
        () =>
          prisma.consultingSession.findMany({
            where: { reservationId: { in: reservations.map((r) => r.id) } },
            select: { id: true, reservationId: true, status: true },
          }),
        [],
      )
    : [];
  const sessionByReservation = new Map(sessionRows.map((s) => [s.reservationId, s]));

  const currentStatus = status || "ALL";

  return (
    <div className="animate-fade-in pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/my" className="text-gray-500">
            <ChevronLeft size={22} strokeWidth={1.5} />
          </Link>
          <h1 className="text-base font-bold text-gray-900">예약 내역</h1>
          {reservations.length > 0 && (
            <span className="text-xs text-brand-600 font-bold bg-brand-50 px-2 py-0.5 rounded-full">
              {reservations.length}
            </span>
          )}
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-1 px-4 py-3 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/my/reservations?status=${tab.value}`}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              currentStatus === tab.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* 목록 */}
      <div className="px-4 space-y-3">
        {reservations.length === 0 ? (
          <div className="text-center py-20">
            <CalendarX2 size={48} strokeWidth={1.2} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">상담 예약이 없습니다.</p>
          </div>
        ) : (
          reservations.map((r) => {
            const s = STATUS_MAP[r.status] || { label: r.status, color: "bg-gray-100 text-gray-500" };
            const date = new Date(r.reservationDate);
            const dateStr = `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
            const firstItem = r.items[0];
            const productName = firstItem?.productName || "상담 상품";
            const method =
              firstItem && firstItem.itemType === "PRODUCT"
                ? methodByProduct.get(firstItem.productId) ?? null
                : null;
            const consultingSession = sessionByReservation.get(r.id);
            // 영상 상담 입장: 확정 + 영상 방식 + 세션이 살아 있을 때만
            const canEnterVideo =
              r.status === "CONFIRMED" &&
              isVideoMethod(method) &&
              !!consultingSession &&
              (consultingSession.status === "WAITING" || consultingSession.status === "ACTIVE");
            // 리뷰 작성: 완료된 카탈로그 상담 상품만 (자체 상품은 리뷰 대상 없음)
            const reviewHref =
              r.status === "COMPLETED" && firstItem && firstItem.itemType === "PRODUCT"
                ? `/products/${firstItem.productId}`
                : null;

            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <Link href={`/my/reservations/${r.id}`} className="block p-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.seller.shopName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {productName}
                        {r.items.length > 1 && ` 외 ${r.items.length - 1}건`}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-500 mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar size={13} strokeWidth={1.5} />
                      {dateStr}
                    </span>
                    {r.reservationTime && (
                      <span className="flex items-center gap-1">
                        <Clock size={13} strokeWidth={1.5} />
                        {r.reservationTime}
                        {r.timeSlot && ` ~ ${r.timeSlot.endTime}`}
                      </span>
                    )}
                    <MethodBadge method={method} />
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                    <span className="text-xs text-gray-400">#{r.reservationNumber}</span>
                    <span className="text-sm font-bold text-gray-800">
                      {formatPrice(Number(r.finalAmount))}
                    </span>
                  </div>
                </Link>

                {/* 상태별 액션 */}
                {(canEnterVideo || reviewHref) && (
                  <div className="px-4 pb-4 -mt-1">
                    {canEnterVideo && (
                      <Link
                        href={`/my/sessions/${consultingSession!.id}`}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500"
                      >
                        <Video size={16} strokeWidth={1.8} />
                        영상 상담 입장
                      </Link>
                    )}
                    {reviewHref && (
                      <Link
                        href={reviewHref}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50"
                      >
                        <Star size={16} strokeWidth={1.8} />
                        리뷰 작성
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
