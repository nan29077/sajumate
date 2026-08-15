import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("ko-KR").format(num) + "원";
}

/** 상담사 수수료율에 부가세 10%를 포함한 표시·계산용 값 (예: 7 → 7.7). DB 원본값은 유지하고 표시/계산 시점에만 사용 */
export function withVatRate(rate: number | string | null | undefined): number {
  const num = typeof rate === "string" ? parseFloat(rate) : rate ?? 0;
  if (!Number.isFinite(num)) return 0;
  return Math.round((num as number) * 1.1 * 100) / 100;
}

export function formatDiscount(original: number, sale: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - sale) / original) * 100);
}

export function generateOrderNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SB${dateStr}${random}`;
}

export function getTimeRemaining(endDate: Date): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} {
  const total = new Date(endDate).getTime() - Date.now();
  if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / 1000 / 60) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

export function getProgressPercent(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((current / goal) * 100));
}

export function placeholderImage(width: number, height: number, text?: string): string {
  const t = text ? encodeURIComponent(text) : `${width}x${height}`;
  return `https://placehold.co/${width}x${height}/f5f5f5/999?text=${t}`;
}

export function sellerShopUrl(slug: string): string {
  return `/shop/${slug}`;
}

export function productUrl(id: string): string {
  return `/products/${id}`;
}

/** MySQL TEXT 컬럼에 저장된 JSON 배열을 파싱 */
export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

/** 예약 SNS 계정(JSON TEXT) 파싱 — { platform, handle }[] 형태만 통과. 없으면 null */
export function parseSnsAccounts(value: unknown): { platform: string; handle: string }[] | null {
  let arr: unknown = value;
  if (typeof value === 'string' && value.length > 0) {
    try { arr = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const cleaned = arr
    .filter(
      (s: any) => s && typeof s.platform === 'string' && typeof s.handle === 'string' && s.handle,
    )
    .map((s: any) => ({ platform: String(s.platform), handle: String(s.handle) }));
  return cleaned.length > 0 ? cleaned : null;
}
