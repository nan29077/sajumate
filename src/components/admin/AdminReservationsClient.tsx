"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, X, CalendarClock } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface Reservation {
  id: string;
  reservationNumber: string;
  status: string;
  reservationDate: string;
  reservationTime: string;
  customerName: string;
  customerPhone: string;
  finalAmount: number;
  user: { id: string; name: string; email: string };
  seller: { id: string; shopName: string; slug: string; user: { name: string } };
  items: { productName: string; quantity: number }[];
  timeSlot: { startTime: string; endTime: string } | null;
}

interface Seller {
  id: string;
  shopName: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "예약 대기", color: "bg-moon-50 text-moon-700" },
  CONFIRMED: { label: "예약 확정", color: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "상담 완료", color: "bg-green-50 text-green-700" },
  CANCELLED: { label: "취소됨",   color: "bg-gray-100 text-gray-500" },
  NO_SHOW:   { label: "노쇼",      color: "bg-red-50 text-red-600" },
};

const FILTER_TABS = [
  { value: "ALL", label: "전체" },
  { value: "PENDING", label: "대기" },
  { value: "CONFIRMED", label: "확정" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELLED", label: "취소" },
  { value: "NO_SHOW", label: "노쇼" },
];

export default function AdminReservationsClient({
  reservations,
  sellers,
  initialFilters,
}: {
  reservations: Reservation[];
  sellers: Seller[];
  initialFilters: { status: string; consultantId: string; dateFrom: string; dateTo: string };
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState(initialFilters.status);
  const [consultantId, setConsultantId] = useState(initialFilters.consultantId);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (consultantId) params.set("consultantId", consultantId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    router.push(`/admin/reservations?${params.toString()}`);
    setShowFilters(false);
  };

  const handleReset = () => {
    setStatusFilter("ALL");
    setConsultantId("");
    setDateFrom("");
    setDateTo("");
    router.push("/admin/reservations");
    setShowFilters(false);
  };

  // 클라이언트 사이드 검색 (이름/전화번호/예약번호)
  const filtered = reservations.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        r.reservationNumber.toLowerCase().includes(q) ||
        r.seller.shopName.toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="dashboard-page max-w-6xl mx-auto min-w-0">
      {/* 헤더 */}
      <div className="dashboard-page-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="dashboard-icon-tile"><CalendarClock size={19} /></span>
          <div>
          <h1 className="text-xl font-bold text-brand-950">예약 관리</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">상담 일정과 처리 상태를 확인합니다 · 총 {reservations.length}건</p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="dashboard-action"
        >
          <Filter size={15} />
          필터
        </button>
      </div>

      {/* 필터 패널 */}
      {showFilters && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 space-y-3">
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">상담사</label>
              <select
                value={consultantId}
                onChange={e => setConsultantId(e.target.value)}
                className="input-field py-2 text-sm"
              >
                <option value="">전체</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.shopName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">상태</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="input-field py-2 text-sm"
              >
                {FILTER_TABS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">시작일</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="input-field py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">종료일</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="input-field py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="btn-primary px-4 py-2 text-sm"
            >
              적용
            </button>
            <button
              onClick={handleReset}
              className="btn-outline px-4 py-2 text-sm"
            >
              초기화
            </button>
          </div>
        </div>
      )}

      {/* 검색 */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="고객명, 연락처, 예약번호, 상담사 검색"
          className="input-field pl-9 pr-9 py-2.5 text-sm"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={15} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`dashboard-tab flex-shrink-0 ${
              statusFilter === tab.value ? "dashboard-tab-active" : ""
            }`}
          >
            {tab.label}
            <span className="ml-1 opacity-60">
              {tab.value === "ALL"
                ? reservations.length
                : reservations.filter(r => r.status === tab.value).length}
            </span>
          </button>
        ))}
      </div>

      {/* 모바일 예약 카드 */}
      <div className="grid gap-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="dashboard-empty dashboard-panel">조회된 예약이 없습니다.</div>
        ) : filtered.map((r) => {
          const s = STATUS_MAP[r.status] || { label: r.status, color: "bg-gray-100 text-gray-500" };
          const date = new Date(r.reservationDate);
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          return (
            <article key={r.id} className="dashboard-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-brand-950">{r.customerName}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{r.seller.shopName} · {r.items[0]?.productName || "상담"}</p>
                </div>
                <span className={`flex-none rounded-full px-2 py-1 text-[10px] font-semibold ${s.color}`}>{s.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-brand-50/60 p-3 text-xs">
                <div><p className="text-[10px] text-gray-400">상담 일시</p><p className="mt-0.5 font-semibold text-gray-700">{dateStr} {r.reservationTime}</p></div>
                <div className="text-right"><p className="text-[10px] text-gray-400">결제 금액</p><p className="mt-0.5 font-bold text-brand-700">{formatPrice(r.finalAmount)}</p></div>
              </div>
              <p className="mt-2 text-[10px] text-gray-400">{r.reservationNumber} · {r.customerPhone}</p>
            </article>
          );
        })}
      </div>

      {/* 데스크톱 테이블 */}
      <div className="dashboard-panel hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50/60 border-b border-brand-100">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">예약번호</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">상담사</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">고객명</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">상담 상품</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">날짜</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">시간</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">상태</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    조회된 예약이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const s = STATUS_MAP[r.status] || { label: r.status, color: "bg-gray-100 text-gray-500" };
                  const date = new Date(r.reservationDate);
                  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400">{r.reservationNumber}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{r.seller.shopName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-800">{r.customerName}</p>
                        <p className="text-xs text-gray-400">{r.customerPhone}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">
                        {r.items[0]?.productName || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{dateStr}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.reservationTime}
                        {r.timeSlot && <span className="text-gray-400"> ~ {r.timeSlot.endTime}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {formatPrice(r.finalAmount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length}건 표시 중 (전체 {reservations.length}건)
          </div>
        )}
      </div>
    </div>
  );
}
