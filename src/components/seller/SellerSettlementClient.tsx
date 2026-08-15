"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle, XCircle, DollarSign, Building2, X, Loader2, Layers } from 'lucide-react';
import { useAppDialog } from "@/components/shared/AppDialog";
import Pagination, { usePagination } from "@/components/shared/Pagination";
import { isKoreanHoliday } from "@/lib/businessDays";
import { calcPayoutBreakdown } from "@/lib/payout";
import type { SellerSettlementSummary, SettlementOrder, PayoutSummary } from "@/lib/settlement";

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

const PAYOUT_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  REQUESTED: { label: "요청됨", color: "bg-indigo-50 text-indigo-600", icon: Send },
  APPROVED: { label: "승인됨", color: "bg-blue-50 text-blue-600", icon: CheckCircle },
  PAID: { label: "지급완료", color: "bg-emerald-50 text-emerald-700", icon: DollarSign },
  REJECTED: { label: "반려됨", color: "bg-red-50 text-red-600", icon: XCircle },
};

// 캘린더/상세용 출금 상태 그룹 표시 — 진행중(노랑/주황) · 완료(초록) · 거절(빨강)
const payoutCalendarStatus = (status: string): { label: string; chip: string } => {
  if (status === "PAID" || status === "COMPLETED")
    return { label: "완료", chip: "bg-emerald-50 text-emerald-700" };
  if (status === "REJECTED" || status === "CANCELLED")
    return { label: "거절", chip: "bg-red-50 text-red-600" };
  // REQUESTED / PENDING / PROCESSING / APPROVED 등 진행 중 상태
  return { label: "진행중", chip: "bg-amber-50 text-amber-700" };
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const ymdOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

interface Props {
  summary: SellerSettlementSummary;
  shopName: string;
  defaultAccountHolder: string;
  defaultIsBusiness: boolean;
  // 설정(상담사 정보 · 정산 계좌)에 등록해 둔 값 — 출금 폼 초기값으로 채운다
  defaultCompanyName?: string;
  defaultBizNumber?: string;
  defaultBankName?: string;
  defaultAccountNumber?: string;
  // 읽기 전용(브랜드/중간관리자): 출금 요청/내역 숨기고 정산 조회만 표시
  readOnly?: boolean;
  title?: string;
  // 출금 수수료율(%) — 최고관리자 설정값(Setting: payoutFeeRate), 없으면 0
  payoutFeeRate?: number;
}

export default function SellerSettlementClient({
  summary,
  shopName,
  defaultAccountHolder,
  defaultIsBusiness,
  defaultCompanyName = "",
  defaultBizNumber = "",
  defaultBankName = "",
  defaultAccountNumber = "",
  readOnly = false,
  title = "정산 내역",
  payoutFeeRate = 0,
}: Props) {
  const { appAlert } = useAppDialog();
  const router = useRouter();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showScheduledDetail, setShowScheduledDetail] = useState(false);
  const [payoutFilter, setPayoutFilter] = useState<"all" | "REQUESTED" | "APPROVED" | "PAID" | "REJECTED">("all");

  // 출금 요청 폼 상태
  const [reqAmount, setReqAmount] = useState<string>("");
  // 사업자 여부는 상담사 프로필 값으로 고정된다(서버도 프로필 기준으로만 판단).
  // 여기서 임의로 바꿀 수 있으면 화면의 원천징수 미리보기가 실제 지급액과 어긋난다.
  const reqIsBusiness = defaultIsBusiness;
  const [reqBizNumber, setReqBizNumber] = useState(defaultBizNumber);
  const [reqCompanyName, setReqCompanyName] = useState(defaultCompanyName);
  const [reqBankName, setReqBankName] = useState(defaultBankName);
  const [reqAccountNumber, setReqAccountNumber] = useState(defaultAccountNumber);
  const [reqAccountHolder, setReqAccountHolder] = useState(defaultAccountHolder || "");
  const [reqAgreed, setReqAgreed] = useState(false);

  // 설정의 은행명은 자유 입력이라 목록에 없는 값일 수 있다. 그대로 두면 select가 빈칸으로
  // 보여 저장해 둔 계좌가 사라진 것처럼 되므로, 목록에 없으면 옵션으로 추가한다.
  const bankOptions = useMemo(() => {
    const banks = ["국민은행", "신한은행", "우리은행", "하나은행", "농협", "카카오뱅크", "토스뱅크", "기업은행", "SC제일은행"];
    return defaultBankName && !banks.includes(defaultBankName) ? [defaultBankName, ...banks] : banks;
  }, [defaultBankName]);

  // 날짜별 집계: 판매일 기준 / 정산 확정(도래) 기준 / 정산 예정(미도래) 기준
  const { salesByDate, confirmedByDate, pendingByDate } = useMemo(() => {
    const sales = new Map<string, { count: number; gross: number; orders: SettlementOrder[] }>();
    const confirmed = new Map<string, { count: number; amount: number; orders: SettlementOrder[] }>();
    const pending = new Map<string, { count: number; amount: number; orders: SettlementOrder[] }>();
    for (const o of summary.orders) {
      const s = sales.get(o.saleYmd) ?? { count: 0, gross: 0, orders: [] };
      s.count++; s.gross += o.grossAmount; s.orders.push(o);
      sales.set(o.saleYmd, s);

      // 정산일 도래(available=true) → confirmedByDate, 미도래(예정) → pendingByDate
      const target = o.available ? confirmed : pending;
      const a = target.get(o.settlementYmd) ?? { count: 0, amount: 0, orders: [] };
      a.count++; a.amount += o.settlementAmount; a.orders.push(o);
      target.set(o.settlementYmd, a);
    }
    return { salesByDate: sales, confirmedByDate: confirmed, pendingByDate: pending };
  }, [summary.orders]);

  // 날짜별 출금 신청 집계 (요청일 기준) — 캘린더에 빨간 계열로 표시.
  // 반려건은 실제로 빠져나가지 않은 돈이므로 출금 금액(amount) 합계에서 제외하고
  // rejectedAmount 로 따로 집계해 별도 마커로 보여준다.
  const payoutsByDate = useMemo(() => {
    const map = new Map<
      string,
      { count: number; amount: number; rejectedAmount: number; rejectedCount: number; payouts: PayoutSummary[] }
    >();
    for (const p of summary.payouts) {
      const d = new Date(p.requestedAt);
      const ymd = ymdOf(d.getFullYear(), d.getMonth(), d.getDate());
      const cur = map.get(ymd) ?? { count: 0, amount: 0, rejectedAmount: 0, rejectedCount: 0, payouts: [] };
      cur.count++;
      if (p.status === "REJECTED") {
        cur.rejectedCount++;
        cur.rejectedAmount += p.amount;
      } else {
        cur.amount += p.amount;
      }
      cur.payouts.push(p);
      map.set(ymd, cur);
    }
    return map;
  }, [summary.payouts]);

  // 캘린더 격자
  const calendarCells = useMemo(() => {
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: ({ day: number; ymd: string } | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, ymd: ymdOf(viewYear, viewMonth, d) });
    return cells;
  }, [viewYear, viewMonth]);

  const todayYmd = ymdOf(today.getFullYear(), today.getMonth(), today.getDate());

  const selectedSales = selectedYmd ? salesByDate.get(selectedYmd) : undefined;
  const selectedConfirmed = selectedYmd ? confirmedByDate.get(selectedYmd) : undefined;
  const selectedPending = selectedYmd ? pendingByDate.get(selectedYmd) : undefined;
  const selectedPayouts = selectedYmd ? payoutsByDate.get(selectedYmd) : undefined;

  const prevMonth = () => {
    setSelectedYmd(null);
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    setSelectedYmd(null);
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  // 이번 달 합계 (캘린더 상단 요약)
  const monthTotals = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    let sales = 0, avail = 0, scheduled = 0, payout = 0;
    for (const [ymd, v] of salesByDate) if (ymd.startsWith(prefix)) sales += v.gross;
    for (const [ymd, v] of confirmedByDate) if (ymd.startsWith(prefix)) avail += v.amount;
    for (const [ymd, v] of pendingByDate) if (ymd.startsWith(prefix)) scheduled += v.amount;
    for (const [ymd, v] of payoutsByDate) if (ymd.startsWith(prefix)) payout += v.amount;
    return { sales, avail, scheduled, payout };
  }, [viewYear, viewMonth, salesByDate, confirmedByDate, pendingByDate, payoutsByDate]);

  // 정산 예정(정산일 도래 전) 예약을 A타입(내 상담상품)/B타입(신청상담상품)으로 구분
  const scheduledDetail = useMemo(() => {
    const scheduled = summary.orders.filter((o) => !o.available);
    const typeA = scheduled.filter((o) => o.productType === "seller");
    const typeB = scheduled.filter((o) => o.productType === "supply" || o.productType === "mixed");
    const orderName = (o: SettlementOrder) =>
      (o.productNames && o.productNames.length > 0 ? o.productNames.join(", ") : null) ||
      o.campaignTitle ||
      "일반 판매";
    return { typeA, typeB, orderName };
  }, [summary.orders]);

  // 입력한 출금 금액 파싱 및 초과 여부
  const parsedAmount = Math.floor(Number(reqAmount.replace(/[^0-9]/g, "")));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const amountOver = amountValid && parsedAmount > summary.withdrawableAmount;
  const effectiveAmount = amountValid ? parsedAmount : 0;

  // 수수료/원천징수 차감 내역 (서버와 동일한 공식 — 출금 요청 유형 기준)
  const breakdown = calcPayoutBreakdown(effectiveAmount, payoutFeeRate, reqIsBusiness);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/seller/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bizNumber: reqBizNumber,
          companyName: reqCompanyName,
          bankName: reqBankName,
          accountNumber: reqAccountNumber,
          accountHolder: reqAccountHolder,
          agreedDisclaimer: reqAgreed,
          amount: parsedAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        await appAlert({ message: data.error || "출금 요청에 실패했습니다.", type: "warning" });
        return;
      }
      await appAlert({
        message: `출금 요청이 접수되었습니다.\n요청 금액 ${formatPrice(data.payout.amount)}\n관리자 승인 후 지급이 진행됩니다.`,
        type: "success",
      });
      setShowRequest(false);
      setReqAgreed(false);
      router.refresh();
    } catch {
      await appAlert({ message: "출금 요청 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    reqBankName && reqAccountNumber && reqAccountHolder && reqBizNumber &&
    amountValid && !amountOver &&
    (reqIsBusiness ? reqCompanyName : reqAgreed);

  // 출금 요청 내역 상태 필터 (전체/요청됨/승인됨/지급완료/반려됨)
  const payoutCounts = useMemo(() => {
    const c: Record<string, number> = { all: summary.payouts.length, REQUESTED: 0, APPROVED: 0, PAID: 0, REJECTED: 0 };
    for (const p of summary.payouts) if (c[p.status] !== undefined) c[p.status]++;
    return c;
  }, [summary.payouts]);

  const filteredPayouts = useMemo(
    () => (payoutFilter === "all" ? summary.payouts : summary.payouts.filter((p) => p.status === payoutFilter)),
    [summary.payouts, payoutFilter],
  );

  // 반려된 출금 중 가장 최근 건 — 상단 안내 배너에 사유를 노출한다
  const latestRejected = useMemo(
    () => summary.payouts.find((p) => p.status === "REJECTED"),
    [summary.payouts],
  );

  // 출금 요청 내역 페이지네이션 (페이지당 20건)
  const { pageItems: payoutPageItems, page: payoutPage, setPage: setPayoutPage, totalPages: payoutTotalPages } = usePagination(filteredPayouts, 20);

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">
          {title}
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          수수료율 {summary.commissionRate}% (부가세 포함) · 정산주기 판매 후 영업일 {summary.businessDays}일
        </p>
      </div>

      {/* ★ 정산 가능 금액 (메인 카드 + 출금요청) */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="Wallet" size={16} className="opacity-80" />
            <span className="text-sm font-medium opacity-80">{readOnly ? "정산 가능 금액" : "출금 가능 금액"}</span>
          </div>
          <p className="text-3xl font-extrabold mt-1">{formatPrice(readOnly ? summary.availableTotal : summary.withdrawableAmount)}</p>
          {!readOnly && summary.inProgressAmount > 0 && (
            <p className="text-[11px] opacity-90 mt-1">
              {formatPrice(summary.inProgressAmount)} 출금 진행 중입니다. 진행 중인 금액은 출금 가능금액에서 제외되며, 반려 시 다시 포함됩니다.
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] opacity-80">
            <span>수수료 {summary.commissionRate}% (부가세 포함) 차감 후 · 정산 예정 {formatPrice(summary.scheduledTotal)}</span>
          </div>
          {!readOnly && (
            <button
              onClick={() => { setReqAmount(String(summary.withdrawableAmount)); setShowRequest(true); }}
              disabled={summary.withdrawableAmount <= 0}
              className="mt-4 w-full bg-white text-brand-700 rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="Share" size={15} /> 출금 요청하기
            </button>
          )}
        </div>
      </div>

      {/* 정산 예정 / 진행중 요약 */}
      <div className={`grid ${readOnly ? "grid-cols-1" : "grid-cols-2"} gap-2.5 mb-3`}>
        <div className="bg-white rounded-xl border border-orange-100 p-3.5">
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <span className="flex items-center gap-1.5">
              <Icon name="Clock" size={13} className="text-orange-500" />
              <span className="text-[10px] text-gray-400">정산 예정 금액</span>
            </span>
            <button
              onClick={() => setShowScheduledDetail(true)}
              className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Icon name="File" size={16} /> 상세 보기
            </button>
          </div>
          <p className="text-base font-bold text-orange-600">{formatPrice(summary.scheduledTotal)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">정산 확정 전 · 공급가 출금 예정</p>
        </div>
        {!readOnly && (
          <div className="bg-white rounded-xl border border-indigo-100 p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="Share" size={13} className="text-indigo-500" />
              <span className="text-[10px] text-gray-400">출금 진행중</span>
            </div>
            <p className="text-base font-bold text-indigo-600">{formatPrice(summary.inProgressAmount)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">요청·승인 (지급완료 시 0)</p>
          </div>
        )}
      </div>

      {/* 정산 구성 상세 (공급가가 있는 경우만 표시) */}
      {summary.totalSupplyAmount > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3.5 mb-5">
          <h3 className="text-[11px] font-bold text-gray-700 mb-2.5 flex items-center gap-1.5">
            <Layers size={13} className="text-gray-500" /> 정산 구성
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-gray-500"><Icon name="Store" size={11} /> 총 판매금액</span>
              <span className="font-semibold text-gray-800">{formatPrice(summary.totalGrossAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-rose-500"><Icon name="Settlement" size={11} /> 플랫폼 운영 정산</span>
              <span className="font-semibold text-rose-600">- {formatPrice(summary.totalSupplyAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-gray-500"><Icon name="Discount" size={11} /> 플랫폼 수수료</span>
              <span className="font-semibold text-gray-600">- {formatPrice(summary.totalCommissionAmount)}</span>
            </div>
            <div className="border-t border-gray-100 pt-1.5 flex items-center justify-between text-[11px]">
              <span className="font-bold text-gray-700">출금 가능 금액</span>
              <span className="font-extrabold text-brand-600">{formatPrice(summary.totalGrossAmount - summary.totalSupplyAmount - summary.totalCommissionAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ★ 캘린더 뷰 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="Calendar" size={16} className="text-brand-600" />
            <h2 className="text-sm font-bold text-gray-900">정산 캘린더</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
              <Icon name="ChevronDown" size={16} className="rotate-90" />
            </button>
            <span className="text-sm font-bold text-gray-800 w-24 text-center">
              {viewYear}년 {viewMonth + 1}월
            </span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
              <Icon name="ChevronDown" size={16} className="-rotate-90" />
            </button>
          </div>
        </div>

        {/* 월 요약 */}
        <div className="flex items-center gap-3 mb-3 text-[11px] flex-wrap">
          <span className="flex items-center gap-1 text-gray-500">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> 판매 {formatPrice(monthTotals.sales)}
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 정산확정 {formatPrice(monthTotals.avail)}
          </span>
          {monthTotals.scheduled > 0 && (
            <span className="flex items-center gap-1 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 정산예정 {formatPrice(monthTotals.scheduled)}
            </span>
          )}
          {summary.payouts.length > 0 && (
            <span className="flex items-center gap-1 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 출금 {formatPrice(monthTotals.payout)}
            </span>
          )}
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`text-center text-[10px] font-medium py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>
              {w}
            </div>
          ))}
        </div>

        {/* 날짜 격자 */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} />;
            const dow = idx % 7;
            const dateObj = new Date(viewYear, viewMonth, cell.day);
            const holiday = isKoreanHoliday(dateObj);
            const sale = salesByDate.get(cell.ymd);
            const conf = confirmedByDate.get(cell.ymd);
            const sched = pendingByDate.get(cell.ymd);
            const po = payoutsByDate.get(cell.ymd);
            const isToday = cell.ymd === todayYmd;
            const isSelected = cell.ymd === selectedYmd;
            const hasData = !!sale || !!conf || !!sched || !!po;

            return (
              <button
                key={cell.ymd}
                onClick={() => setSelectedYmd(isSelected ? null : cell.ymd)}
                className={`min-h-[66px] rounded-lg flex flex-col items-stretch justify-start pt-1 px-0.5 relative transition-all border ${
                  isSelected
                    ? "bg-brand-600 text-white border-brand-600"
                    : hasData
                    ? "bg-gray-50 border-gray-100 hover:border-brand-200"
                    : "border-transparent hover:bg-gray-50"
                }`}
              >
                <span className={`text-[12px] font-bold text-center ${
                  isSelected ? "text-white"
                  : dow === 0 || holiday ? "text-red-500"
                  : dow === 6 ? "text-blue-500"
                  : "text-gray-700"
                }`}>
                  {cell.day}
                </span>
                {isToday && !isSelected && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-500" />
                )}
                {/* 마커: 판매가 / 정산 확정 / 정산 예정 / 출금 구분 표시 */}
                <div className="flex flex-col gap-0.5 mt-1 w-full">
                  {sale && (
                    <span className={`w-full truncate text-center text-[9px] font-bold rounded leading-tight py-0.5 ${isSelected ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"}`}>
                      판매 {Math.round(sale.gross).toLocaleString("ko-KR")}원
                    </span>
                  )}
                  {conf && (
                    <span className={`w-full truncate text-center text-[9px] font-bold rounded leading-tight py-0.5 ${isSelected ? "bg-white/30 text-white" : "bg-emerald-50 text-emerald-700"}`}>
                      정산 {Math.round(conf.amount).toLocaleString("ko-KR")}원
                    </span>
                  )}
                  {sched && (
                    <span className={`w-full truncate text-center text-[9px] font-bold rounded leading-tight py-0.5 ${isSelected ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"}`}>
                      예정 {Math.round(sched.amount).toLocaleString("ko-KR")}원
                    </span>
                  )}
                  {po && po.amount > 0 && (
                    <span className={`w-full truncate text-center text-[9px] font-bold rounded leading-tight py-0.5 ${isSelected ? "bg-white/25 text-white" : "bg-red-50 text-red-600"}`}>
                      출금 {Math.round(po.amount).toLocaleString("ko-KR")}원
                    </span>
                  )}
                  {po && po.rejectedCount > 0 && (
                    <span className={`w-full truncate text-center text-[9px] font-bold rounded leading-tight py-0.5 ${isSelected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                      반려 {Math.round(po.rejectedAmount).toLocaleString("ko-KR")}원
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="px-1 rounded bg-emerald-50 text-emerald-600 font-bold">정산N원</span> 정산 확정</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded bg-amber-50 text-amber-600 font-bold">예정N원</span> 정산 예정</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded bg-blue-50 text-blue-500">판N원</span> 판매액</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded bg-red-50 text-red-500 font-bold">출N원</span> 출금 신청액</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded bg-gray-100 text-gray-500 font-bold">반N원</span> 반려 (출금액 미포함)</span>
        </div>
      </div>

      {/* ★ 선택 날짜 상세 */}
      {selectedYmd && (
        <div className="bg-white rounded-2xl border border-brand-100 p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Icon name="Calendar" size={15} className="text-brand-600" />
              {new Date(selectedYmd).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
            </h3>
            <button onClick={() => setSelectedYmd(null)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          {/* 그 날짜의 정산 확정(도래) 금액 */}
          <div className="bg-emerald-50 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-700 flex items-center gap-1">
                <Icon name="Check" size={13} /> 이 날짜 정산 확정 금액
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {formatPrice(selectedConfirmed?.amount ?? 0)}
              </span>
            </div>
            {selectedConfirmed && (
              <p className="text-[10px] text-emerald-600/70 mt-1">{selectedConfirmed.count}건 정산일 확정</p>
            )}
          </div>

          {/* 그 날짜의 정산 예정(미도래) 금액 */}
          {selectedPending && (
            <div className="bg-amber-50 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-700 flex items-center gap-1">
                  <Icon name="Clock" size={13} /> 이 날짜 정산 예정 금액
                </span>
                <span className="text-sm font-bold text-amber-700">
                  {formatPrice(selectedPending.amount)}
                </span>
              </div>
              <p className="text-[10px] text-amber-600/70 mt-1">{selectedPending.count}건 · 정산일 도래 후 출금 가능</p>
            </div>
          )}

          {/* 그 날짜의 출금 신청 내역 (빨간 계열, 상태별 진행중/완료/거절 표시) */}
          {selectedPayouts && selectedPayouts.payouts.length > 0 && (
            <div className="bg-red-50 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <Icon name="Share" size={13} /> 이 날짜 출금 신청
                </span>
                <span className="text-sm font-bold text-red-600">- {formatPrice(selectedPayouts.amount)}</span>
              </div>
              {selectedPayouts.rejectedCount > 0 && (
                <p className="text-[10px] text-gray-500 bg-white/70 rounded-lg px-2 py-1 mb-2">
                  반려 {selectedPayouts.rejectedCount}건 {formatPrice(selectedPayouts.rejectedAmount)}은 출금액 합계에서 제외했습니다.
                </p>
              )}
              <div className="space-y-1.5">
                {selectedPayouts.payouts.map((p) => {
                  const st = payoutCalendarStatus(p.status);
                  const isRejected = p.status === "REJECTED";
                  return (
                    <div key={p.id} className="bg-white rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${st.chip}`}>{st.label}</span>
                            <span className="text-[10px] text-gray-500 truncate">
                              {p.bankName} {p.accountNumber} {p.accountHolder ? `(${p.accountHolder})` : ""}
                            </span>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-0.5">
                            {isRejected ? "출금되지 않음 · 금액 복원됨" : `실지급 예정 ${formatPrice(p.netAmount)}`}
                          </p>
                        </div>
                        <p className={`text-[11px] font-bold flex-shrink-0 ml-2 ${isRejected ? "text-gray-400 line-through" : "text-red-600"}`}>
                          - {formatPrice(p.amount)}
                        </p>
                      </div>
                      {isRejected && p.note && (
                        <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 mt-1.5">
                          반려 사유: {p.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-red-400/80 mt-1.5">출금 신청일 기준으로 표시됩니다.</p>
            </div>
          )}

          {/* 해당 날짜의 판매 금액 + 각 판매분 정산 예정일 */}
          <div className="mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Icon name="Chart" size={13} /> 이 날짜 판매 금액
              </span>
              <span className="text-sm font-bold text-blue-600">
                {formatPrice(selectedSales?.gross ?? 0)}
              </span>
            </div>
            {selectedSales && selectedSales.orders.length > 0 ? (
              <div className="space-y-1.5">
                {selectedSales.orders.map((o) => (
                  <div key={o.orderId} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {o.type === "groupbuy" ? <Icon name="Cart" size={11} className="text-emerald-500 flex-shrink-0" /> : <Icon name="Package" size={11} className="text-gray-400 flex-shrink-0" />}
                          <span className="text-[11px] font-medium text-gray-700 truncate">
                            {o.campaignTitle || "일반 판매"}
                          </span>
                          {/* A/B 타입 뱃지 */}
                          {o.productType === "seller" && (
                            <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded flex-shrink-0">내 상담상품</span>
                          )}
                          {o.productType === "supply" && (
                            <span className="text-[9px] bg-rose-50 text-rose-600 px-1 py-0.5 rounded flex-shrink-0">신청상담상품</span>
                          )}
                          {o.productType === "mixed" && (
                            <span className="text-[9px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded flex-shrink-0">혼합</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          정산 예정일 <b className={o.available ? "text-emerald-600" : "text-orange-500"}>{fmtDate(o.settlementDate)}</b>
                          {o.available ? " (정산 가능)" : " (예정)"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-[11px] font-bold text-gray-800">{formatPrice(o.grossAmount)}</p>
                        <p className="text-[9px] text-gray-400">정산 {formatPrice(o.settlementAmount)}</p>
                      </div>
                    </div>
                    {/* 공급가 차감 내역 (B타입/혼합) */}
                    {o.supplyAmount > 0 && (
                      <div className="mt-1.5 border-t border-gray-100 pt-1.5 space-y-0.5">
                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                          <span>판매금액</span>
                          <span>{formatPrice(o.grossAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-rose-500">
                          <span>공급가 차감</span>
                          <span>- {formatPrice(o.supplyAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                          <span>수수료 ({o.commissionRate}%, 부가세 포함)</span>
                          <span>- {formatPrice(o.commissionAmount)}</span>
                        </div>
                        {o.cartDiscountAmount > 0 && (
                          <div className="flex items-center justify-between text-[9px] text-rose-500">
                            <span>묶음 예약 할인 부담</span>
                            <span>- {formatPrice(o.cartDiscountAmount)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[9px] font-bold text-brand-600">
                          <span>상담사 정산액</span>
                          <span>{formatPrice(o.settlementAmount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 py-2 text-center">이 날짜의 판매 내역이 없습니다.</p>
            )}
          </div>
        </div>
      )}

      {/* ★ 출금 요청 내역 (읽기 전용 역할에는 숨김) */}
      {!readOnly && (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
          <Icon name="Share" size={15} className="text-brand-600" /> 출금 요청 내역
        </h2>

        {/* 반려 안내 배너 — 가장 최근 반려건의 사유를 눈에 띄게 노출 */}
        {latestRejected && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 mb-3">
            <div className="flex items-start gap-2">
              <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-red-700">
                  반려된 출금 요청이 {payoutCounts.REJECTED}건 있습니다
                </p>
                <p className="text-[11px] text-red-600 mt-1 leading-relaxed">
                  {new Date(latestRejected.requestedAt).toLocaleDateString("ko-KR")} 신청 {formatPrice(latestRejected.amount)}
                  {latestRejected.note ? ` — ${latestRejected.note}` : " — 사유가 등록되지 않았습니다. 관리자에게 문의해 주세요."}
                </p>
                <p className="text-[10px] text-red-500/80 mt-1.5">
                  반려된 금액은 출금 가능 금액에 다시 포함되어 있어 사유 확인 후 재신청할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 상태 필터 */}
        {summary.payouts.length > 0 && (
          <div className="flex gap-1 mb-3 overflow-x-auto pb-0.5">
            {(["all", "REQUESTED", "APPROVED", "PAID", "REJECTED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setPayoutFilter(f); setPayoutPage(1); }}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  payoutFilter === f ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {f === "all" ? "전체" : PAYOUT_STATUS[f].label} {payoutCounts[f]}
              </button>
            ))}
          </div>
        )}

        {filteredPayouts.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100">
            <Icon name="Wallet" size={36} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">
              {summary.payouts.length === 0 ? "출금 요청 내역이 없습니다." : "해당 상태의 출금 요청이 없습니다."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {payoutPageItems.map((p) => {
              const st = PAYOUT_STATUS[p.status] || PAYOUT_STATUS.REQUESTED;
              const isRejected = p.status === "REJECTED";
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 ${isRejected ? "bg-red-50/40 border-red-100" : "bg-white border-gray-100"}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        <span className="text-[10px] text-gray-400">{new Date(p.requestedAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {p.bankName} {p.accountNumber} ({p.accountHolder}) · {p.reservationCount}건
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${isRejected ? "text-gray-400 line-through" : "text-brand-600"}`}>
                        {formatPrice(p.netAmount)}
                      </p>
                      <p className="text-[9px] text-gray-400">요청액 {formatPrice(p.amount)}</p>
                    </div>
                  </div>
                  {isRejected ? (
                    <div className="bg-white border border-red-100 rounded-lg px-2.5 py-2 mt-1">
                      <p className="text-[10px] font-bold text-red-600 mb-0.5">반려 사유</p>
                      <p className="text-[11px] text-red-600/90 leading-relaxed whitespace-pre-line">
                        {p.note || "사유가 등록되지 않았습니다. 관리자에게 문의해 주세요."}
                      </p>
                      {p.processedAt && (
                        <p className="text-[9px] text-gray-400 mt-1">
                          {new Date(p.processedAt).toLocaleDateString("ko-KR")} 처리 · 출금되지 않았으며 금액은 복원되었습니다
                        </p>
                      )}
                    </div>
                  ) : (
                    p.note && (
                      <p className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mt-1">{p.note}</p>
                    )
                  )}
                </div>
              );
            })}
            <Pagination currentPage={payoutPage} totalPages={payoutTotalPages} onPageChange={setPayoutPage} />
          </div>
        )}
      </div>
      )}

      {/* 정산 예정 상세 내역 모달 (A타입 / B타입 구분) */}
      {showScheduledDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <Icon name="File" size={17} className="text-orange-500" /> 정산 예정 상세 내역
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">정산 확정 전 · 총 {formatPrice(summary.scheduledTotal)}</p>
              </div>
              <button onClick={() => setShowScheduledDetail(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {scheduledDetail.typeA.length === 0 && scheduledDetail.typeB.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <Icon name="Clock" size={36} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">정산 예정 내역이 없습니다.</p>
                </div>
              )}

              {/* A타입: 내가 직접 등록한 상담상품 (판매가 전액 기준) */}
              {scheduledDetail.typeA.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Icon name="Tag" size={10} /> A타입 · 내 등록 상담상품
                    </span>
                    <span className="text-[10px] text-gray-400">판매가 전액이 정산 기준</span>
                  </div>
                  <div className="space-y-2">
                    {scheduledDetail.typeA.map((o) => (
                      <div key={o.orderId} className="bg-gray-50 rounded-lg px-3 py-2.5">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{scheduledDetail.orderName(o)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">정산 예정일 {fmtDate(o.settlementDate)}</p>
                        <div className="mt-1.5 space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span>판매가</span><span>{formatPrice(o.grossAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>플랫폼 수수료 ({o.commissionRate}%, 부가세 포함)</span><span>- {formatPrice(o.commissionAmount)}</span>
                          </div>
                          {o.cartDiscountAmount > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-rose-500">
                              <span>묶음 예약 할인 부담</span><span>- {formatPrice(o.cartDiscountAmount)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[11px] font-bold text-brand-600 pt-0.5">
                            <span>상담사 정산액</span><span>{formatPrice(o.settlementAmount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* B타입: 상담상품신청 판매 (판매가 - 공급가 기준) */}
              {scheduledDetail.typeB.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Icon name="Package" size={10} /> B타입 · 상담상품신청 판매
                    </span>
                    <span className="text-[10px] text-gray-400">판매가 − 공급가가 정산 기준</span>
                  </div>
                  <div className="space-y-2">
                    {scheduledDetail.typeB.map((o) => (
                      <div key={o.orderId} className="bg-gray-50 rounded-lg px-3 py-2.5">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{scheduledDetail.orderName(o)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">정산 예정일 {fmtDate(o.settlementDate)}</p>
                        <div className="mt-1.5 space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span>판매가</span><span>{formatPrice(o.grossAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-rose-500">
                            <span>공급가 차감</span><span>- {formatPrice(o.supplyAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span>플랫폼 수수료 ({o.commissionRate}%, 부가세 포함)</span><span>- {formatPrice(o.commissionAmount)}</span>
                          </div>
                          {o.cartDiscountAmount > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-rose-500">
                              <span>묶음 예약 할인 부담</span><span>- {formatPrice(o.cartDiscountAmount)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[11px] font-bold text-brand-600 pt-0.5">
                            <span>상담사 정산액</span><span>{formatPrice(o.settlementAmount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-rose-500 mt-2 flex items-start gap-1">
                    <Icon name="Info" size={11} className="flex-shrink-0 mt-0.5" />
                    플랫폼 운영분은 상담사 정산액과 분리해 계산됩니다.
                  </p>
                </div>
              )}
            </div>

            {/* 하단: 출금 가능 금액 안내 */}
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">출금 가능 금액 <span className="text-gray-400">(총 정산액 − 플랫폼수수료)</span></span>
                <span className="text-sm font-extrabold text-brand-600">{formatPrice(readOnly ? summary.availableTotal : summary.withdrawableAmount)}</span>
              </div>
              <button
                onClick={() => setShowScheduledDetail(false)}
                className="mt-3 w-full py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 출금 요청 모달 */}
      {!readOnly && showRequest && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">출금 요청</h3>
              <button onClick={() => setShowRequest(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* 금액 요약 + 수수료/원천징수 차감 내역 (실시간) */}
              <div className="bg-brand-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1 text-center">출금 요청 금액 (정산액)</p>
                <p className="text-2xl font-extrabold text-brand-600 text-center mb-3">{formatPrice(effectiveAmount)}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>출금 신청 금액</span>
                    <span className="font-semibold text-gray-800">{formatPrice(effectiveAmount)}</span>
                  </div>
                  {payoutFeeRate > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>수수료 ({payoutFeeRate}%)</span>
                      <span>- {formatPrice(breakdown.commissionAmount)}</span>
                    </div>
                  )}
                  {!reqIsBusiness && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>원천징수 3.3% (비사업자)</span>
                      <span>- {formatPrice(breakdown.withholdingTaxAmount)}</span>
                    </div>
                  )}
                  <div className="border-t border-brand-100 pt-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800">실제 입금 예정 금액</span>
                    <span className="text-sm text-amber-600 font-bold">{formatPrice(breakdown.actualPayoutAmount)}</span>
                  </div>
                </div>
              </div>

              {/* 출금 금액 입력 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-700">출금 요청 금액</label>
                  <button
                    type="button"
                    onClick={() => setReqAmount(String(summary.withdrawableAmount))}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                  >
                    전액 {formatPrice(summary.withdrawableAmount)}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="출금할 금액을 입력하세요"
                    value={reqAmount ? Number(reqAmount.replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : ""}
                    onChange={(e) => setReqAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    className={`input-field text-sm pr-9 ${amountOver ? "border-red-300 focus:border-red-400" : ""}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
                </div>
                {amountOver ? (
                  <p className="text-[11px] text-red-500 mt-1.5 flex items-start gap-1">
                    <Icon name="Warning" size={12} className="flex-shrink-0 mt-0.5" />
                    출금 가능 금액을 초과했습니다. (최대 {formatPrice(summary.withdrawableAmount)})
                  </p>
                ) : (
                  <p className="text-[10.5px] text-gray-400 mt-1.5">
                    출금 가능 금액 내에서 원하는 금액만 요청할 수 있습니다.
                  </p>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-2">
                <Icon name="Info" size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700">
                  입력한 금액에 대해 출금을 요청합니다.
                  실제 송금은 자동으로 실행되지 않으며, 관리자 승인 후 지급됩니다.
                </p>
              </div>

              {/* 사업자 유형 — 상담사 정보에 등록된 값으로 고정 */}
              <div>
                <label className="text-xs font-bold text-gray-700">사업자 유형</label>
                <div
                  className={`mt-1.5 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5 ${
                    reqIsBusiness
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-orange-50 border-orange-300 text-orange-700"
                  }`}
                >
                  {reqIsBusiness ? <Building2 size={14} /> : <Icon name="MyPage" size={14} />}
                  {reqIsBusiness ? "사업자" : "개인"}
                </div>
                <p className="text-[10.5px] text-gray-500 mt-1.5 flex items-start gap-1">
                  <Icon name="Info" size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  상담사 정보에 등록된 유형입니다. 변경하려면 상담사 정보에서 사업자 정보를 수정하세요.
                </p>
              </div>

              {/* 사업자: 상호명 */}
              {reqIsBusiness && (
                <div>
                  <label className="text-xs font-bold text-gray-700">상호명</label>
                  <input
                    type="text"
                    placeholder="사업자 상호명"
                    value={reqCompanyName}
                    onChange={(e) => setReqCompanyName(e.target.value)}
                    className="input-field mt-1.5 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700">
                  {reqIsBusiness ? "사업자등록번호" : "주민등록번호"}
                </label>
                <input
                  type="text"
                  placeholder={reqIsBusiness ? "000-00-00000" : "000000-0000000"}
                  value={reqBizNumber}
                  onChange={(e) => setReqBizNumber(e.target.value)}
                  className="input-field mt-1.5 text-sm"
                />
                {!reqIsBusiness && (
                  <p className="text-[10.5px] text-gray-500 mt-1.5 flex items-start gap-1">
                    <Icon name="Info" size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    입력하신 주민등록번호는 <b className="text-gray-600">원천징수 신고를 위한 것이며, 처리 후 즉시 폐기</b>됩니다.
                  </p>
                )}
              </div>

              {/* 사업자: 세금계산서 발행 안내 */}
              {reqIsBusiness && (
                <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-2">
                  <Building2 size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700">
                    사업자 상담사에게는 원천징수 없이 정산액 전액이 지급되며,
                    <b> 사주메이트(주식회사 이십세기소년들)가 매입 세금계산서를 발행</b>합니다.
                    입력하신 상호명·사업자등록번호 기준으로 발행됩니다.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700">은행</label>
                  <select value={reqBankName} onChange={(e) => setReqBankName(e.target.value)} className="input-field mt-1.5 text-sm">
                    <option value="">선택</option>
                    {bankOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700">예금주</label>
                  <input type="text" placeholder="예금주명" value={reqAccountHolder} onChange={(e) => setReqAccountHolder(e.target.value)} className="input-field mt-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700">계좌번호</label>
                <input type="text" placeholder="계좌번호 입력" value={reqAccountNumber} onChange={(e) => setReqAccountNumber(e.target.value)} className="input-field mt-1.5 text-sm" />
              </div>

              {!reqIsBusiness && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={reqAgreed} onChange={(e) => setReqAgreed(e.target.checked)} className="mt-0.5 accent-amber-600" />
                    <span className="text-[11px] text-amber-700">
                      <span className="font-medium">개인 상담사 원천징수 안내 동의</span><br />
                      소득세법에 따라 정산액의 3.3%(소득세 3% + 지방소득세 0.3%)가 원천징수되며, 이에 동의합니다.
                      매년 5월 종합소득세 신고 시 기납부 세액으로 공제됩니다.
                    </span>
                  </label>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowRequest(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl font-medium">취소</button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="px-5 py-2.5 bg-brand-600 text-white text-sm rounded-xl hover:bg-brand-700 font-medium disabled:opacity-40 flex items-center gap-1"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Icon name="Share" size={14} />}
                {submitting ? "요청 중..." : "출금 요청"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
