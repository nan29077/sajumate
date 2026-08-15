import "server-only";

import { headers } from "next/headers";

export const SOCIAL_SHARE_IMAGE_PATH = "/og-image.png?v=20260815-2";

const DEFAULT_PUBLIC_ORIGIN = "https://sajumate.co.kr";

function cleanOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim().replace(/^['"]|['"]$/g, ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function cleanForwardedHost(value: string | null): string | null {
  const host = value?.split(",")[0]?.trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  return host;
}

/**
 * 카카오·SNS 크롤러가 요청한 실제 공개 origin을 반환한다.
 * 프록시(Cloudflare/Nginx) 환경에서는 x-forwarded-*를 우선하고,
 * 헤더를 읽을 수 없는 렌더링 상황에서만 환경변수로 폴백한다.
 */
export function resolveRequestOrigin(): string {
  try {
    const requestHeaders = headers();
    const host = cleanForwardedHost(
      requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"),
    );

    if (host) {
      const forwardedProto = requestHeaders
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
        .toLowerCase();
      const protocol =
        forwardedProto === "http" || forwardedProto === "https"
          ? forwardedProto
          : host.startsWith("localhost") || host.startsWith("127.0.0.1")
            ? "http"
            : "https";
      return `${protocol}://${host}`;
    }
  } catch {
    // 정적 렌더링처럼 요청 헤더를 읽을 수 없을 때만 환경변수를 사용한다.
  }

  return (
    cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanOrigin(process.env.AUTH_URL) ||
    DEFAULT_PUBLIC_ORIGIN
  );
}

export function absolutePublicUrl(pathOrUrl: string, origin = resolveRequestOrigin()): string {
  const absolute = cleanOrigin(pathOrUrl);
  if (absolute && /^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl).toString();
  }
  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, `${origin}/`).toString();
}
