"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import { Scale, Sparkles } from 'lucide-react';

function stripEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|\u26A0\uFE0F|\uD83D\uDCC9|\uD83D\uDCC8|\u2705|\uD83D\uDE4F|\u2696\uFE0F/gu, "").trim();
}

/** \uC0C1\uB2F4\uC0AC \uC785\uB825 HTML(detailContent)\uC5D0\uC11C script, on* \uC774\uBCA4\uD2B8, javascript: \uB97C \uC81C\uAC70\uD55C\uB2E4. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

function RefundPolicyBlock({ text }: { text: string }) {
  const normalizedText = stripEmoji(text).replace(/\s+/g, " ").trim();
  const lines = normalizedText.split(/\s*(?=\d+\.\s|\u203B)/);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden text-[12px]">
      <div className="flex items-center gap-2 bg-gray-50 px-3.5 py-2.5 border-b border-gray-100">
        <Icon name="Warning" size={13} className="text-amber-500 flex-shrink-0" />
        <span className="font-bold text-gray-800 text-[13px]">교환 및 환불 규정</span>
      </div>
      <div className="divide-y divide-gray-50">
        {lines.map((line, i) => {
          const cleaned = stripEmoji(line);
          const isNumbered = /^\d+\./.test(cleaned);
          const isFootnote = cleaned.startsWith("\u203B");

          if (isNumbered) {
            const titleMatch = cleaned.match(/^(\d+\.\s[^\s].*?)(?:\s{2,}|\n)([\s\S]*)$/);
            let title = cleaned;
            let body = "";
            if (titleMatch) {
              title = titleMatch[1];
              body = titleMatch[2].trim();
            } else {
              const idx = cleaned.indexOf(" ", 3);
              if (idx > 0) {
                const parenEnd = cleaned.indexOf(")", 3);
                if (parenEnd > 0) {
                  title = cleaned.substring(0, parenEnd + 1);
                  body = cleaned.substring(parenEnd + 1).trim();
                }
              }
            }
            return (
              <div key={i} className="px-3.5 py-3">
                <p className="font-semibold text-gray-800 mb-1">{stripEmoji(title)}</p>
                {body && <p className="text-gray-500 leading-relaxed">{stripEmoji(body)}</p>}
              </div>
            );
          }

          if (isFootnote) {
            return (
              <div key={i} className="px-3.5 py-3 bg-gray-50/60 flex items-start gap-2">
                <Scale size={11} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-gray-500 leading-relaxed">{stripEmoji(cleaned.replace(/^\u203B\s*법적\s*안내\s*/, "\u203B 법적 안내  "))}</p>
              </div>
            );
          }

          return cleaned ? (
            <div key={i} className="px-3.5 py-2.5">
              <p className="text-gray-500 leading-relaxed">{stripEmoji(cleaned)}</p>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

function renderDescription(text: string) {
  if (text.includes("교환 및 환불 규정") || text.includes("교환\u00B7환불")) {
    const policyIdx = text.search(/\u26A0\uFE0F?\s*\[?교환 및 환불 규정/);
    const beforePolicy = policyIdx > 0 ? text.substring(0, policyIdx).trim() : "";
    const policyText = policyIdx >= 0 ? text.substring(policyIdx) : text;
    const cleanPolicy = policyText.replace(/^\u26A0\uFE0F?\s*\[?교환 및 환불 규정\]?\s*/u, "").trim();
    return (
      <div className="space-y-3">
        {beforePolicy && (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{beforePolicy}</p>
        )}
        <RefundPolicyBlock text={cleanPolicy} />
      </div>
    );
  }
  return <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{text}</div>;
}

// 벌집(honeycomb) 배경 패턴 — 은은한 호박색 육각형 타일
const HONEYCOMB_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23d97706' stroke-opacity='0.12' stroke-width='1.2'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23d97706' stroke-opacity='0.12' stroke-width='1.2'/%3E%3C/svg%3E\")";

// 표준 교환·환불 카드 노출 여부 — 임시 비노출 상태. 다시 보여주려면 true 로 변경.
const SHOW_STANDARD_REFUND_CARD = false;

// 하드코딩 표준 취소·환불 규정
function StandardRefundCard() {
  const sections = [
    { icon: "Calendar", title: "예약 확정", items: ["결제 완료 즉시 예약 접수", "상담사 확정 후 마이페이지 > 예약내역에서 확인 가능"] },
    {
      icon: "Exchange",
      title: "취소 및 환불",
      items: [
        "상담 시작 전 취소 시 전액 환불",
        "상담 시작 24시간 이내 취소 시 환불 제한될 수 있음",
        "상담사 귀책 사유 취소: 전액 환불",
        "환불은 접수 후 3~5 영업일 이내 처리",
      ],
    },
    {
      icon: "Warning",
      title: "환불이 불가한 경우",
      items: ["상담이 이미 진행된 경우", "상담 임박(24시간 이내) 단순 변심 취소", "부적절한 이용으로 상담이 강제 종료된 경우"],
    },
  ];
  // 육각형 클립 (벌집 불릿)
  const hexClip = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

  return (
    <div className="rounded-2xl overflow-hidden border border-amber-200 bg-gradient-to-b from-amber-50 to-white shadow-sm">
      {/* 헤더 — 벌집 패턴 배경 + */}
      <div className="relative px-4 py-3.5 bg-amber-100/70 border-b border-amber-200" style={{ backgroundImage: HONEYCOMB_BG }}>
        <div className="flex items-center gap-2">
          <Sparkles size={30} strokeWidth={1.4} className="w-9 h-9 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-[13.5px] font-extrabold text-amber-900 leading-tight">사주메이트 표준 교환·환불 안내</p>
            <p className="text-[10.5px] text-amber-700/80 mt-0.5">모든 상담상품에 공통 적용되는 규정이에요</p>
          </div>
        </div>
      </div>

      {/* 섹션들 */}
      <div className="p-3.5 space-y-3">
        {sections.map((sec) => (
          <div key={sec.title} className="rounded-xl border border-amber-100 bg-white/80 px-3.5 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Icon name={sec.icon} size={16} className="text-amber-600" />
              <h4 className="text-[13px] font-bold text-amber-900">{sec.title}</h4>
            </div>
            <ul className="space-y-1.5">
              {sec.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-[12px] text-gray-600 leading-relaxed">
                  <span
                    className="mt-[5px] w-[7px] h-[7px] bg-amber-400 flex-shrink-0"
                    style={{ clipPath: hexClip }}
                  />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ReviewItem {
  rating: number;
  userName: string;
  createdAt: string | Date;
  content: string;
}

interface ProductDetailTabsProps {
  description?: string | null;
  detailContent?: string | null;
  reviewCount: number;
  /** reviewsHtml은 더 이상 사용하지 않음 — reviews 배열로 전달하세요 */
  reviewsHtml?: string;
  reviews?: ReviewItem[];
  embedded?: boolean;
}

export default function ProductDetailTabs({
  description,
  detailContent,
  reviewCount,
  reviews = [],
  embedded = false,
}: ProductDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"detail" | "review" | "info">("detail");
  const [refundPolicy, setRefundPolicy] = useState<string | null>(null);
  const [reservationPolicy, setReservationPolicy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d) => {
        if (d.refundPolicy) setRefundPolicy(d.refundPolicy);
        if (d.shippingPolicy) setReservationPolicy(d.shippingPolicy);
      })
      .catch(() => {});
  }, []);

  // PC 사이드바에서 탭 전환 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as "review" | "info";
      setActiveTab(tab);
      setTimeout(() => {
        document.getElementById("product-tabs")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    };
    window.addEventListener("switch-product-tab", handler);
    return () => window.removeEventListener("switch-product-tab", handler);
  }, []);

  const tabs = [
    { key: "detail" as const, label: "상세정보" },
    { key: "review" as const, label: `후기 (${reviewCount})` },
    { key: "info" as const, label: "예약·취소·환불" },
  ];

  return (
    <div id="product-tabs">
      <div className={`sticky z-30 bg-white border-b border-gray-200 ${embedded ? "top-0" : "top-14"}`}>
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors relative ${
                activeTab === tab.key ? "text-black" : "text-gray-400"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[300px]">
        {activeTab === "detail" && (
          <div className="animate-fade-in">
            <div className="px-4 pt-5 pb-2">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Icon name="File" size={14} strokeWidth={1.5} className="text-amber-500" />
                  상담상품 상세정보
                </h3>
                {description
                  ? renderDescription(description)
                  : <p className="text-sm text-gray-400">상세정보가 없습니다.</p>
                }
              </div>
            </div>
            {detailContent && (
              <div className="px-4 pb-2">
                <div
                  className="product-detail-content prose prose-sm max-w-none text-gray-700"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(detailContent) }}
                />
              </div>
            )}
            {/* 표준 교환·환불 규정 (하드코딩) — SHOW_STANDARD_REFUND_CARD 로 임시 비노출 */}
            {SHOW_STANDARD_REFUND_CARD && (
              <div className="px-4 pt-3 pb-6">
                <StandardRefundCard />
              </div>
            )}
          </div>
        )}

        {activeTab === "review" && (
          <div className="animate-fade-in px-4 py-5">
            {reviews.length > 0 ? (
              <div>
                {reviews.map((r, idx) => (
                  <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <svg
                            key={i}
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill={i < r.rating ? "black" : "none"}
                            stroke={i < r.rating ? "black" : "#e5e7eb"}
                            strokeWidth="2"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        ))}
                      </div>
                      <span className="text-[11px] text-gray-500 font-medium">{r.userName}</span>
                      <span className="text-[10px] text-gray-300">
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    {/* XSS 방지: 리뷰 내용은 반드시 텍스트 노드로만 렌더링 */}
                    <p className="text-sm text-gray-700 leading-relaxed">{r.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-400">아직 후기가 없습니다.</p>
                <p className="text-xs text-gray-300 mt-1">첫 번째 후기를 작성해 주세요!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "info" && (
          <div className="animate-fade-in px-4 py-5">
            <div className="space-y-5">
              <div>
                <h3 className="text-[13px] font-bold text-gray-900 mb-2">예약 안내</h3>
                {reservationPolicy ? (
                  <div className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-line">{ reservationPolicy}</div>
                ) : (
                  <div className="space-y-1.5 text-[12px] text-gray-600 leading-relaxed">
                    <p>결제 완료 즉시 예약이 접수됩니다.</p>
                    <p>상담사 확정 후 마이페이지 &gt; 예약내역에서 일정을 확인하세요.</p>
                  </div>
                )}
              </div>
              <div className="h-px bg-gray-100" />
              <div>
                <h3 className="text-[13px] font-bold text-gray-900 mb-2">교환\u00B7환불 안내</h3>
                {refundPolicy ? (
                  <RefundPolicyBlock text={refundPolicy} />
                ) : (
                  <div className="space-y-1.5 text-[12px] text-gray-600 leading-relaxed">
                    <p>상담 시작 전 취소 시 전액 환불됩니다.</p>
                    <p>상담 시작 24시간 이내 취소 시 환불이 제한될 수 있습니다.</p>
                    <p>상담사 귀책 사유로 상담이 취소된 경우 전액 환불됩니다.</p>
                    <p>환불은 취소 접수 후 3~5 영업일 이내 처리됩니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
