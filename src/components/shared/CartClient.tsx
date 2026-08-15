"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Minus, Sparkles } from 'lucide-react';
import { cn } from "@/lib/utils";
import SafeImage from "@/components/shared/SafeImage";
import { useAppDialog } from "@/components/shared/AppDialog";
import BookingContactForm from "@/components/shared/BookingContactForm";
import { useShopChrome } from "@/components/shared/ShopChromeProvider";

interface CartItem {
  id: string;
  productId: string;
  sellerId: string;
  campaignId: string | null;
  name: string;
  thumbnail: string | null;
  variantId: string | null;
  variantName: string | null;
  price: number;
  quantity: number;
  isCampaign: boolean;
  shippingFee: number;
  freeShipping: boolean;
  freeShippingThreshold: number | null;
}

// 장바구니 할인 설정 (상담사별) — 소계가 threshold 이상이면 rate% 할인
interface CartDiscountInfo {
  threshold: number;
  rate: number;
  label: string;
}

interface CartClientProps {
  initialItems: CartItem[];
}

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function CartClient({ initialItems }: CartClientProps) {
  const router = useRouter();
  const { appAlert } = useAppDialog();
  // 점집 컨텍스트면 "상담 둘러보기/계속하기"는 메인이 아닌 해당 점집 홈으로 보낸다.
  const { shop } = useShopChrome();
  const shoppingHref = shop ? `/shop/${shop.slug}` : "/";
  const [items, setItems] = useState<CartItem[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialItems.map((i) => i.id)));
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [ordering, setOrdering] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [reservationNumber, setOrderNumber] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", memo: "" });
  // 장바구니 할인 설정 per seller
  const [cartDiscounts, setCartDiscounts] = useState<Record<string, CartDiscountInfo | null>>({});

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  // Fetch discount info for each unique seller
  useEffect(() => {
    const sellerIds = [...new Set(items.map((i) => i.sellerId))];
    sellerIds.forEach(async (sellerId) => {
      try {
        const res = await fetch(`/api/buyer/discount-info?sellerId=${sellerId}`);
        const data = await res.json();
        setCartDiscounts((prev) => ({ ...prev, [sellerId]: data.cartDiscount || null }));
      } catch {
        // ignore
      }
    });
  }, [items]);

  const totalPrice = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Calculate total discount (selected items only)
  const sellerGroups = selectedItems.reduce((acc, item) => {
    if (!acc[item.sellerId]) acc[item.sellerId] = [];
    acc[item.sellerId].push(item);
    return acc;
  }, {} as Record<string, CartItem[]>);

  let totalDiscount = 0;
  const discountBreakdown: { label: string; amount: number; rate: number }[] = [];
  // 장바구니 할인 문턱 미달 넛지: "○○원 더 담으면 N% 할인"
  const cartDiscountNudges: { remaining: number; rate: number }[] = [];

  Object.entries(sellerGroups).forEach(([sellerId, sellerItems]) => {
    const sellerTotal = sellerItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const cartDiscount = cartDiscounts[sellerId];
    if (!cartDiscount) return;

    // 장바구니 할인 — 상담사별 소계가 기준금액 이상이면 적용 (확정 계산은 서버 api/orders)
    if (sellerTotal >= cartDiscount.threshold) {
      const cartAmount = Math.round(sellerTotal * cartDiscount.rate / 100);
      if (cartAmount > 0) {
        totalDiscount += cartAmount;
        discountBreakdown.push({
          label: cartDiscount.label,
          amount: cartAmount,
          rate: cartDiscount.rate,
        });
      }
    } else {
      cartDiscountNudges.push({ remaining: cartDiscount.threshold - sellerTotal, rate: cartDiscount.rate });
    }
  });

  // 라이브 점사는 배송이 없어 배송비를 더하지 않는다.
  const finalTotal = totalPrice - totalDiscount;

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, quantity: newQuantity }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
          )
        );
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const removeItem = async (itemId: string) => {
    setLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch("/api/cart", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleOrder = async () => {
    if (selectedItems.length === 0) {
      appAlert("예약할 상담상품을 선택해주세요.");
      return;
    }

    if (!showContact) {
      setShowContact(true);
      return;
    }

    if (!contact.name || !contact.phone) {
      appAlert("예약자 이름과 연락처를 입력해주세요.");
      return;
    }

    setOrdering(true);
    try {
      // Group selected items by seller
      const groups = selectedItems.reduce((acc, item) => {
        if (!acc[item.sellerId]) {
          acc[item.sellerId] = { items: [], campaignId: item.campaignId };
        }
        acc[item.sellerId].items.push(item);
        return acc;
      }, {} as Record<string, { items: CartItem[]; campaignId: string | null }>);

      // Create orders for each seller group
      let lastOrderNumber = "";
      for (const [sellerId, group] of Object.entries(groups)) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sellerId,
            campaignId: null,
            items: group.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.name,
              variantName: item.variantName,
              price: item.price,
              quantity: item.quantity,
            })),
            customerName: contact.name,
            customerPhone: contact.phone,
            shippingMemo: contact.memo,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          lastOrderNumber = data.order.reservationNumber;
        } else {
          const data = await res.json();
          await appAlert(data.error || "예약 처리에 실패했습니다.");
          setOrdering(false);
          return;
        }
      }

      setOrderNumber(lastOrderNumber);
      setOrderComplete(true);
      // 예약 완료된 아이템만 제거, 선택 안 된 아이템은 유지
      const orderedIds = new Set(selectedItems.map((i) => i.id));
      setItems((prev) => prev.filter((i) => !orderedIds.has(i.id)));
      setSelectedIds(new Set());
    } catch {
      appAlert("예약 중 오류가 발생했습니다.");
    } finally {
      setOrdering(false);
    }
  };

  const cartHeader = (
    <div className="sticky top-12 z-30 bg-white border-b border-gray-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900">
          <Icon name="ArrowRight" size={20} strokeWidth={1.5} className="rotate-180" />
        </button>
        <h1 className="text-base font-bold text-gray-900">상담 예약함</h1>
        <span className="text-xs text-gray-400">{items.length}개</span>
      </div>
    </div>
  );

  if (orderComplete) {
    return (
      <><div className="text-center py-16 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
          <Icon name="Check" size={32} strokeWidth={1.5} className="text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">예약이 완료되었습니다!</h2>
        <p className="text-sm text-gray-500 mb-1">예약번호: {reservationNumber}</p>
        <p className="text-xs text-gray-400 mb-6">결제 확인 후 상담 방식이 시작됩니다.</p>
        {totalDiscount > 0 && (
          <p className="text-xs text-brand-600 mb-4">
            <Sparkles size={12} className="inline mr-1" />
            할인 혜택 {formatPrice(totalDiscount)}이 적용되었습니다!
          </p>
        )}
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <Link
            href="/my/orders"
            className="btn-primary w-full py-3 text-center"
          >
            예약 내역 보기
          </Link>
          <Link
            href={shoppingHref}
            className="btn-outline w-full py-3 text-center"
          >
            상담 더 둘러보기
          </Link>
        </div>
      </div></>
    );
  }

  if (items.length === 0) {
    return (
      <>{cartHeader}
      <div className="text-center py-20 px-4">
        <Icon name="Cart" size={48} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-gray-500">예약함이 비어있습니다.</p>
        <Link
          href={shoppingHref}
          className="inline-block mt-4 text-sm text-brand-600 hover:underline"
        >
          상담 둘러보기
        </Link>
      </div></>
    );
  }

  return (
    <>
      {cartHeader}
      {/* Discount banner */}
      {discountBreakdown.length > 0 && (
        <div className="mx-4 mt-4">
          <div className="bg-gradient-to-r from-brand-50 to-purple-50 rounded-xl border border-brand-100 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="Tag" size={14} className="text-brand-600" />
              <span className="text-xs font-bold text-brand-700">할인 혜택 적용 중!</span>
            </div>
            <div className="space-y-1">
              {discountBreakdown.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-600">
                    <Icon name="Cart" size={10} className="inline mr-0.5 text-brand-500" />{d.label} ({d.rate}%)
                  </span>
                  <span className="text-brand-600 font-semibold">-{formatPrice(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 장바구니 할인 문턱 미달 넛지 */}
      {cartDiscountNudges.length > 0 && (
        <div className="mx-4 mt-2">
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 space-y-1">
            {cartDiscountNudges.map((n, i) => (
              <p key={i} className="text-[11px] text-amber-700">
                <Icon name="Cart" size={12} className="inline mr-1" />
                <b>{formatPrice(n.remaining)}</b> 더 담으면 <b>{n.rate}% 묶음 예약 할인</b>을 받을 수 있어요!
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 전체 선택 */}
      <div className="px-4 pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            onClick={toggleSelectAll}
            className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
              selectedIds.size === items.length
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-gray-300 text-transparent hover:border-gray-400"
            )}
          >
            <Icon name="Check" size={13} strokeWidth={3} />
          </button>
          <span className="text-sm text-gray-700">
            전체 선택 ({selectedIds.size}/{items.length})
          </span>
        </label>
      </div>

      <div className="px-4 pt-3 space-y-3">
        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <div key={item.id} className={cn("bg-white rounded-xl border p-3 transition-all", loading[item.id] && "opacity-60", isSelected ? "border-brand-200" : "border-gray-100 opacity-70")}>
              <div className="flex gap-3">
                {/* 체크박스 */}
                <button
                  onClick={() => toggleSelect(item.id)}
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 mt-7",
                    isSelected
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "border-gray-300 text-transparent hover:border-gray-400"
                  )}
                >
                  <Icon name="Check" size={13} strokeWidth={3} />
                </button>
                <Link href={`/products/${item.productId}`} className="flex-shrink-0">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <SafeImage
                      src={item.thumbnail}
                      alt={item.name}
                      width={80}
                      height={80}
                      fallbackText="No Img"
                    />
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1">
                    <p className="text-sm font-medium text-gray-900 truncate flex-1">{item.name}</p>
                  </div>
                  {item.variantName && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{item.variantName}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-sm font-bold text-gray-900">
                      {formatPrice(item.price)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1 || loading[item.id]}
                        className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <Minus size={14} strokeWidth={1.5} />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={loading[item.id]}
                        className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <Icon name="Plus" size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={loading[item.id]}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      <Icon name="Delete" size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 예약자 정보 */}
      {showContact && (
        <div className="px-4 mt-4">
          <BookingContactForm value={contact} onChange={setContact} />
        </div>
      )}

      {/* 결제 요약 */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">결제 요약</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">상담상품 금액</span>
              <span className="font-medium">{formatPrice(totalPrice)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-600 flex items-center gap-1">
                  <Icon name="Tag" size={12} />
                  할인
                </span>
                <span className="font-medium text-brand-600">-{formatPrice(totalDiscount)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">총 결제금액</span>
                <div className="text-right">
                  {totalDiscount > 0 && (
                    <p className="text-[10px] text-gray-400 line-through">{formatPrice(totalPrice)}</p>
                  )}
                  <span className="text-lg font-bold text-brand-600">
                    {formatPrice(finalTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 예약 버튼 */}
      <div className="px-4 mt-4 pb-4">
        <button
          onClick={handleOrder}
          disabled={ordering || selectedItems.length === 0}
          className="btn-primary w-full py-4 text-base disabled:opacity-50"
        >
          {ordering ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              예약 처리 중...
            </span>
          ) : showContact ? (
            <>
              <Icon name="Cart" size={18} strokeWidth={1.5} className="mr-2" />
              {formatPrice(finalTotal)} 결제하기
            </>
          ) : (
            <>
              <Icon name="Cart" size={18} strokeWidth={1.5} className="mr-2" />
              {selectedItems.length > 0 ? `선택 상담상품 예약하기 (${selectedItems.length})` : "상담상품을 선택해주세요"}
            </>
          )}
        </button>
      </div>
    </>
  );
}
