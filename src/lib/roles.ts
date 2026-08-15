// 역할 정규화 — DB 에는 레거시 enum 값(SELLER/BUYER/NODE/MIDDLE_ADMIN/BRAND_ADMIN)이
// 남아 있지만 앱 코드는 3역할(SUPER_ADMIN/CONSULTANT/CUSTOMER)만 분기한다.
// DB 를 건드리지 않고 세션 레이어(authorize/jwt/session)에서 레거시 값을 현행 값으로 매핑한다.

export type AppRole = "SUPER_ADMIN" | "CONSULTANT" | "CUSTOMER";

const LEGACY_ROLE_MAP: Record<string, AppRole> = {
  SELLER: "CONSULTANT",
  BUYER: "CUSTOMER",
  // 셀러브릭스 시절 역할 — 대응되는 현행 역할이 없어 최소 권한으로 강등
  NODE: "CUSTOMER",
  MIDDLE_ADMIN: "CUSTOMER",
  BRAND_ADMIN: "CUSTOMER",
};

export function normalizeRole(role: unknown): AppRole {
  if (role === "SUPER_ADMIN" || role === "CONSULTANT" || role === "CUSTOMER") {
    return role;
  }
  return LEGACY_ROLE_MAP[String(role)] ?? "CUSTOMER";
}
