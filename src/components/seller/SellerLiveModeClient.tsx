"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw, Link2, Check } from "lucide-react";

interface LiveSlot {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  customerName: string | null;
  status: string | null;
}

interface LiveReservation {
  id: string;
  customerName: string;
  status: string;
  reservationDate: string;
  reservationTime: string;
  productName: string | null;
  finalAmount: number;
  createdAt: string;
}

interface LiveStatus {
  date: string;
  totalSlots: number;
  reservedSlots: number;
  availableSlots: number;
  slots: LiveSlot[];
  recentReservations: LiveReservation[];
}

const REFRESH_MS = 30_000;

/** 브라우저 로컬 기준 오늘 날짜(YYYY-MM-DD) */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function monthDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function SellerLiveModeClient({ shopName, slug }: { shopName: string; slug: string }) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/seller/live-status?date=${localToday()}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "현황을 불러오지 못했습니다.");
        return;
      }
      setStatus(await res.json());
      setError("");
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch {
      setError("현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 30초 자동 갱신 — 방송 중 화면을 띄워두고 남은 자리를 확인하는 용도
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const copyBookingLink = async () => {
    const url = `${window.location.origin}/shop/${slug}/book`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("링크 복사에 실패했습니다.");
    }
  };

  return (
    <div className="dashboard-page max-w-4xl">
      {/* 헤더 */}
      <div className="dashboard-page-header flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="dashboard-icon-tile"><CalendarClock size={19} /></span>
          <div>
          <h1 className="text-xl sm:text-2xl font-black text-brand-950">예약 현황</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {shopName} · {status?.date ?? localToday()} · 30초마다 자동 갱신
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyBookingLink}
            className="dashboard-action"
          >
            {copied ? <Check size={15} className="text-green-500" /> : <Link2 size={15} />}
            {copied ? "복사됨" : "예약 링크"}
          </button>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {/* 오늘 상담 현황 — 방송 중 한눈에 보이도록 크게 */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "전체 상담 수", value: status?.totalSlots ?? 0, className: "dashboard-stat text-brand-950" },
          { label: "예약 완료", value: status?.reservedSlots ?? 0, className: "bg-gradient-to-br from-brand-600 to-brand-950 text-white shadow-[0_14px_30px_rgba(36,20,69,0.16)]" },
          { label: "남은 자리", value: status?.availableSlots ?? 0, className: "border border-moon-500/25 bg-gradient-to-br from-moon-50 to-white text-brand-950" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-4 sm:p-7 text-center ${s.className}`}>
            <p className="text-xs sm:text-sm font-medium opacity-60 mb-1.5">{s.label}</p>
            <p className="text-4xl sm:text-6xl font-black tabular-nums leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      {/* 오늘 예약 가능 시간 타임라인 */}
      <div className="dashboard-panel">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">오늘의 시간표</h2>
          {updatedAt && <span className="text-[11px] text-gray-300">갱신 {updatedAt}</span>}
        </div>
        {!status || status.slots.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            {loading ? "불러오는 중…" : "오늘 예약 가능한 시간이 없습니다. 예약 시간 설정에서 상담 가능 시간을 등록하세요."}
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {status.slots.map((s) => {
              const booked = s.customerName != null;
              return (
                <div
                  key={s.id}
                  className={`rounded-xl px-3 py-3 border-2 ${
                    booked
                      ? "bg-brand-950 border-brand-950 text-white"
                      : s.isAvailable
                        ? "bg-moon-50 border-moon-500/30 text-brand-950"
                        : "bg-gray-50 border-gray-100 text-gray-400"
                  }`}
                >
                  <p className="text-lg sm:text-xl font-black tabular-nums leading-tight">{s.startTime}</p>
                  <p className={`text-xs mt-1 ${booked ? "text-white/70" : "text-gray-500"}`}>
                    {booked ? s.customerName : s.isAvailable ? "예약 가능" : "마감"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 최근 예약 알림 */}
      <div className="dashboard-panel">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <h2 className="text-base font-bold text-gray-900">최근 예약 알림</h2>
        </div>
        {!status || status.recentReservations.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            {loading ? "불러오는 중…" : "아직 들어온 예약이 없습니다."}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {status.recentReservations.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-bold text-gray-900 truncate">
                    {monthDay(r.reservationDate)} {r.reservationTime} 예약됨 — {r.customerName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {r.productName || "상담"} · {relativeTime(r.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-700 flex-shrink-0 tabular-nums">
                  {r.finalAmount.toLocaleString()}원
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
