"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
;
import { useSession } from "next-auth/react";
import { formatPrice } from "@/lib/utils";
import AddToCartButton from "@/components/shared/AddToCartButton";
import BuyNowButton from "@/components/shared/BuyNowButton";
import WishlistButton from "@/components/shared/WishlistButton";
import SocialOrderModal from "@/components/shared/SocialOrderModal";
import GuestPurchaseModal from "@/components/shared/GuestPurchaseModal";
import { useAppDialog } from "@/components/shared/AppDialog";

interface Variant {
  id: string;
  name: string;
  price: number;
}

interface OptionGroup {
  groupName: string;
  options: string[];
}

interface Campaign {
  id: string;
  sellerId: string;
  campaignPrice: number;
}

interface ProductBuySectionProps {
  productId: string;
  basePrice: number;
  variants: Variant[];
  optionGroups?: OptionGroup[];
  defaultSellerId: string | null;
  campaign: Campaign | null;
  children: React.ReactNode;
  fromLive?: boolean;
  productName?: string;
  productPrice?: number;
}

export default function ProductBuySection({
  productId,
  basePrice,
  variants,
  optionGroups = [],
  defaultSellerId,
  campaign,
  children,
  fromLive = false,
  productName,
  productPrice,
}: ProductBuySectionProps) {
  const { status } = useSession();
  const { appAlert } = useAppDialog();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [groupSelections, setGroupSelections] = useState<(string | null)[]>(
    () => optionGroups.map(() => null)
  );
  const [socialOrderOpen, setSocialOrderOpen] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);

  const isGroupMode = optionGroups.length > 0;
  const allGroupsSelected = isGroupMode && groupSelections.every((s) => s !== null);
  const combinedName = groupSelections.filter(Boolean).join("/");
  const selectedVariantByGroup = allGroupsSelected
    ? variants.find((v) => v.name === combinedName) ?? null
    : null;

  const effectiveVariant = isGroupMode
    ? selectedVariantByGroup
    : selectedVariantId
    ? variants.find((v) => v.id === selectedVariantId) ?? null
    : null;

  const requireVariant = variants.length > 0;
  const ready = isGroupMode ? allGroupsSelected : !requireVariant || !!selectedVariantId;
  const finalVariantId = isGroupMode ? (selectedVariantByGroup?.id ?? null) : selectedVariantId;

  const sellerId = defaultSellerId || campaign?.sellerId || null;
  const campaignId = campaign?.id || null;

  const notifySelectOption = () =>
    appAlert({ title: "옵션 선택", message: "옵션을 선택해 주세요.", type: "honeybee" });

  const selectGroup = (gi: number, opt: string) => {
    setGroupSelections((prev) => {
      const next = [...prev];
      next[gi] = next[gi] === opt ? null : opt;
      return next;
    });
  };

  const renderButtons = (layout: "row" | "col") => {
    const rowClass = layout === "row";
    const notReady = requireVariant && !ready;
    const cartClass = `${rowClass ? "flex-1 h-12" : "w-full h-10"} border border-gray-900 text-gray-900 font-semibold text-sm rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center`;
    const buyClass = `${rowClass ? "flex-1 h-12" : "w-full h-10"} bg-black text-white font-semibold text-sm rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5`;
    return (
      <>
        <WishlistButton
          productId={productId}
          className={`${rowClass ? "w-12 h-12" : "w-full h-10"} flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:text-black transition-colors`}
          size={20}
        />
        {sellerId ? (
          notReady ? (
            <>
              <button type="button" onClick={notifySelectOption} className={cartClass}>
                예약함
              </button>
              <button type="button" onClick={notifySelectOption} className={buyClass}>
                예약하기
              </button>
            </>
          ) : status === "loading" ? (
            <>
              <button type="button" disabled className={`${cartClass} opacity-50 cursor-not-allowed`}>
                예약함
              </button>
              <button type="button" disabled className={`${buyClass} opacity-50 cursor-not-allowed`}>
                예약하기
              </button>
            </>
          ) : status === "unauthenticated" ? (
            <>
              <button type="button" onClick={() => setGuestModalOpen(true)} className={cartClass}>
                예약함
              </button>
              <button type="button" onClick={() => setGuestModalOpen(true)} className={buyClass}>
                예약하기
              </button>
            </>
          ) : (
            <>
              <AddToCartButton
                productId={productId}
                variantId={finalVariantId}
                sellerId={sellerId}
                campaignId={campaignId}
                className={cartClass}
                label="예약함"
                hideIcon
              />
              <BuyNowButton
                productId={productId}
                variantId={finalVariantId}
                sellerId={sellerId}
                campaignId={campaignId}
                fromLive={fromLive}
                label="예약하기"
                price={campaign ? formatPrice(campaign.campaignPrice) : undefined}
                className={buyClass}
                hideIcon
              />
            </>
          )
        ) : (
          <button
            type="button"
            disabled
            className={`${rowClass ? "flex-1 h-12" : "w-full h-10"} bg-gray-200 text-gray-500 font-semibold text-sm rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed`}
          >
            <Icon name="Cart" size={16} strokeWidth={1.5} />
            판매 준비 중
          </button>
        )}
      </>
    );
  };

  return (
    <>
      {variants.length > 0 && (
        <>
          <div className="px-4 py-4">
            <h2 className="text-[15px] font-bold text-gray-900 mb-3">옵션 선택</h2>

            {isGroupMode ? (
              <div className="space-y-4">
                {optionGroups.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-xs font-semibold text-gray-500 mb-2">{group.groupName}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt) => {
                        const selected = groupSelections[gi] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => selectGroup(gi, opt)}
                            className={`px-4 py-2.5 text-sm border rounded-lg transition-all ${
                              selected
                                ? "border-black bg-black text-white"
                                : "border-gray-200 text-gray-900 hover:border-black active:bg-gray-50"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {allGroupsSelected && !selectedVariantByGroup && (
                  <p className="text-xs text-red-500">선택한 조합은 품절이거나 존재하지 않습니다.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const selected = v.id === selectedVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(selected ? null : v.id)}
                      className={`px-4 py-2.5 text-sm border rounded-lg transition-all ${
                        selected
                          ? "border-black bg-black text-white"
                          : "border-gray-200 text-gray-900 hover:border-black active:bg-gray-50"
                      }`}
                    >
                      {v.name}
                      {v.price !== basePrice && (
                        <span className={`text-xs ml-1 ${selected ? "text-gray-300" : "text-gray-400"}`}>
                          ({formatPrice(v.price)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="h-2 bg-gray-50" />
        </>
      )}

      {children}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-200 z-[65] safe-area-bottom">
        {requireVariant && !ready && (
          <p className="px-4 pt-2 text-[11px] text-gray-500">옵션을 선택해 주세요.</p>
        )}
        {effectiveVariant && (
          <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800">
              선택된 옵션: {effectiveVariant.name}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">수량: 1개</p>
                  </div>
        )}
        {/* 소셜예약서 작성 버튼 (상담사가 지정된 경우에만 노출) */}
        {sellerId && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => setSocialOrderOpen(true)}
              className="w-full h-11 flex items-center justify-center gap-1.5 border border-amber-300 bg-amber-50 text-amber-700 font-bold text-sm rounded-lg hover:bg-amber-100 transition-colors"
            >
              <Icon name="File" size={16} strokeWidth={1.75} />
              계좌 입금 예약서 작성
            </button>
            <p className="text-xs text-gray-400 mt-1 text-center">은행 계좌로 직접 입금하시는 분께서 작성해 주세요.</p>
          </div>
        )}
        <div className="flex items-center gap-2 p-3">
          {renderButtons("row")}
        </div>
      </div>

      {/* 소셜예약서 모달 */}
      {sellerId && (
        <SocialOrderModal
          open={socialOrderOpen}
          onClose={() => setSocialOrderOpen(false)}
          productId={productId}
          sellerId={sellerId}
          productName={productName}
          productPrice={effectiveVariant?.price ?? basePrice}
        />
      )}

      {/* 비회원 구매 모달 */}
      <GuestPurchaseModal
        open={guestModalOpen}
        onClose={() => setGuestModalOpen(false)}
        onGuestPurchase={() => setGuestModalOpen(false)}
        returnUrl={typeof window !== "undefined" ? window.location.href : `/products/${productId}`}
      />
    </>
  );
}
