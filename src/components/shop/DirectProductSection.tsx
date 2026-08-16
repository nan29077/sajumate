"use client";

// 점집 상담상품(DirectProduct) 목록 + 시간 선택 바텀시트
// 고객이 상품을 선택 → 시간 옵션 선택 → 결제 페이지로 이동

import { useState } from "react";
import { X, Clock, Video, Phone, MapPin, ChevronRight } from "lucide-react";
import SafeImage from "@/components/shared/SafeImage";
import { DEFAULT_PRODUCT_IMAGE } from "@/lib/defaults";

export interface DirectProductItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  images: string[];
}

interface DurationOption {
  duration: number;
  price: number;
}

interface ConsultMeta {
  type: "VIDEO" | "PHONE" | "VISIT";
  durations: DurationOption[];
  note: string;
}

const TYPE_META = {
  VIDEO: { label: "영상 상담", Icon: Video },
  PHONE: { label: "전화 상담", Icon: Phone },
  VISIT: { label: "방문 상담", Icon: MapPin },
};

function parseMeta(description: string | null, fallbackPrice: number): ConsultMeta {
  if (!description) return { type: "VIDEO", durations: [{ duration: 30, price: fallbackPrice }], note: "" };
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object") {
      const type: "VIDEO" | "PHONE" | "VISIT" =
        ["VIDEO", "PHONE", "VISIT"].includes(parsed.type) ? parsed.type : "VIDEO";
      const note = typeof parsed.note === "string" ? parsed.note : "";
      if (Array.isArray(parsed.durations) && parsed.durations.length > 0) {
        const durations = parsed.durations.filter(
          (d: unknown): d is DurationOption =>
            typeof d === "object" &&
            d !== null &&
            Number.isFinite((d as any).duration) &&
            (d as any).duration > 0 &&
            Number.isFinite((d as any).price)
        );
        if (durations.length > 0) return { type, durations, note };
      }
      // 구형: 단일 duration
      const dur = Number.isFinite(Number(parsed.duration)) && Number(parsed.duration) > 0
        ? Math.floor(Number(parsed.duration))
        : 30;
      return { type, durations: [{ duration: dur, price: fallbackPrice }], note };
    }
  } catch { /* fallthrough */ }
  return { type: "VIDEO", durations: [{ duration: 30, price: fallbackPrice }], note: "" };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

interface Props {
  products: DirectProductItem[];
  sellerId: string;
  themeColor?: string;
}

export default function DirectProductSection({ products, sellerId, themeColor = "#6D4BC3" }: Props) {
  const [selected, setSelected] = useState<DirectProductItem | null>(null);

  if (products.length === 0) return null;

  const meta = selected ? parseMeta(selected.description, selected.price) : null;
  const TypeMeta = meta ? TYPE_META[meta.type] : null;

  const handleBook = (duration: number, price: number) => {
    if (!selected) return;
    const url = `/checkout?type=direct&productId=${selected.id}&sellerId=${sellerId}&selectedDuration=${duration}&selectedPrice=${price}`;
    window.location.href = url;
  };

  return (
    <>
      <ul className="space-y-2.5">
        {products.map((p) => {
          const m = parseMeta(p.description, p.price);
          const tm = TYPE_META[m.type];
          const TypeIcon = tm.Icon;
          const minPrice = Math.min(...m.durations.map((d) => d.price));
          const hasMultiple = m.durations.length > 1;

          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="w-full text-left flex items-center gap-3 rounded-2xl border border-transparent bg-[#FAF9FD] p-3 transition-all hover:border-brand-100 hover:bg-white hover:shadow-sm active:scale-[0.99]"
              >
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-brand-50">
                  <SafeImage
                    src={p.images[0] || null}
                    placeholder={DEFAULT_PRODUCT_IMAGE}
                    alt={p.name}
                    width={64}
                    height={64}
                    fallbackText={p.name.charAt(0)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{p.name}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                    <TypeIcon size={11} strokeWidth={1.6} />
                    <span>{tm.label}</span>
                    {hasMultiple ? (
                      <span className="text-brand-400 font-medium">· {m.durations.length}가지 시간</span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        · <Clock size={10} strokeWidth={1.5} /> {formatDuration(m.durations[0].duration)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[14px] font-extrabold" style={{ color: themeColor }}>
                    {hasMultiple ? `${formatPrice(minPrice)}~` : formatPrice(m.durations[0].price)}
                  </p>
                </div>
                <span
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 flex items-center gap-0.5"
                  style={{ backgroundColor: `${themeColor}18`, color: themeColor }}
                >
                  선택 <ChevronRight size={12} strokeWidth={2} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 시간 선택 바텀시트 */}
      {selected && meta && TypeMeta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelected(null)}
          />
          <div className="relative bg-white w-full max-w-md rounded-t-2xl shadow-2xl animate-slide-up">
            {/* 헤더 */}
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <TypeMeta.Icon size={15} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                <p className="text-sm font-bold text-gray-900 truncate">{selected.name}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex-shrink-0 ml-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-all"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* 안내 */}
            <div className="px-5 pt-4 pb-1">
              <p className="text-[12px] font-semibold text-gray-700">상담 시간을 선택하세요</p>
              {meta.note && (
                <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{meta.note}</p>
              )}
            </div>

            {/* 시간 옵션 목록 */}
            <div className="px-5 py-3 space-y-2">
              {meta.durations.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleBook(d.duration, d.price)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-brand-100 bg-brand-50/50 hover:bg-brand-50 hover:border-brand-200 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={15} strokeWidth={1.5} style={{ color: themeColor }} />
                    <span className="text-[14px] font-bold text-gray-900">{formatDuration(d.duration)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-extrabold" style={{ color: themeColor }}>
                      {formatPrice(d.price)}
                    </span>
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: themeColor, color: "white" }}
                    >
                      예약
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* 하단 여백 */}
            <div style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }} />
          </div>
        </div>
      )}
    </>
  );
}
