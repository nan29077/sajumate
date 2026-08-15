"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, Clock } from "lucide-react";

// 점집 공개 페이지의 예약 달력.
// 서버에서 내려준 "날짜별 예약 가능 시간" 맵을 그대로 그린다.
// 날짜 클릭 → 시간 목록, 시간 클릭 → 예약 플로우(/shop/[slug]/book)로 이동.

export interface DaySlots {
  /** YYYY-MM-DD */
  date: string;
  /** "14:00" 형태 오름차순 */
  times: string[];
}

interface Props {
  sellerSlug: string;
  slots: DaySlots[];
  themeColor: string;
  /** 오늘 날짜 YYYY-MM-DD (서버 기준, 클라이언트 시계 의존 제거) */
  today: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function ShopBookingCalendar({ sellerSlug, slots, themeColor, today }: Props) {
  const router = useRouter();

  const slotMap = useMemo(() => {
    const m = new Map<string, string[]>();
    slots.forEach((s) => m.set(s.date, s.times));
    return m;
  }, [slots]);

  const [ty, tm] = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return [y, m - 1];
  }, [today]);

  const [cursor, setCursor] = useState({ year: ty, month: tm });
  const [picked, setPicked] = useState<string | null>(slots[0]?.date ?? null);

  const firstDay = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const pickedTimes = picked ? slotMap.get(picked) ?? [] : [];

  const goBook = (date: string, time: string) => {
    router.push(`/shop/${sellerSlug}/book?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`);
  };

  const monthLabel = `${cursor.year}년 ${cursor.month + 1}월`;

  return (
    <div className="rounded-3xl border border-brand-100/70 bg-white p-4 shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
      <div className="flex items-center gap-1.5 mb-3">
        <CalendarDays size={15} strokeWidth={1.8} style={{ color: themeColor }} />
        <h2 className="text-sm font-bold text-gray-900">예약 달력</h2>
      </div>

      {/* 월 이동 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => move(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
          aria-label="이전 달"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-[13px] font-bold text-gray-900">{monthLabel}</p>
        <button
          type="button"
          onClick={() => move(1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
          aria-label="다음 달"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[10px] font-semibold py-1 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const key = ymd(cursor.year, cursor.month, d);
          const times = slotMap.get(key);
          const has = !!times && times.length > 0;
          const isToday = key === today;
          const isPicked = key === picked;

          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => setPicked(key)}
              className={`relative aspect-square rounded-lg text-[12px] font-medium transition-all ${
                isPicked
                  ? "text-white font-bold"
                  : has
                    ? "text-gray-800 hover:bg-gray-50"
                    : "text-gray-300 cursor-not-allowed"
              }`}
              style={isPicked ? { backgroundColor: themeColor } : undefined}
            >
              {d}
              {has && !isPicked && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: themeColor }}
                />
              )}
              {isToday && !isPicked && (
                <span className="absolute inset-0 rounded-lg border border-gray-200" />
              )}
            </button>
          );
        })}
      </div>

      {/* 선택 날짜의 가능 시간 */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        {slots.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-4">
            아직 열린 예약 시간이 없습니다.
            <br />
            <span className="text-[11px] text-gray-300">상담사가 시간을 열면 여기에 표시됩니다.</span>
          </p>
        ) : !picked || pickedTimes.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-4">
            예약 가능한 날짜(점 표시)를 선택해 주세요.
          </p>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <Clock size={11} /> {picked} 예약 가능 시간
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pickedTimes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => goBook(picked, t)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all hover:scale-[1.03] active:scale-95"
                  style={{ color: themeColor, borderColor: `${themeColor}55`, backgroundColor: `${themeColor}12` }}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
