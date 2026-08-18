import type { NextRequest } from "next/server";

// 간단한 인메모리 레이트리밋 (프로세스 단위 — 서버 재시작 시 초기화).
// find-id / forgot-password 등 무차별 대입이 우려되는 공개 엔드포인트에서 사용한다.
const buckets = new Map<string, { count: number; resetAt: number }>();

// 만료된 버킷 정리 (Map 무한 증가 방지)
function pruneExpired(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * key 별로 windowMs(기본 1분) 동안 limit(기본 5회)까지 허용한다.
 * 허용되면 true, 한도 초과면 false 를 반환한다.
 */
export function checkRateLimit(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  pruneExpired(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** 프록시 뒤에서도 동작하는 클라이언트 IP 추출 (x-forwarded-for 첫 항목 우선) */
export function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
