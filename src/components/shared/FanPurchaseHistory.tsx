"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
import { X, Loader2 } from 'lucide-react';
import { paymentMethodLabel } from "@/lib/payment";
import ProductImage from "@/components/shared/ProductImage";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: "결제대기", color: "bg-gray-100 text-gray-600" },
  PAID: { label: "결제완료", color: "bg-blue-50 text-blue-600" },
  CONFIRMED: { label: "확인됨", color: "bg-indigo-50 text-indigo-600" },
  SHIPPING: { label: "상담 진행중", color: "bg-cyan-50 text-cyan-600" },
  DELIVERED: { label: "상담 완료", color: "bg-green-50 text-green-600" },
  CANCELLED: { label: "취소됨", color: "bg-red-50 text-red-600" },
  REFUND_REQUESTED: { label: "환불요청", color: "bg-orange-50 text-orange-600" },
  REFUNDED: { label: "환불완료", color: "bg-gray-100 text-gray-500" },
};

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";
const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");

interface FanOrderItem {
  id: string;
  productName: string;
  variantName?: string | null;
  price: number;
  quantity: number;
  totalPrice: number;
  thumbnail?: string | null;
}

interface FanOrder {
  id: string;
  reservationNumber: string;
  sellerName: string;
  status: string;
  paymentMethod?: string | null;
  finalAmount: number;
  campaignTitle?: string | null;
  createdAt: string;
  paidAt?: string | null;
  thumbnail?: string | null;
  items: FanOrderItem[];
}

interface Props {
  userId: string;
  userName: string;
  /** 기본 예약 건수 (버튼에 표시). API 응답 전까지 노출용 */
  reservationCount?: number;
  /** 버튼 스타일: 행 우측 작은 버튼 */
  variant?: "button" | "compact";
}

export default function FanPurchaseHistory({ userId, userName, reservationCount, variant = "button" }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<FanOrder[]>([]);
  const [summary, setSummary] = useState<{ reservationCount: number; totalSpent: number } | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/fans/${userId}/orders`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "구매내역을 불러오지 못했습니다.");
        setOrders([]);
      } else {
        setOrders(data.orders || []);
        setSummary(data.summary || null);
      }
    } catch {
      setError("구매내역을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    load();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className={
          variant === "compact"
            ? "inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-2.5 py-1.5"
            : "inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg px-2.5 py-1.5"
        }
      >
        <Icon name="Cart" size={12} />
        구매내역{typeof reservationCount === "number" ? ` ${reservationCount}` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Icon name="Receipt" size={18} className="text-brand-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{userName} 구매내역</h3>
                  {summary && (
                    <p className="text-[11px] text-gray-400">
                      총 {summary.reservationCount}건 · 누적 결제 {formatPrice(summary.totalSpent)}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Loader2 size={28} className="animate-spin mb-2" />
                  <p className="text-xs">불러오는 중...</p>
                </div>
              ) : error ? (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-sm">{error}</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Icon name="Cart" size={40} strokeWidth={1.5} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">구매내역이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {orders.map((o) => {
                    const st = STATUS_MAP[o.status] || { label: o.status, color: "bg-gray-100 text-gray-600" };
                    return (
                      <div key={o.id} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                              {st.label}
                            </span>
                            <span className="text-[10px] text-gray-400">{formatDate(o.paidAt || o.createdAt)}</span>
                          </div>
                          <span className="text-[10px] text-gray-300">{o.reservationNumber}</span>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-12 h-12 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
                            <ProductImage src={o.thumbnail} alt="예약 상담상품" width={48} height={48} />
                          </div>
                          <div className="flex-1 min-w-0">
                            {o.items.map((it) => (
                              <div key={it.id} className="flex justify-between gap-2 text-xs py-0.5">
                                <span className="text-gray-700 truncate">
                                  {it.productName}
                                  {it.variantName && (
                                    <span className="text-gray-400"> · {it.variantName}</span>
                                  )}
                                  <span className="text-gray-400"> ×{it.quantity}</span>
                                </span>
                                <span className="text-gray-500 flex-shrink-0">{formatPrice(it.totalPrice)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
                          <span className="text-[10px] text-gray-400">
                            {paymentMethodLabel(o.paymentMethod)} · {o.sellerName}
                          </span>
                          <span className="text-sm font-bold text-gray-900">{formatPrice(o.finalAmount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
