// 상담 방식(1차) × 상담 시간(2차) 옵션 — 상품 등록/예약/캘린더에서 공유.
// 변형(ProductVariant)의 name 에 "방식 · 시간"(예: "영상 상담 · 1시간 30분")으로 인코딩하고,
// 여기서 파싱한다. (전용 컬럼 없이 기존 구조 재사용 — 스키마 변경 없음)

export const CONSULT_METHODS = ["영상 상담", "전화 상담", "방문 상담"] as const;

export const CONSULT_DURATIONS: { label: string; minutes: number }[] = [
  { label: "30분", minutes: 30 },
  { label: "1시간", minutes: 60 },
  { label: "1시간 30분", minutes: 90 },
  { label: "2시간", minutes: 120 },
  { label: "2시간 30분", minutes: 150 },
  { label: "3시간", minutes: 180 },
];

export const VARIANT_SEP = " · ";

// "1시간 30분" → 90, "2시간" → 120, "30분" → 30
export function durationLabelToMinutes(label: string): number {
  if (!label) return 0;
  const h = label.match(/(\d+)\s*시간/);
  const m = label.match(/(\d+)\s*분/);
  return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
}

// "영상 상담 · 1시간 30분" → { method, durationLabel, minutes }
export function parseVariantName(name: string): { method: string; durationLabel: string; minutes: number } {
  const idx = name.indexOf(VARIANT_SEP);
  const method = idx >= 0 ? name.slice(0, idx).trim() : name.trim();
  const durationLabel = idx >= 0 ? name.slice(idx + VARIANT_SEP.length).trim() : "";
  return { method, durationLabel, minutes: durationLabelToMinutes(durationLabel) };
}

// "HH:MM" → 분
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

// 시작 시각부터 소요시간(분)만큼을 덮는 연속 슬롯들을 반환. 빈틈이 있어 못 덮으면 null.
// daySlots 는 "예약 가능한" 슬롯 목록이어야 한다. (예약/캘린더 공용)
export function slotsForWindow<T extends { startTime: string; endTime: string }>(
  daySlots: T[],
  startTime: string,
  durationMinutes: number,
): T[] | null {
  const startMin = timeToMinutes(startTime);
  const endMin = startMin + durationMinutes;
  const sorted = [...daySlots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const chosen: T[] = [];
  let cursor = startMin;
  for (const s of sorted) {
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    if (sEnd <= cursor) continue; // 창 시작 이전 슬롯
    if (sStart > cursor) break; // 빈틈 발생 → 덮을 수 없음
    chosen.push(s);
    cursor = sEnd;
    if (cursor >= endMin) break;
  }
  return cursor >= endMin ? chosen : null;
}

// 특정 소요시간으로 예약 가능한 "시작 슬롯"만 필터링. (예약 UI 에서 사용)
export function bookableStartSlots<T extends { startTime: string; endTime: string }>(
  daySlots: T[],
  durationMinutes: number,
): T[] {
  return daySlots.filter((s) => slotsForWindow(daySlots, s.startTime, durationMinutes) !== null);
}
