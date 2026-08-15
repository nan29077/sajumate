"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
import { Clock } from 'lucide-react';
import Pagination, { usePagination } from "@/components/shared/Pagination";

type UserOption = { id: string; name: string; email: string };

type Settlement = {
  id: string;
  recipientType: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  amount: number;
  memo: string | null;
  status: string;
  paidAt: string;
  adminName: string;
  createdAt: string;
};

type Props = {
  nodeUsers: UserOption[];
  settlements: Settlement[];
};

type TabKey = "CONSULTANT";

const TAB_LABELS: Record<TabKey, string> = {
  CONSULTANT: "상담사",
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function AdminManualSettlementClient({
  nodeUsers,
  settlements: initialSettlements,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("CONSULTANT");
  const [settlements, setSettlements] = useState<Settlement[]>(initialSettlements);
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const userOptions: Record<TabKey, UserOption[]> = {
    CONSULTANT: nodeUsers,
  };

  function resetForm() {
    setRecipientId("");
    setAmount("");
    setMemo("");
    setError("");
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    resetForm();
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!recipientId) { setError("수취인을 선택해주세요."); return; }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("올바른 금액을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/manual-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: activeTab,
          recipientId,
          amount: Number(amount),
          memo: memo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");

      // 새 정산 내역 추가 (optimistic)
      const opts = userOptions[activeTab];
      const user = opts.find((u) => u.id === recipientId);
      const newItem: Settlement = {
        id: data.settlement.id,
        recipientType: activeTab,
        recipientId,
        recipientName: user?.name ?? "-",
        recipientEmail: user?.email ?? "-",
        amount: Number(amount),
        memo: memo || null,
        status: "PAID",
        paidAt: new Date().toISOString(),
        adminName: "-",
        createdAt: new Date().toISOString(),
      };
      setSettlements((prev) => [newItem, ...prev]);
      setSuccess("수기 정산이 완료되었습니다.");
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredSettlements = settlements.filter((s) => s.recipientType === activeTab);

  const { pageItems, page, setPage, totalPages } = usePagination(filteredSettlements, 20);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Icon name="Edit" size={20} className="text-indigo-600" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">수기 정산</h1>
          <p className="text-sm text-gray-500">상담사에게 정산 조정금을 직접 지급합니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={
              "px-5 py-2 rounded-lg text-sm font-medium transition-all " +
              (activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 정산 입력 폼 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              {TAB_LABELS[activeTab]} 수기 정산 입력
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  수취인 선택 <span className="text-red-500">*</span>
                </label>
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">{TAB_LABELS[activeTab]} 선택...</option>
                  {userOptions[activeTab].map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  정산 금액 (원) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 50000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {amount && !isNaN(Number(amount)) && Number(amount) > 0 && (
                  <p className="text-xs text-indigo-600 mt-1">{fmt(Number(amount))}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">메모</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="정산 사유나 비고를 입력하세요."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                  <Icon name="Warning" size={14} strokeWidth={1.5} />
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2">
                  <Icon name="Check" size={14} strokeWidth={1.5} />
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {loading ? "처리 중..." : "지급 처리"}
              </button>
            </form>
          </div>
        </div>

        {/* 정산 내역 테이블 */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {TAB_LABELS[activeTab]} 수기 정산 내역
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({filteredSettlements.length}건)
                </span>
              </h2>
            </div>
            {filteredSettlements.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">
                수기 정산 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-medium">
                      <th className="px-4 py-3 text-left">수취인</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3 text-left">메모</th>
                      <th className="px-4 py-3 text-center">상태</th>
                      <th className="px-4 py-3 text-center">지급일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pageItems.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{s.recipientName}</p>
                          <p className="text-xs text-gray-400">{s.recipientEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {fmt(s.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">
                          {s.memo || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            <Icon name="Check" size={11} strokeWidth={2} />
                            지급완료
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">
                          {fmtDate(s.paidAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
