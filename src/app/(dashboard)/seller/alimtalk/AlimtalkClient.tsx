"use client";

import { Icon } from '@/components/shared/Icon';
import { useEffect, useState } from "react";
import { Bell, CreditCard, Send, Radio, Clock, Star, Calendar, FileText } from 'lucide-react';

interface AlimtalkCharge {
  id: string;
  amount: number;
  vat: number;
  totalAmount: number;
  credits: number;
  payMethod: string;
  payStatus: string;
  createdAt: string;
}

interface SendLog {
  id: string;
  kind: string; // ALIMTALK | SMS
  purpose: string;
  templateCode: string | null;
  recipientCount: number;
  acceptedCount: number;
  failCount: number;
  errorMessage: string | null;
  createdAt: string;
}

interface AlimtalkData {
  balance: number;
  charges: AlimtalkCharge[];
  logs: SendLog[];
  totalRecipients: number;
  totalAccepted: number;
  lastSentAt: string | null;
}

const PURPOSE_LABELS: Record<string, string> = {
  LIVE_START: "라이브 방송시작 알림",
  PASSWORD_RESET: "임시 비밀번호 문자",
};

const CHARGE_OPTIONS = [
  { label: "5만원", amount: 50000, credits: 3333 },
  { label: "10만원", amount: 100000, credits: 6666 },
  { label: "30만원", amount: 300000, credits: 20000 },
  { label: "50만원", amount: 500000, credits: 33333 },
];

const TEMPLATES = [
  { id: "live-start", category: "방송시작", Icon: Radio, badgeColor: "bg-red-100 text-red-700", content: "{상담사명}님의 라이브 방송이 시작되었습니다! 지금 바로 참여하세요" },
  { id: "delivery", category: "상담 시작", Icon: Clock, badgeColor: "bg-blue-100 text-blue-700", content: "{상담사명}님과의 상담이 곧 시작됩니다. 예약 시간을 확인해 주세요." },
  { id: "order-confirm", category: "예약확인", Icon: Calendar, badgeColor: "bg-purple-100 text-purple-700", content: "{상담상품명} 예약이 완료되었습니다. 예약번호: {예약번호}" },
  { id: "review-request", category: "후기요청", Icon: Star, badgeColor: "bg-yellow-100 text-yellow-700", content: "{상담상품명} 구매 후기를 남겨주시면 포인트를 드립니다!" },
];

export default function AlimtalkClient() {
  const [data, setData] = useState<AlimtalkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "charge" | "history" | "templates">("overview");

  const [selectedAmount, setSelectedAmount] = useState(50000);
  const [payMethod, setPayMethod] = useState("card");
  const [charging, setCharging] = useState(false);
  const [chargeMsg, setChargeMsg] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seller/alimtalk");
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCharge = async () => {
    setCharging(true);
    setChargeMsg("");
    try {
      const res = await fetch("/api/seller/alimtalk/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedAmount, payMethod }),
      });
      const json = await res.json();
      if (res.ok) {
        setChargeMsg(`충전 완료: ${json.credits.toLocaleString()}건 추가 (잔여 ${json.balance.toLocaleString()}건)`);
        fetchData();
      } else {
        setChargeMsg(json.error || "충전에 실패했습니다.");
      }
    } finally {
      setCharging(false);
    }
  };

  const vat = Math.round(selectedAmount * 0.1);
  const totalAmount = selectedAmount + vat;
  const estimatedCredits = Math.floor(selectedAmount / 15);

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">알림톡 관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">카카오 알림톡 발송 내역을 확인하고 크레딧을 충전하세요</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Icon name="Reorder" className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-5">
              <p className="text-sm text-gray-500">잔여 건수</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {(data?.balance ?? 0).toLocaleString()}
                <span className="text-base font-normal text-gray-400 ml-1">건</span>
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5">
              <p className="text-sm text-gray-500">누적 발송</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {(data?.totalRecipients ?? 0).toLocaleString()}
                <span className="text-base font-normal text-gray-400 ml-1">건</span>
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5">
              <p className="text-sm text-gray-500">최근 발송</p>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {data?.lastSentAt
                  ? new Date(data.lastSentAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
                  : "-"}
              </p>
            </div>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
            {[
              { key: "overview", label: "발송 내역", icon: Bell },
              { key: "charge", label: "크레딧 충전", icon: CreditCard },
              { key: "history", label: "충전 내역", icon: Send },
              { key: "templates", label: "템플릿", icon: FileText },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key as typeof tab)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  tab === key
                    ? "border-yellow-500 text-yellow-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* 발송 내역 탭 */}
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 mb-2">알림톡이란?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  카카오 비즈니스 채널을 통해 고객에게 라이브 방송 시작, 예약 확인 등의 알림을 발송하는 서비스입니다.
                  발신 계정과 템플릿은 관리자가 통합 관리하며, 여기에서는 내 점집 명의로 발송된 내역을 확인할 수 있습니다.
                </p>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 mb-3">최근 발송 내역</h2>
                {data?.logs && data.logs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-500">
                          <th className="px-3 py-2.5 font-medium">발송 사유</th>
                          <th className="px-3 py-2.5 font-medium">유형</th>
                          <th className="px-3 py-2.5 font-medium">대상</th>
                          <th className="px-3 py-2.5 font-medium">접수 성공</th>
                          <th className="px-3 py-2.5 font-medium">상태</th>
                          <th className="px-3 py-2.5 font-medium">일시</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.logs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-3 text-gray-800">{PURPOSE_LABELS[log.purpose] ?? log.purpose}</td>
                            <td className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.kind === "ALIMTALK" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                              }`}>
                                {log.kind === "ALIMTALK" ? "알림톡" : "문자"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-700">{log.recipientCount.toLocaleString()}명</td>
                            <td className="px-3 py-3 text-gray-700">{log.acceptedCount.toLocaleString()}건</td>
                            <td className="px-3 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  log.acceptedCount > 0
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                                title={log.errorMessage ?? undefined}
                              >
                                {log.acceptedCount > 0 ? "접수됨" : "실패"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-400 text-xs">
                              {new Date(log.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">발송 내역이 없습니다.</p>
                )}
              </div>
            </div>
          )}

          {/* 충전 탭 */}
          {tab === "charge" && (
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">충전 금액 선택</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CHARGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.amount}
                      onClick={() => setSelectedAmount(opt.amount)}
                      className={`border rounded-lg p-3 text-center transition-colors ${
                        selectedAmount === opt.amount
                          ? "border-yellow-500 bg-yellow-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <p className="font-semibold text-gray-900">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        약 {opt.credits.toLocaleString()}건
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">충전 금액</span>
                  <span className="font-medium">{selectedAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">부가세 (10%)</span>
                  <span className="font-medium">{vat.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-semibold text-gray-900">결제 금액</span>
                  <span className="font-bold text-yellow-700">{totalAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">충전 건수</span>
                  <span className="font-semibold text-green-700">
                    {estimatedCredits.toLocaleString()}건
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">결제 수단</p>
                <div className="flex gap-3">
                  {[
                    { value: "card", label: "신용카드" },
                    { value: "easy_pay", label: "간편결제" },
                    { value: "bank_transfer", label: "계좌이체" },
                  ].map((m) => (
                    <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="payMethod"
                        value={m.value}
                        checked={payMethod === m.value}
                        onChange={() => setPayMethod(m.value)}
                        className="accent-yellow-500"
                      />
                      <span className="text-sm">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {chargeMsg && (
                <p
                  className={`text-sm ${
                    chargeMsg.includes("완료") ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {chargeMsg}
                </p>
              )}

              <button
                onClick={handleCharge}
                disabled={charging}
                className="flex items-center gap-2 px-6 py-3 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50 transition-colors"
              >
                <Icon name="CreditCard" className="w-4 h-4" />
                {charging ? "처리 중..." : `${totalAmount.toLocaleString()}원 결제`}
              </button>
            </div>
          )}

          {/* 템플릿 탭 */}
          {tab === "templates" && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 mb-1">상황별 알림톡 템플릿</h2>
                <p className="text-sm text-gray-500 mb-4">각 상황에 맞는 알림톡 내용을 복사해 활용하세요.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {TEMPLATES.map(({ id, category, Icon, badgeColor, content }) => (
                    <div key={id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeColor}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {category}
                        </span>
                        <button
                          onClick={() => handleCopy(content, id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          {copiedId === id ? (
                            <span className="text-green-600">복사됨</span>
                          ) : (
                            <>복사</>
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 충전 내역 탭 */}
          {tab === "history" && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 mb-3">충전 내역</h2>
                {data?.charges && data.charges.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-500">
                          <th className="px-3 py-2.5 font-medium">충전금액</th>
                          <th className="px-3 py-2.5 font-medium">건수</th>
                          <th className="px-3 py-2.5 font-medium">결제방법</th>
                          <th className="px-3 py-2.5 font-medium">상태</th>
                          <th className="px-3 py-2.5 font-medium">일시</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.charges.map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-3 font-medium text-gray-900">{c.totalAmount.toLocaleString()}원</td>
                            <td className="px-3 py-3 text-gray-700">{c.credits.toLocaleString()}건</td>
                            <td className="px-3 py-3 text-gray-600 capitalize">{c.payMethod}</td>
                            <td className="px-3 py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  c.payStatus === "PAID"
                                    ? "bg-green-100 text-green-700"
                                    : c.payStatus === "FAILED"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {c.payStatus === "PAID" ? "완료" : c.payStatus === "FAILED" ? "실패" : "대기"}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-400 text-xs">
                              {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">충전 내역이 없습니다.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
