// 라이브 상태 표시 공통 컴포넌트 — 점집/단골픽/내픽/라이브검색에서 동일하게 재사용.
// - LIVE_RING_CLASS: 프로필 사진(아바타) 링에 적용하는 "두근두근" 펄스 (globals.css 의 animate-heartbeat).
// - <LiveBadge />: Radio 라인 아이콘 + "상담 중" 배지.
//
// 사주메이트 톤: 커머스식 빨강 "LIVE" 대신 딥 퍼플 + 상담 문구를 쓴다.

import { Radio } from "lucide-react";

/** 배지·링에 함께 쓰는 딥 퍼플 (브랜드 톤) */
export const LIVE_ACCENT = "#6d28d9";

export const LIVE_RING_CLASS = "ring-2 ring-violet-500 animate-heartbeat";

// 프로필(이름) 옆에 붙는 라이브 배지 — Radio 아이콘 + "라이브 중" (딥 퍼플).
// ※ 아바타 하단의 <LiveBadge/>보다 약간 크게 표시한다.
export function OnAirBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white rounded-full shadow ${className}`}
      style={{ backgroundColor: LIVE_ACCENT }}
    >
      <Radio size={10} strokeWidth={2.5} className="animate-pulse" />
      라이브 중
    </span>
  );
}

export default function LiveBadge({
  className = "",
  size = "xs",
  label = "라이브 중",
}: {
  className?: string;
  size?: "xs" | "sm";
  /** 문구 교체용 — 기본 "상담 중" (예: "라이브 상담 중") */
  label?: string;
}) {
  const sized =
    size === "sm"
      ? "text-[9px] px-2 py-0.5 gap-1"
      : "text-[7px] px-1.5 py-px gap-0.5";
  const icon = size === "sm" ? 9 : 7;
  return (
    <span
      className={`inline-flex items-center ${sized} text-white font-bold rounded-full shadow-sm ${className}`}
      style={{ backgroundColor: LIVE_ACCENT }}
    >
      <Radio size={icon} strokeWidth={2.5} className="animate-pulse" />
      {label}
    </span>
  );
}
