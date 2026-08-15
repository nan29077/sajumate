"use client";

import { Icon } from "@/components/shared/Icon";
import { useMemo, useState } from "react";
import { useAppDialog } from "@/components/shared/AppDialog";
import { calcWithholding, calcVat } from "@/lib/tax";
import Pagination, { usePagination } from "@/components/shared/Pagination";

export interface TaxRecord {
  id: string;
  name: string; // 상호/성명
  bizNumber: string; // 사업자등록번호 or 주민등록번호
  repName: string; // 대표자명
  amount: number; // 출금(지급)액
  date: string; // ISO 지급일시
}

interface Props {
  sellerBusiness: TaxRecord[];
  sellerNonBusiness: TaxRecord[];
  brands: TaxRecord[];
  middleAdmins: TaxRecord[];
}

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const pad = (n: number) => String(n).padStart(2, "0");
const toYm = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const toYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

type MainTab = "seller" | "brand" | "middle";
type SellerSub = "biz" | "nonbiz";
type FilterMode = "month" | "day";

interface AggRow {
  name: string;
  bizNumber: string;
  repName: string;
  amount: number;
  count: number;
}

function aggregate(records: TaxRecord[]): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of records) {
    const key = `${r.bizNumber}|${r.name}`;
    const cur =
      map.get(key) ?? { name: r.name, bizNumber: r.bizNumber, repName: r.repName, amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export default function AdminTaxClient({ sellerBusiness, sellerNonBusiness, brands, middleAdmins }: Props) {
  const { appAlert } = useAppDialog();
  const now = new Date();
  const [mainTab, setMainTab] = useState<MainTab>("seller");
  const [sellerSub, setSellerSub] = useState<SellerSub>("biz");
  const [mode, setMode] = useState<FilterMode>("month");
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [day, setDay] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);

  // 현재 탭 데이터 & 세금 방식 판정
  const isWithholding = mainTab === "seller" && sellerSub === "nonbiz";
  const data: TaxRecord[] =
    mainTab === "seller"
      ? sellerSub === "biz"
        ? sellerBusiness
        : sellerNonBusiness
      : mainTab === "brand"
        ? brands
        : middleAdmins;

  const filtered = useMemo(() => {
    const key = mode === "month" ? month : day;
    return data
      .filter((r) => (mode === "month" ? toYm(r.date) : toYmd(r.date)) === key)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, mode, month, day]);

  // 세무 상세 목록 페이지네이션 (페이지당 20건) — 원천징수/부가세 두 테이블 공용
  const { pageItems, page, setPage, totalPages } = usePagination(filtered, 20);

  // 합계 계산 (원천징수·부가세 필드를 항상 모두 포함)
  const totals = useMemo(() => {
    let gross = 0,
      income = 0,
      local = 0,
      tax = 0,
      net = 0,
      total = 0,
      supply = 0,
      vat = 0;
    for (const r of filtered) {
      if (isWithholding) {
        const w = calcWithholding(r.amount);
        gross += w.gross;
        income += w.incomeTax;
        local += w.localTax;
        tax += w.totalTax;
        net += w.net;
      } else {
        const v = calcVat(r.amount);
        total += v.total;
        supply += v.supply;
        vat += v.vat;
      }
    }
    return { gross, income, local, tax, net, total, supply, vat };
  }, [filtered, isWithholding]);

  const memberCount = useMemo(() => aggregate(filtered).length, [filtered]);

  const periodLabel = mode === "month" ? month : day;
  const tabLabel =
    mainTab === "seller"
      ? sellerSub === "biz"
        ? "사업자상담사"
        : "비사업자상담사"
      : mainTab === "brand"
        ? "브랜드"
        : "중간관리자";

  // 엑셀 다운로드 (홈택스 신고 양식 — 회원별 월 합계)
  const handleExport = async () => {
    if (filtered.length === 0) {
      await appAlert("선택한 기간에 신고할 내역이 없습니다.");
      return;
    }
    const XLSX = await import("xlsx");
    const agg = aggregate(filtered);

    let rows: Record<string, any>[];
    let cols: { wch: number }[];
    let sheetName: string;
    let filename: string;

    if (isWithholding) {
      // 원천징수 신고 양식 (소득세 3% + 지방소득세 0.3%)
      rows = agg.map((m) => {
        const w = calcWithholding(m.amount);
        return {
          성명: m.name,
          주민등록번호: m.bizNumber,
          지급건수: m.count,
          지급총액: w.gross,
          "소득세(3%)": w.incomeTax,
          "지방소득세(0.3%)": w.localTax,
          원천징수세액합계: w.totalTax,
          실지급액: w.net,
        };
      });
      rows.push({
        성명: "합계",
        주민등록번호: "",
        지급건수: agg.reduce((s, m) => s + m.count, 0),
        지급총액: totals.gross,
        "소득세(3%)": totals.income,
        "지방소득세(0.3%)": totals.local,
        원천징수세액합계: totals.tax,
        실지급액: totals.net,
      });
      cols = [{ wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
      sheetName = "원천징수내역";
      filename = `원천징수신고_${tabLabel}_${periodLabel}.xlsx`;
    } else {
      // 부가세 매입세금계산서 합계표 양식 (공급가액 + 세액)
      rows = agg.map((m) => {
        const v = calcVat(m.amount);
        return {
          사업자등록번호: m.bizNumber,
          "상호(법인명)": m.name,
          대표자명: m.repName,
          매수: m.count,
          공급가액: v.supply,
          세액: v.vat,
          합계금액: v.total,
        };
      });
      rows.push({
        사업자등록번호: "합계",
        "상호(법인명)": "",
        대표자명: "",
        매수: agg.reduce((s, m) => s + m.count, 0),
        공급가액: totals.supply,
        세액: totals.vat,
        합계금액: totals.total,
      });
      cols = [{ wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
      sheetName = "매입세금계산서합계표";
      filename = `부가세매입신고_${tabLabel}_${periodLabel}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">세무 관리</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          회원별 출금(지급완료) 내역 · 원천징수 3.3% / 부가세 신고자료 · 홈택스 신고 양식 다운로드
        </p>
      </div>

      {/* 메인 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(
          [
            { key: "seller", label: "상담사", icon: "Store" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mainTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 상담사 서브탭 */}
      {mainTab === "seller" && (
        <div className="flex gap-1 mb-4">
          {(
            [
              { key: "biz", label: "사업자 상담사" },
              { key: "nonbiz", label: "비사업자 상담사" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setSellerSub(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold border transition-all ${
                sellerSub === t.key
                  ? "bg-brand-500 text-black border-brand-500"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white rounded-2xl border border-gray-100 p-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(
            [
              { key: "month", label: "월별" },
              { key: "day", label: "일별" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                mode === m.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "month" ? (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-[13px] border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          />
        ) : (
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="text-[13px] border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          />
        )}
        <div className="flex-1" />
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          <Icon name="File" size={14} />
          {isWithholding ? "원천징수 신고 엑셀" : "부가세 매입 신고 엑셀"}
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="신고 대상 인원" value={`${memberCount}명`} tone="bg-white" />
        {isWithholding ? (
          <>
            <SummaryCard label="지급총액 합계" value={`${won(totals.gross)}원`} tone="bg-white" />
            <SummaryCard label="원천징수 합계 (3.3%)" value={`${won(totals.tax)}원`} tone="bg-orange-50" />
            <SummaryCard label="실지급액 합계" value={`${won(totals.net)}원`} tone="bg-white" />
          </>
        ) : (
          <>
            <SummaryCard label="합계금액 (부가세 포함)" value={`${won(totals.total)}원`} tone="bg-white" />
            <SummaryCard label="공급가액 합계" value={`${won(totals.supply)}원`} tone="bg-white" />
            <SummaryCard label="부가세액 합계" value={`${won(totals.vat)}원`} tone="bg-blue-50" />
          </>
        )}
      </div>

      {/* 상세 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h2 className="text-sm font-bold text-gray-900">
            {tabLabel} 출금 내역{" "}
            <span className="text-gray-400 font-normal">({mode === "month" ? `${month} 월` : fmtDate(day)})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-400">
            <Icon name="Receipt" size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">선택한 기간에 출금(지급완료) 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {isWithholding ? (
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-50 bg-gray-50/40">
                    <Th className="text-left">성명</Th>
                    <Th className="text-left">주민등록번호</Th>
                    <Th>지급일</Th>
                    <Th className="text-right">지급총액</Th>
                    <Th className="text-right">소득세(3%)</Th>
                    <Th className="text-right">지방소득세(0.3%)</Th>
                    <Th className="text-right">원천징수 합계</Th>
                    <Th className="text-right">실지급액</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageItems.map((r) => {
                    const w = calcWithholding(r.amount);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <Td className="text-left font-semibold text-gray-900">{r.name}</Td>
                        <Td className="text-left text-gray-500">{r.bizNumber || "-"}</Td>
                        <Td className="text-center text-gray-500">{fmtDate(r.date)}</Td>
                        <Td className="text-right font-semibold text-gray-900">{won(w.gross)}</Td>
                        <Td className="text-right text-gray-600">{won(w.incomeTax)}</Td>
                        <Td className="text-right text-gray-600">{won(w.localTax)}</Td>
                        <Td className="text-right font-semibold text-orange-600">{won(w.totalTax)}</Td>
                        <Td className="text-right text-gray-900">{won(w.net)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/60 font-bold text-gray-900">
                    <Td className="text-left" colSpan={3}>
                      합계
                    </Td>
                    <Td className="text-right">{won(totals.gross)}</Td>
                    <Td className="text-right">{won(totals.income)}</Td>
                    <Td className="text-right">{won(totals.local)}</Td>
                    <Td className="text-right text-orange-600">{won(totals.tax)}</Td>
                    <Td className="text-right">{won(totals.net)}</Td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-50 bg-gray-50/40">
                    <Th className="text-left">상호(법인명)</Th>
                    <Th className="text-left">사업자등록번호</Th>
                    <Th className="text-left">대표자</Th>
                    <Th>지급일</Th>
                    <Th className="text-right">합계금액(부가세 포함)</Th>
                    <Th className="text-right">공급가액</Th>
                    <Th className="text-right">부가세액</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageItems.map((r) => {
                    const v = calcVat(r.amount);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <Td className="text-left font-semibold text-gray-900">{r.name}</Td>
                        <Td className="text-left text-gray-500">{r.bizNumber || "-"}</Td>
                        <Td className="text-left text-gray-500">{r.repName || "-"}</Td>
                        <Td className="text-center text-gray-500">{fmtDate(r.date)}</Td>
                        <Td className="text-right font-semibold text-gray-900">{won(v.total)}</Td>
                        <Td className="text-right text-gray-600">{won(v.supply)}</Td>
                        <Td className="text-right font-semibold text-blue-600">{won(v.vat)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/60 font-bold text-gray-900">
                    <Td className="text-left" colSpan={4}>
                      합계
                    </Td>
                    <Td className="text-right">{won(totals.total)}</Td>
                    <Td className="text-right">{won(totals.supply)}</Td>
                    <Td className="text-right text-blue-600">{won(totals.vat)}</Td>
                  </tr>
                </tfoot>
              </table>
            )}
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`${tone} rounded-2xl border border-gray-100 p-4`}>
      <p className="text-[10px] text-gray-400 leading-tight mb-1.5">{label}</p>
      <p className="text-base font-extrabold text-gray-900">{value}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className || "text-center"}`}>{children}</th>;
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-2.5 ${className || "text-center"}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
