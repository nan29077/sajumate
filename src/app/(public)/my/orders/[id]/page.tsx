import { Icon } from "@/components/shared/Icon";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopAwareLoginPath } from "@/lib/shopLoginRedirect";
import { formatPrice, parseJsonArray } from "@/lib/utils";
import { safeQuery } from "@/lib/safeDb";
import SafeImage from "@/components/shared/SafeImage";
import { NO_IMAGE } from "@/lib/defaults";
import { Navigation } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "결제대기", color: "bg-gray-100 text-gray-600" },
  PAID: { label: "결제완료", color: "bg-blue-50 text-blue-600" },
  CONFIRMED: { label: "확인됨", color: "bg-indigo-50 text-indigo-600" },
  SHIPPING: { label: "상담 진행중", color: "bg-cyan-50 text-cyan-600" },
  DELIVERED: { label: "상담 완료", color: "bg-green-50 text-green-600" },
  CANCELLED: { label: "취소됨", color: "bg-red-50 text-red-600" },
  REFUND_REQUESTED: {
    label: "환불요청",
    color: "bg-orange-50 text-orange-600",
  },
  REFUNDED: { label: "환불완료", color: "bg-gray-100 text-gray-500" },
};

const DELIVERY_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PAYMENT_COMPLETED: { label: "결제 완료", color: "bg-blue-50 text-blue-600" },
  PREPARING: { label: "상담 방식 준비 중", color: "bg-yellow-50 text-yellow-600" },
  SHIPPED: { label: "발송 완료", color: "bg-orange-50 text-orange-600" },
  DELIVERING: { label: "상담 방식 중", color: "bg-purple-50 text-purple-600" },
  DELIVERED: { label: "상담 방식 완료", color: "bg-green-50 text-green-700" },
  CANCEL_REQUESTED: {
    label: "결제취소 요청중",
    color: "bg-amber-50 text-amber-700",
  },
  CANCEL_COMPLETED: {
    label: "결제취소 완료",
    color: "bg-gray-100 text-gray-500",
  },
};

const DELIVERY_STEPS: Array<{ key: string; label: string }> = [
  { key: "PAYMENT_COMPLETED", label: "결제 완료" },
  { key: "PREPARING", label: "상담 방식 준비 중" },
  { key: "SHIPPED", label: "발송 완료" },
  { key: "DELIVERING", label: "상담 방식 중" },
  { key: "DELIVERED", label: "상담 방식 완료" },
];

function fmtDateTime(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const session = await auth();
  if (!session?.user) redirect(getShopAwareLoginPath());
  const { id } = await Promise.resolve(params);

  // 운영 DB에 reservations 테이블이 아직 없을 수 있어(P2021) safeQuery 폴백 적용
  const order = await safeQuery(
    "my order detail",
    () =>
      prisma.reservation.findUnique({
        where: { id },
        include: {
          seller: { select: { shopName: true, slug: true, shopLogo: true } },
          items: { include: { variant: true } },
          campaign: { select: { title: true } },
        },
      }),
    null,
  );

  // 본인 예약만 열람 가능
  if (!order || order.userId !== session.user!.id) notFound();

  // OrderItem 에는 product 관계가 없어 productId 로 썸네일을 별도 조회.
  // itemType 에 따라 조회할 테이블이 다르다 — DIRECT 는 상담사 일반상담상품(DirectProduct).
  const productIds = Array.from(
    new Set(order.items.filter((it) => it.itemType !== "DIRECT").map((it) => it.productId)),
  );
  const directIds = Array.from(
    new Set(order.items.filter((it) => it.itemType === "DIRECT").map((it) => it.productId)),
  );
  const [products, directProducts] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, thumbnail: true },
        })
      : [],
    directIds.length
      ? prisma.directProduct.findMany({
          where: { id: { in: directIds } },
          select: { id: true, images: true },
        })
      : [],
  ]);
  const thumbById = new Map<string, string | null>(products.map((p) => [p.id, p.thumbnail]));
  for (const dp of directProducts) {
    thumbById.set(dp.id, parseJsonArray(dp.images)[0] ?? null);
  }
  // 일반상담상품은 /products/[id] 상세 페이지가 없다 — 점집으로 보낸다.
  const directIdSet = new Set(directIds);
  const itemHref = (productId: string) =>
    directIdSet.has(productId) ? `/shop/${order.seller.slug}` : `/products/${productId}`;

  const status = STATUS_MAP[order.status] || {
    label: order.status,
    color: "bg-gray-100 text-gray-600",
  };
  const isCancelled = order.status === "CANCELLED";

  // 예약 진행 현황 — 미결제 예약은 진행 상태를 표시하지 않는다.
  const isPaid = order.paymentStatus === "COMPLETED";
  const ds = isPaid ? order.status : null;
  const isCancelRequested = !!order.cancelRequestedAt && order.status !== "CANCELLED";
  const isCancelCompleted = order.status === "CANCELLED";

  const discountLabel =
    order.discountType === "referral"
      ? "기존 할인"
      : order.discountType === "pick_channel"
        ? "채널인증 할인"
        : order.discountType?.startsWith("cart")
          ? "묶음 예약 할인"
          : "할인";

  const deliveryCourier = null;
  const deliveryTracking = null;
  const deliveryUpdatedAt = null;
  const dsInfo = ds
    ? (DELIVERY_STATUS_MAP[ds] ?? {
        label: ds,
        color: "bg-gray-100 text-gray-600",
      })
    : null;
  // CANCEL 상태는 타임라인에서 제외
  const isDeliveryHidden = isCancelRequested || isCancelCompleted;
  const dsIdx =
    ds && !isDeliveryHidden
      ? DELIVERY_STEPS.findIndex((s) => s.key === ds)
      : -1;

  return (
    <div className="animate-fade-in pb-8">
      {/* 상단 바 */}
      <div className="sticky top-12 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/my/orders" className="text-gray-500 hover:text-gray-900">
            <Icon
              name="ArrowRight"
              size={20}
              strokeWidth={1.5}
              className="rotate-180"
            />
          </Link>
          <h1 className="text-base font-bold text-gray-900">예약 상세</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* 예약 요약 헤더 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-gray-400">예약번호</p>
              <p className="text-sm font-bold text-gray-900">
                {order.reservationNumber}
              </p>
            </div>
            <span
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${status.color}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {fmtDateTime(order.createdAt)} 예약
          </p>
        </div>

        {/* 결제취소 요청중 상태 */}
        {isCancelRequested && (
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 flex items-center gap-3">
            <Icon
              name="Close"
              size={20}
              className="text-amber-500 flex-shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-amber-700">
                결제취소 요청중
              </p>
              <p className="text-[11px] text-amber-500 mt-0.5">
                관리자 검토 후 처리됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 결제취소 완료 상태 */}
        {isCancelCompleted && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <Icon
              name="Close"
              size={20}
              className="text-gray-400 flex-shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-gray-600">
                결제취소 완료
              </p>
              {order.cancelledAt && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {fmtDateTime(order.cancelledAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 취소/환불 상태 */}
        {isCancelled && !isCancelCompleted && (
          <div className="bg-red-50 rounded-xl border border-red-100 p-4 flex items-center gap-3">
            <Icon
              name="Close"
              size={20}
              className="text-red-500 flex-shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-red-600">
                {status.label}
              </p>
              {order.cancelledAt && (
                <p className="text-[11px] text-red-400 mt-0.5">
                  {fmtDateTime(order.cancelledAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 상담 방식 현황 타임라인 */}
        {!isCancelled &&
          !isDeliveryHidden &&
          ds !== null &&
          dsInfo !== null && (
            <DeliveryTimeline
              dsInfo={dsInfo}
              dsIdx={dsIdx}
              steps={DELIVERY_STEPS}
              courier={deliveryCourier}
              tracking={deliveryTracking}
              updatedAt={deliveryUpdatedAt}
            />
          )}

        {/* 상담사 */}
        <Link
          href={`/shop/${order.seller.slug}`}
          className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-50 ring-1 ring-gray-100 flex-shrink-0">
            <SafeImage
              src={order.seller.shopLogo}
              alt={order.seller.shopName}
              width={40}
              height={40}
              fallbackText={order.seller.shopName.charAt(0)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Icon name="Store" size={11} /> 라이브 점집
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {order.seller.shopName}
            </p>
          </div>
        </Link>

        {/* 예약 상담상품 */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-1.5">
            <Icon name="Package" size={14} className="text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900">예약 상담상품</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {order.items.map((item) => (
              <Link
                key={item.id}
                href={itemHref(item.productId)}
                className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  <SafeImage
                    src={thumbById.get(item.productId) || null}
                    placeholder={NO_IMAGE}
                    alt={item.productName}
                    width={56}
                    height={56}
                    fallbackText={item.productName.charAt(0)}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 line-clamp-2">
                    {item.productName}
                  </p>
                  {item.variantName && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {item.variantName}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    수량 {item.quantity}개
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                  {formatPrice(Number(item.totalPrice))}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* 예약자 정보 */}
        {order.customerName && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <Icon name="Location" size={14} className="text-gray-400" />{" "}
              예약자 정보
            </h2>
            <div className="space-y-1.5">
              {order.customerName && (
                <InfoRow label="예약자" value={order.customerName} />
              )}
              {order.customerPhone && (
                <InfoRow label="연락처" value={order.customerPhone} />
              )}
              <InfoRow
                label="예약일시"
                value={`${new Date(order.reservationDate).toLocaleDateString("ko-KR")} ${order.reservationTime}`}
              />
              {order.consultingContent && (
                <InfoRow label="상담 내용" value={order.consultingContent} />
              )}
            </div>
          </div>
        )}

        {/* 결제 정보 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
            <Icon name="Receipt" size={14} className="text-gray-400" /> 결제
            정보
          </h2>
          <div className="space-y-2">
            <PayRow
              label="상담상품금액"
              value={formatPrice(Number(order.totalAmount))}
            />
            {Number(order.discountAmount) > 0 && (
              <PayRow
                label={discountLabel}
                value={`- ${formatPrice(Number(order.discountAmount))}`}
                accent
              />
            )}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
              <span className="text-sm font-bold text-gray-900">
                총 결제금액
              </span>
              <span className="text-base font-bold text-brand-600">
                {formatPrice(Number(order.finalAmount))}
              </span>
            </div>
            {order.paymentMethod && (
              <p className="text-[11px] text-gray-400 pt-1">
                결제수단 · {order.paymentMethod}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 상담 방식 현황 타임라인 ─────────────────────────────────────────
function DeliveryTimeline({
  dsInfo,
  dsIdx,
  steps,
  courier,
  tracking,
  updatedAt,
}: {
  dsInfo: { label: string; color: string };
  dsIdx: number;
  steps: Array<{ key: string; label: string }>;
  courier: string | null;
  tracking: string | null;
  updatedAt: Date | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Icon name="Truck" size={14} className="text-gray-400" /> 상담 방식 현황
        </h2>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${dsInfo.color}`}
        >
          {dsInfo.label}
        </span>
      </div>
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const reached = dsIdx >= idx;
          const isCur = dsIdx === idx;
          const isLast = idx === steps.length - 1;
          return (
            <div key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center" style={{ width: 20 }}>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    reached
                      ? isCur
                        ? "bg-brand-500 ring-2 ring-brand-200"
                        : "bg-brand-500"
                      : "bg-gray-100"
                  }`}
                >
                  {reached && (
                    <Icon
                      name="Check"
                      size={12}
                      className="text-white"
                      strokeWidth={2.5}
                    />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`w-px flex-1 my-1 ${
                      reached && dsIdx > idx ? "bg-brand-400" : "bg-gray-100"
                    }`}
                    style={{ minHeight: 16 }}
                  />
                )}
              </div>
              <p
                className={`text-xs font-medium pb-3 ${
                  reached
                    ? isCur
                      ? "text-brand-600"
                      : "text-gray-700"
                    : "text-gray-300"
                }`}
              >
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
      {(courier || tracking) && (
        <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
          {courier && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">택배사</span>
              <span className="text-gray-800 font-medium">{courier}</span>
            </div>
          )}
          {tracking && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">운송장 번호</span>
              <span className="text-gray-800 font-mono font-medium select-all">
                {tracking}
              </span>
            </div>
          )}
        </div>
      )}
      {updatedAt && (
        <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
          <Navigation size={9} />
          {fmtDateTime(updatedAt)}
        </p>
      )}
    </div>
  );
}

// ─── 헬퍼 컴포넌트 ──────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-gray-400 w-14 flex-shrink-0">{label}</span>
      <span className="text-gray-700 flex-1">{value}</span>
    </div>
  );
}

function PayRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={accent ? "text-brand-600 font-medium" : "text-gray-800"}>
        {value}
      </span>
    </div>
  );
}
