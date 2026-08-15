"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import { X, Loader2, Layers, Image as ImageIcon } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";
import { DEFAULT_PRODUCT_IMAGE } from "@/lib/defaults";
import { parseJsonArray } from "@/lib/utils";

interface Props {
  productId: string;
  productName?: string;
  // 트리거 버튼 커스텀 (없으면 기본 "자세히 보기" 버튼)
  triggerClassName?: string;
  triggerLabel?: string;
  iconOnly?: boolean;
}

interface DetailData {
  id: string;
  name: string;
  description: string | null;
  detailContent: string | null;
  basePrice: number | null;
  comparePrice: number | null;
  supplyPrice: number | null;
  middleAdminMargin: number | null;
  coupangLowestPrice: number | null;
  naverLowestPrice: number | null;
  thumbnail: string | null;
  totalStock: number;
  badges: string | null;
  shippingFee: number;
  freeShipping: boolean;
  brand: { brandName: string } | null;
  category: { name: string } | null;
  variants: { id: string; name: string; price: number; stock: number }[];
  images: { id: string; url: string }[];
  _count?: { reviews: number };
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

const BADGE_LABEL: Record<string, string> = {
  FREE_SHIPPING: "무료배송", NEW: "신규", BEST: "베스트",
  HOT_DEAL: "특가", LIMITED: "한정판", HANDMADE: "핸드메이드",
};

export default function ProductDetailModal({ productId, productName, triggerClassName, triggerLabel, iconOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DetailData | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setData(json.product);
            setActiveImage(json.product?.thumbnail || json.product?.images?.[0]?.url || null);
          }
        } else {
          if (!cancelled) setError("상담상품 정보를 불러오지 못했습니다.");
        }
      } catch {
        if (!cancelled) setError("상담상품 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, productId, data]);

  const badges = data?.badges ? parseJsonArray(data.badges) : [];
  const gallery = data
    ? [data.thumbnail, ...(data.images?.map((i) => i.url) || [])].filter((u, i, arr): u is string => !!u && arr.indexOf(u) === i)
    : [];

  return (
    <>
      {iconOnly ? (
        <button
          onClick={() => setOpen(true)}
          className={triggerClassName || "p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"}
          title="자세히 보기"
        >
          <Icon name="Info" size={14} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={triggerClassName || "flex items-center gap-1 text-[10px] py-1.5 px-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors"}
        >
          <Icon name="Info" size={12} /> {triggerLabel || "자세히 보기"}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up sm:animate-scale-in">
            {/* Handle bar (mobile) */}
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Icon name="Package" size={18} className="text-brand-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-gray-900 truncate">{data?.name || productName || "상담상품 상세정보"}</h3>
                  <p className="text-[10px] text-gray-400">등록된 상담상품 정보</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : error ? (
                <div className="text-center py-20 text-gray-400">
                  <Icon name="Package" size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{error}</p>
                </div>
              ) : data ? (
                <div className="px-5 pb-5 space-y-4">
                  {/* 이미지 갤러리 */}
                  <div className="pt-4 space-y-2">
                    <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden max-w-[280px] mx-auto">
                      <SafeImage
                        src={activeImage}
                        placeholder={DEFAULT_PRODUCT_IMAGE}
                        alt={data.name}
                        width={320}
                        height={320}
                        fallbackText={data.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {gallery.length > 1 && (
                      <div className="flex items-center gap-1.5 justify-center flex-wrap">
                        {gallery.slice(0, 8).map((url) => (
                          <button
                            key={url}
                            onClick={() => setActiveImage(url)}
                            className={`w-11 h-11 rounded-lg overflow-hidden border-2 transition-all ${activeImage === url ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100"}`}
                          >
                            <SafeImage src={url} placeholder={DEFAULT_PRODUCT_IMAGE} alt="" width={44} height={44} fallbackText="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 상담상품 기본 정보 */}
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                    <p className="text-[15px] font-bold text-gray-900 leading-snug">{data.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {data.category && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Icon name="Tag" size={10} /> {data.category.name}
                        </span>
                      )}
                      {badges.map((b) => (
                        <span key={b} className="text-[10px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">{BADGE_LABEL[b] || b}</span>
                      ))}
                    </div>
                    <div className="flex items-baseline gap-2 pt-1">
                      {data.comparePrice != null && data.basePrice != null && data.comparePrice > data.basePrice && (
                        <span className="text-sm text-gray-400 line-through">{won(data.comparePrice)}</span>
                      )}
                      {data.basePrice != null ? (
                        <span className="text-xl font-bold text-gray-900">{won(data.basePrice)}</span>
                      ) : data.supplyPrice != null ? (
                        <span className="text-xl font-bold text-gray-900">공급가 {won(data.supplyPrice)}</span>
                      ) : (
                        <span className="text-sm text-gray-400">가격 미설정</span>
                      )}
                    </div>
                    {/* 공급가/마진 — 값이 있을 때만 (권한자 화면) */}
                    {(data.supplyPrice != null || data.middleAdminMargin != null) && data.basePrice != null && (
                      <p className="text-[11px] text-gray-400">
                        {data.supplyPrice != null && <span>공급가 {won(data.supplyPrice)}</span>}
                        {data.supplyPrice != null && data.middleAdminMargin != null && " · "}
                        {data.middleAdminMargin != null && <span>중간관리자 마진 {won(data.middleAdminMargin)}</span>}
                      </p>
                    )}
                    {/* 외부 최저가 참고 */}
                    {(data.coupangLowestPrice != null || data.naverLowestPrice != null) && (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        {data.coupangLowestPrice != null && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
                            쿠팡 최저가: {won(data.coupangLowestPrice)}
                          </span>
                        )}
                        {data.naverLowestPrice != null && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
                            네이버 최저가: {won(data.naverLowestPrice)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 옵션 */}
                  {data.variants && data.variants.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><Layers size={13} /> 옵션</p>
                      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                        {data.variants.map((v) => (
                          <div key={v.id} className="flex items-center justify-between px-3.5 py-2.5">
                            <span className="text-[13px] text-gray-800">{v.name}</span>
                            <span className="text-[12px] text-gray-500">{won(v.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 상담 안내 태그 */}
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                      <Icon name="Calendar" size={11} /> 예약 즉시 확정
                    </span>
                    <span className="flex items-center gap-1 bg-green-50 text-green-600 px-2.5 py-1 rounded-full"><Icon name="Certified" size={11} /> 전액 환불 가능</span>
                    {data._count && (
                      <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full"><Icon name="Star" size={11} className="fill-amber-400 text-amber-400" /> 후기 {data._count.reviews}</span>
                    )}
                  </div>

                  {/* 간단 설명 */}
                  {data.description && (
                    <div className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3.5 leading-relaxed whitespace-pre-wrap">
                      {data.description}
                    </div>
                  )}

                  {/* 상세 콘텐츠 */}
                  {data.detailContent && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><ImageIcon size={13} /> 상세 설명</p>
                      <div className="prose prose-sm max-w-none text-[13px] text-gray-700 border border-gray-100 rounded-xl p-3.5" dangerouslySetInnerHTML={{ __html: data.detailContent }} />
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* 하단 */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50 sm:rounded-b-2xl">
              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 text-sm font-medium text-gray-600 bg-white rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
              >
                닫기
              </button>
            </div>
          </div>

          <style jsx>{`
            @keyframes slide-up { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
            .animate-slide-up { animation: slide-up 0.3s ease-out; }
            @keyframes scale-in { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
            .animate-scale-in { animation: scale-in 0.2s ease-out; }
          `}</style>
        </div>
      )}
    </>
  );
}
