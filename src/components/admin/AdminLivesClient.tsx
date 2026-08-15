"use client";

// 관리자 라이브 관리 — 전체 라이브 목록 + 방송별 예약 현황
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, RefreshCw, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface LiveRow {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  shareCode: string;
  viewerCount: number;
  peakViewerCount: number;
  platform: string | null;
  productCount: number;
  shopName: string;
  shopSlug: string;
  consultantName: string | null;
  sellerId: string;
  reservations: { total: number; confirmed: number; completed: number };
  reservationSettings: { dailySlotLimit: number | null; showReservationWidget: boolean } | null;
}

const STATUS_TABS = [
  { key: "ALL", label: "전체" },
  { key: "LIVE", label: "방송 중" },
  { key: "SCHEDULED", label: "예정" },
  { key: "ENDED", label: "종료" },
] as const;

const STATUS_BADGE: Record<LiveRow["status"], { label: string; cls: string }> = {
  SCHEDULED: { label: "예정", cls: "bg-amber-50 text-amber-600" },
  LIVE: { label: "LIVE", cls: "bg-red-50 text-red-600" },
  ENDED: { label: "종료", cls: "bg-gray-100 text-gray-500" },
  CANCELLED: { label: "취소", cls: "bg-gray-100 text-gray-400" },
};

export default function AdminLivesClient() {
  const [status, setStatus] = useState("ALL");
  const [sellerFilter, setSellerFilter] = useState("");
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [sellers, setSellers] = useState<{ id: string; shopName: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status, page: String(page) });
      if (sellerFilter) qs.set("sellerId", sellerFilter);
      const res = await fetch(`/api/admin/lives?${qs.toString()}`);
      const body = await res.json();
      if (res.ok) {
        setRows(body.lives);
        setSellers(body.sellers);
        setTotal(body.total);
        setTotalPages(body.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [status, sellerFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="dashboard-icon-tile text-red-500 bg-red-50 ring-red-100"><Radio size={19} /></span>
          <div>
            <h1 className="text-lg font-bold text-brand-950">라이브 상담 관리</h1>
            <p className="text-xs text-gray-500 mt-0.5">방송 상태와 실시간 예약을 확인합니다 · 총 {total}건</p>
          </div>
        </div>
        <button
          onClick={load}
          className="dashboard-action"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          새로고침
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setPage(1);
                setStatus(t.key);
              }}
              className={`dashboard-tab whitespace-nowrap ${
                status === t.key
                  ? "dashboard-tab-active"
                  : ""
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={sellerFilter}
          onChange={(e) => {
            setPage(1);
            setSellerFilter(e.target.value);
          }}
          className="input-field w-full sm:w-auto py-2 text-xs text-gray-600"
        >
          <option value="">전체 점집</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shopName}
            </option>
          ))}
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <div className="dashboard-empty dashboard-panel">불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="dashboard-empty dashboard-panel">
          <Radio size={30} className="mb-2 text-brand-200" />
          라이브 상담이 없습니다.
        </div>
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {rows.map((row) => {
            const badge = STATUS_BADGE[row.status];
            const when = row.startedAt || row.scheduledAt;
            return (
              <Link key={row.id} href={`/admin/lives/${row.id}`} className="dashboard-panel p-4 transition-colors hover:border-brand-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                        {row.status === "LIVE" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{row.platform || "라이브"}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-brand-950">{row.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.shopName} · {row.consultantName || "상담사"}</p>
                  </div>
                  <div className="flex-none rounded-xl bg-brand-50 px-3 py-2 text-right ring-1 ring-inset ring-brand-100">
                    <p className="text-sm font-black text-brand-700">{row.reservations.total}건</p>
                    <p className="text-[9px] font-medium text-brand-400">예약</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-brand-50 pt-3 text-[11px] text-gray-400">
                  <span>{when ? new Date(when).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "일정 미정"}</span>
                  <span>현재 {row.viewerCount}명 · 최고 {row.peakViewerCount}명</span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="dashboard-panel hidden overflow-x-auto md:block">
          <table className="w-full text-xs min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">방송</th>
                <th className="px-4 py-3 font-medium">점집 / 상담사</th>
                <th className="px-4 py-3 font-medium">일시</th>
                <th className="px-4 py-3 font-medium text-right">시청</th>
                <th className="px-4 py-3 font-medium text-right">예약 현황</th>
                <th className="px-4 py-3 font-medium text-right">예약 시간 설정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = STATUS_BADGE[row.status];
                const when = row.startedAt || row.scheduledAt;
                return (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${badge.cls}`}
                      >
                        {row.status === "LIVE" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        )}
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/lives/${row.id}`}
                        className="font-semibold text-brand-950 hover:text-brand-600"
                      >
                        {row.title}
                      </Link>
                      <p className="text-[10px] text-gray-400">
                        <Link href={`/live/${row.shareCode}`} target="_blank" className="hover:underline">
                          {row.shareCode}
                        </Link>{" "}
                        · 상품 {row.productCount}개
                        {row.platform ? ` · ${row.platform}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.shopName}
                      <p className="text-[10px] text-gray-400">{row.consultantName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {when ? new Date(when).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {row.viewerCount}
                      <span className="text-[10px] text-gray-300"> / 최고 {row.peakViewerCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-600">
                        <Calendar size={11} />
                        {row.reservations.total}건
                      </span>
                      <p className="text-[10px] text-gray-400">
                        확정 {row.reservations.confirmed} · 완료 {row.reservations.completed}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {row.reservationSettings
                        ? row.reservationSettings.dailySlotLimit != null
                          ? `당일 ${row.reservationSettings.dailySlotLimit}건`
                          : "무제한"
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="dashboard-action min-h-9 px-2 disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="dashboard-action min-h-9 px-2 disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
