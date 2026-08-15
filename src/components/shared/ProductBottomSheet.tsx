"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2 } from 'lucide-react';
import { useSession } from "next-auth/react";
import SafeImage from "@/components/shared/SafeImage";
import AddToCartButton from "@/components/shared/AddToCartButton";
import BuyNowButton from "@/components/shared/BuyNowButton";
import SocialOrderModal from "@/components/shared/SocialOrderModal";
import GuestPurchaseModal from "@/components/shared/GuestPurchaseModal";
import { useAppDialog } from "@/components/shared/AppDialog";
import { DEFAULT_PRODUCT_IMAGE } from "@/lib/defaults";

interface Variant {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface OptionGroup {
  groupName: string;
  options: string[];
}

interface ProductData {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  comparePrice: number | null;
  thumbnail: string | null;
  images: string[];
  shippingFee: number;
  freeShipping: boolean;
  freeShippingThreshold: number | null;
  remoteAreaFee: number;
  brandName: string | null;
  avgRating: number;
  reviewCount: number;
  optionGroups: OptionGroup[] | null;
  variants: Variant[];
  defaultSellerId: string | null;
}

interface Props {
  productId: string | null;
  sellerId?: string | null;
  sellerSlug?: string;
  themeColor?: string;
  onClose: () => void;
}

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function ProductBottomSheet({
  productId,
  sellerId,
  sellerSlug,
  themeColor = "#f59e0b",
  onClose,
}: Props) {
  const { status } = useSession();
  const { appAlert } = useAppDialog();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  // 단일 flat 선택
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // 다차원 그룹 선택: groupIndex → selectedOption
  const [groupSelections, setGroupSelections] = useState<(string | null)[]>([]);
  const [socialOrderOpen, setSocialOrderOpen] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);

  // 드래그로 닫기
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [visible, setVisible] = useState(false);

  // 열릴 때 슬라이드업 애니메이션
  useEffect(() => {
    if (productId) {
      setDragOffset(0);
      setSelectedVariantId(null);
      setGroupSelections([]);
      setImgIdx(0);
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [productId]);

  // 상담상품 데이터 fetch
  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    const params = new URLSearchParams({ id: productId });
    if (sellerId) params.set("sellerId", sellerId);
    if (sellerSlug) params.set("ref", sellerSlug);
    fetch(`/api/products/public-detail?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setProduct(d.error ? null : d);
        // 그룹 선택 배열 초기화
        if (d.optionGroups?.length) {
          setGroupSelections(new Array(d.optionGroups.length).fill(null));
        }
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId, sellerId, sellerSlug]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 280);
  }, [onClose]);

  // 터치 드래그 핸들러
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setDragOffset(dy);
  };
  const onTouchEnd = () => {
    if (dragOffset > 100) { handleClose(); }
    else setDragOffset(0);
    dragStartY.current = null;
  };

  if (!productId) return null;

  // 다차원 그룹 모드: 선택된 조합에서 variant 찾기
  const isGroupMode = product?.optionGroups && product.optionGroups.length > 0;
  const allGroupsSelected = isGroupMode
    ? groupSelections.every((s) => s !== null)
    : false;

  let effectiveVariant: Variant | null = null;
  if (isGroupMode && allGroupsSelected) {
    const combinedName = groupSelections.join("/");
    effectiveVariant = product!.variants.find((v) => v.name === combinedName) || null;
  } else if (!isGroupMode && selectedVariantId) {
    effectiveVariant = product?.variants.find((v) => v.id === selectedVariantId) || null;
  }

  const requireVariant = product
    ? isGroupMode
      ? product.optionGroups!.length > 0
      : product.variants.length > 0
    : false;

  const ready = requireVariant
    ? isGroupMode
      ? allGroupsSelected && !!effectiveVariant
      : !!selectedVariantId
    : true;

  const notifySelectOption = () =>
    appAlert({ title: "옵션 선택", message: "옵션을 선택해 주세요.", type: "honeybee" });

  const displayPrice = effectiveVariant
    ? effectiveVariant.price
    : product?.basePrice || 0;

  const discountPct =
    product?.comparePrice && product.comparePrice > displayPrice
      ? Math.round((1 - displayPrice / product.comparePrice) * 100)
      : 0;

  const effectiveSellerId = product?.defaultSellerId || sellerId || null;

  const cartClass =
    "flex-1 h-12 border border-amber-400 text-amber-700 bg-amber-50 font-semibold text-sm rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center";
  const buyClass =
    "flex-1 h-12 text-white font-semibold text-sm rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-1.5";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleClose}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[71] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{
          maxHeight: "90dvh",
          transform: `translateX(-50%) translateY(${visible ? dragOffset : "100%"}px)`,
          transition: dragOffset > 0 ? "none" : "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* 드래그 핸들 + 헤더 (amber-50 배경) */}
        <div
          className="flex-shrink-0 bg-amber-50 rounded-t-3xl px-4 pt-3 pb-3 touch-none select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* 드래그 바 */}
          <div className="w-10 h-1 bg-amber-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900 truncate pr-3 max-w-[85%]">
              {loading ? "불러오는 중..." : (product?.name || "상담상품 상세")}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-amber-300" />
            </div>
          )}

          {!loading && !product && (
            <div className="text-center py-16 text-gray-400">
              <Icon name="Cart" size={36} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">상담상품 정보를 불러올 수 없습니다</p>
            </div>
          )}

          {!loading && product && (
            <>
              {/* 이미지 갤러리 */}
              {product.images.length > 0 && (
                <div className="relative bg-gray-100">
                  <div className="aspect-square overflow-hidden">
                    <SafeImage
                      src={product.images[imgIdx] || product.thumbnail}
                      placeholder={DEFAULT_PRODUCT_IMAGE}
                      alt={product.name}
                      width={480}
                      height={480}
                      fallbackText={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* 점 네비게이션 */}
                  {product.images.length > 1 && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                      {product.images.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setImgIdx(i)}
                          className={`rounded-full transition-all ${
                            i === imgIdx
                              ? "w-3 h-1.5 bg-amber-400"
                              : "w-1.5 h-1.5 bg-white/60"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  {/* 썸네일 스트립 */}
                  {product.images.length > 1 && (
                    <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-amber-100 overflow-x-auto scrollbar-hide">
                      {product.images.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setImgIdx(i)}
                          className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                            i === imgIdx ? "border-amber-400" : "border-transparent"
                          }`}
                        >
                          <SafeImage
                            src={img}
                            placeholder={DEFAULT_PRODUCT_IMAGE}
                            alt=""
                            width={48}
                            height={48}
                            fallbackText=""
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 가격/정보 영역 */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {discountPct > 0 && (
                    <span className="text-xl font-bold text-red-500">{discountPct}%</span>
                  )}
                  <span className="text-2xl font-bold text-gray-900">
                    {formatPrice(displayPrice)}
                  </span>
                  {discountPct > 0 && product.comparePrice && (
                    <span className="text-sm text-gray-400 line-through">
                      {formatPrice(product.comparePrice)}
                    </span>
                  )}
                </div>

                {/* 평점 */}
                {product.avgRating > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Icon name="Star"
                          key={i}
                          size={11}
                          className={
                            i < Math.round(product.avgRating)
                              ? "fill-amber-400 text-amber-400"
                              : "text-gray-200"
                          }
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">{product.avgRating}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">후기 {product.reviewCount}</span>
                  </div>
                )}
              </div>

              {/* 상담 방식 */}
              <div className="px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Icon name="Calendar" size={13} strokeWidth={1.5} className="text-amber-400" />
                  <span>예약 후 상담사와 일정 조율</span>
                </div>
              </div>

              <div className="h-px bg-amber-100 mx-4 my-2" />

              {/* 옵션 선택 — 다차원 그룹 모드 */}
              {isGroupMode && product.optionGroups!.map((group, gi) => (
                <div key={gi} className="px-4 pb-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">
                    {group.groupName}
                    {groupSelections[gi] === null && (
                      <span className="text-gray-400 font-normal ml-1">(선택해주세요)</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((opt) => {
                      const selected = groupSelections[gi] === opt;
                      // 이 옵션을 선택했을 때 조합되는 variant 재고 확인
                      const testSelections = [...groupSelections];
                      testSelections[gi] = opt;
                      const allSet = testSelections.every((s) => s !== null);
                      const testName = allSet ? testSelections.join("/") : "";
                      const testVariant = testName
                        ? product.variants.find((v) => v.name === testName)
                        : null;
                      const outOfStock = allSet && testVariant != null && testVariant.stock <= 0;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (outOfStock) return;
                            const ns = [...groupSelections];
                            ns[gi] = selected ? null : opt;
                            setGroupSelections(ns);
                          }}
                          disabled={outOfStock}
                          className={`px-3.5 py-2 text-sm border rounded-xl transition-all ${
                            outOfStock
                              ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed line-through"
                              : selected
                                ? "border-amber-500 bg-amber-50 text-amber-800 font-semibold shadow-sm"
                                : "border-gray-200 text-gray-800 hover:border-amber-400 hover:bg-amber-50/50 active:bg-amber-50"
                          }`}
                          style={selected ? { borderColor: themeColor } : {}}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* 옵션 선택 — 단순(flat) 모드 */}
              {!isGroupMode && product.variants.length > 0 && (
                <div className="px-4 pb-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">옵션 선택</p>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => {
                      const selected = v.id === selectedVariantId;
                      const outOfStock = v.stock <= 0;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            if (outOfStock) return;
                            setSelectedVariantId(selected ? null : v.id);
                          }}
                          disabled={outOfStock}
                          className={`px-3.5 py-2 text-sm border rounded-xl transition-all ${
                            outOfStock
                              ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed line-through"
                              : selected
                                ? "border-amber-500 bg-amber-50 text-amber-800 font-semibold shadow-sm"
                                : "border-gray-200 text-gray-800 hover:border-amber-400 hover:bg-amber-50/50 active:bg-amber-50"
                          }`}
                          style={selected ? { borderColor: themeColor } : {}}
                        >
                          {v.name}
                          {v.price !== product.basePrice && (
                            <span
                              className={`text-xs ml-1 ${selected ? "text-amber-600" : "text-gray-400"}`}
                            >
                              ({v.price > product.basePrice ? "+" : ""}
                              {formatPrice(v.price)})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 선택된 옵션 표시 */}
              {effectiveVariant && (
                <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800">
                    선택: {effectiveVariant.name}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {formatPrice(effectiveVariant.price)}
                  </p>
                </div>
              )}

              {/* 상담상품 간단 설명 */}
              {product.description && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-gray-500 leading-relaxed">{product.description}</p>
                </div>
              )}

              {/* 상세페이지 바로가기 */}
              <div className="px-4 pb-4">
                <a
                  href={`/products/${product.id}${sellerSlug ? `?ref=${sellerSlug}` : ""}${sellerId ? `${sellerSlug ? "&" : "?"}sellerId=${sellerId}` : ""}`}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs text-amber-600 hover:text-amber-700 transition-colors border border-amber-100 rounded-xl hover:bg-amber-50"
                >
                  <Icon name="Package" size={12} strokeWidth={1.5} />
                  상세페이지 전체 보기
                </a>
              </div>
            </>
          )}
        </div>

        {/* 하단 고정 구매 버튼 영역 */}
        {!loading && product && (
          <div
            className="flex-shrink-0 border-t border-amber-100 bg-white px-4 pt-3"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            {/* 옵션 미선택 안내 */}
            {requireVariant && !ready && (
              <p className="text-[11px] text-amber-500 mb-2">옵션을 선택해 주세요.</p>
            )}

            {/* 소셜예약서 */}
            {effectiveSellerId && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setSocialOrderOpen(true)}
                  className="w-full h-10 flex items-center justify-center gap-1.5 bg-amber-400 text-amber-900 font-bold text-xs rounded-xl hover:bg-amber-500 transition-colors"
                >
                  <Icon name="File" size={14} strokeWidth={1.75} />
                  계좌 입금 예약서 작성
                </button>
                <p className="text-xs text-gray-400 mt-1 text-center">은행 계좌로 직접 입금하시는 분께서 작성해 주세요.</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {effectiveSellerId ? (
                !ready ? (
                  <>
                    <button
                      type="button"
                      onClick={notifySelectOption}
                      className={cartClass}
                    >
                      예약함
                    </button>
                    <button
                      type="button"
                      onClick={notifySelectOption}
                      className={buyClass}
                      style={{ backgroundColor: themeColor, flex: "1 1 0%" }}
                    >
                      구매하기
                    </button>
                  </>
                ) : status === "loading" ? (
                  <>
                    <button type="button" disabled className={`${cartClass} opacity-50 cursor-not-allowed`}>
                      예약함
                    </button>
                    <button
                      type="button"
                      disabled
                      className={`${buyClass} opacity-50 cursor-not-allowed`}
                      style={{ backgroundColor: themeColor, flex: "1 1 0%" }}
                    >
                      구매하기
                    </button>
                  </>
                ) : status === "unauthenticated" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setGuestModalOpen(true)}
                      className={cartClass}
                    >
                      예약함
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuestModalOpen(true)}
                      className={buyClass}
                      style={{ backgroundColor: themeColor, flex: "1 1 0%" }}
                    >
                      구매하기
                    </button>
                  </>
                ) : null
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* 비회원 구매 모달 */}
      <GuestPurchaseModal
        open={guestModalOpen}
        onClose={() => setGuestModalOpen(false)}
        onGuestPurchase={() => setGuestModalOpen(false)}
        returnUrl={typeof window !== "undefined" ? window.location.href : `/products/${productId}`}
      />

      {/* 소셜 예약 모달 */}
      <SocialOrderModal
        open={socialOrderOpen}
        onClose={() => setSocialOrderOpen(false)}
        productId={productId || ""}
        sellerId={effectiveSellerId || ""}
        productName={product?.name}
        productPrice={displayPrice}
      />
    </>
  );
}
