// 앱 전반 기본 이미지(placeholder) 통일.
// - 상담상품 썸네일 없음 → 사주메이트 브랜드 placeholder(자체 SVG)
// - 점집 상단 배경 기본값 → 깔끔한 실사 이미지(unsplash)
// - 역할별 프로필 기본 이미지 → 역할별 캐릭터 아바타(public/avatars/*.png)

// 사주메이트 전용 "노이미지" placeholder (public/no-image.png — 노랑+검정 브랜드 톤)
// 상담상품 썸네일이 없거나(null/빈 문자열) 로드 실패할 때 모든 화면에서 이 이미지를 표시.
export const NO_IMAGE = "/no-image.png";

// 기존 상담상품 placeholder 상수는 NO_IMAGE 로 통일 (레거시 참조 호환용)
export const DEFAULT_PRODUCT_IMAGE = NO_IMAGE;

// 점집 상단 기본 배너 (깔끔한 실사)
export const DEFAULT_SHOP_BANNER = "/images/banners/shop-generated-banner-01.jpg";

// ─── 역할별 캐릭터 아바타 (public/avatars/*.png) ────────────────────────────

// 최고관리자 (5종)
export const ADMIN_AVATARS = Array.from({ length: 5 }, (_, i) => `/avatars/관리자_${i + 1}.png`);

// 중간관리자·노드 (5종)
export const MIDDLE_ADMIN_AVATARS = Array.from({ length: 5 }, (_, i) => `/avatars/중간관리자_${i + 1}.png`);

// 브랜드사 (6종)
export const BRAND_AVATARS = Array.from({ length: 6 }, (_, i) => `/avatars/브랜드사_${i + 1}.png`);

// 고객 — 여성(13종), 남성(13종)
export const BUYER_FEMALE_AVATARS = Array.from({ length: 13 }, (_, i) => `/avatars/여성구매회원_${i + 1}.png`);
export const BUYER_MALE_AVATARS = Array.from({ length: 13 }, (_, i) => `/avatars/남성구매회원_${i + 1}.png`);
export const ALL_BUYER_AVATARS = [...BUYER_FEMALE_AVATARS, ...BUYER_MALE_AVATARS];

// 사주메이트 랜덤 동물 캐릭터(30종) — 십이지신 계열 동물 + 한복 + 밤하늘/달·별 일러스트.
// 일반 가입 고객·최고관리자·상담사가 모두 이 풀을 공유한다.
// 상담사 개인 샵(?ref=<slug>)으로 가입한 고객은 기존 구매회원 캐릭터 풀을 그대로 사용한다.
export const SAJU_CUSTOMER_AVATARS = Array.from(
  { length: 30 },
  (_, i) => `/avatars/saju/saju-avatar-${String(i + 1).padStart(2, "0")}.png`,
);

// 상담사 캐릭터 풀 — 사주 동물 캐릭터를 그대로 사용한다.
// (사주메이트 시절 꿀벌 캐릭터 /avatars/라이브셀러_*.png 는 폐기)
export const SELLER_AVATARS = SAJU_CUSTOMER_AVATARS;

// 전체 아바타 목록 (NodeSettingsClient 등에서 선택 UI용)
// FEMALE_AVATARS / MALE_AVATARS 는 고객 이미지로 매핑 (레거시 호환용)
export const FEMALE_AVATARS = BUYER_FEMALE_AVATARS;
export const MALE_AVATARS = BUYER_MALE_AVATARS;
export const ALL_AVATARS = [
  ...ADMIN_AVATARS,
  ...MIDDLE_ADMIN_AVATARS,
  ...SELLER_AVATARS,
  ...BRAND_AVATARS,
  ...BUYER_FEMALE_AVATARS,
  ...BUYER_MALE_AVATARS,
];

// ─── 해시 유틸 ────────────────────────────────────────────────────────────────
function computeHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

// ─── 역할 기반 아바타 선택 ────────────────────────────────────────────────────
// role: SUPER_ADMIN | CONSULTANT | CUSTOMER
// gender: "male" | "female" | null (고객 풀 선택에만 사용)
export function pickRoleAvatar(seed: string, role: string, gender?: string | null): string {
  const idx = computeHash(seed);
  switch (role) {
    case "SUPER_ADMIN":
      return pickSajuAvatar(`admin:${seed}`);
    case "CONSULTANT":
      return SELLER_AVATARS[idx % SELLER_AVATARS.length];
    case "CUSTOMER":
    default:
      return pickBuyerAvatar(seed, gender);
  }
}

// seed(아이디/이름)로 안정적으로 하나의 고객 캐릭터를 고른다.
// gender 가 있으면 해당 성별 풀에서 선택.
export function pickBuyerAvatar(seed: string, gender?: string | null): string {
  const pool =
    gender === "male"
      ? BUYER_MALE_AVATARS
      : gender === "female"
        ? BUYER_FEMALE_AVATARS
        : ALL_BUYER_AVATARS;
  return pool[computeHash(seed) % pool.length];
}

// seed(아이디)로 상담사 캐릭터를 고른다.
export function pickSellerAvatar(seed: string): string {
  return SELLER_AVATARS[computeHash(seed) % SELLER_AVATARS.length];
}

// seed(brandId 등)로 안정적으로 하나의 브랜드 캐릭터를 고른다.
export function pickBrandAvatar(seed: string): string {
  return BRAND_AVATARS[computeHash(seed) % BRAND_AVATARS.length];
}

// 기본 아바타 — 레거시 호환용. gender 기반 고객 풀에서 선택.
// 새 코드에서는 pickRoleAvatar 를 사용할 것.
export function pickDefaultAvatar(seed: string, gender?: string | null): string {
  return pickBuyerAvatar(seed, gender);
}

// 신규 가입 등에서 성별 기반으로 랜덤 캐릭터를 고른다(성별 미상이면 전체 랜덤).
export function randomAvatar(gender?: string | null): string {
  const pool = gender === "male" ? BUYER_MALE_AVATARS : gender === "female" ? BUYER_FEMALE_AVATARS : ALL_BUYER_AVATARS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickSajuAvatar(seed: string): string {
  return SAJU_CUSTOMER_AVATARS[computeHash(seed) % SAJU_CUSTOMER_AVATARS.length];
}

export function randomSajuAvatar(): string {
  return SAJU_CUSTOMER_AVATARS[Math.floor(Math.random() * SAJU_CUSTOMER_AVATARS.length)];
}

// 사주메이트 시절 번들 캐릭터(/avatars/*.png — 꿀벌 상담사·구매회원 등) 여부.
// /avatars/saju/* 는 사주메이트 전용 캐릭터이므로 레거시가 아니다.
export function isLegacyBundledAvatar(path?: string | null): boolean {
  return Boolean(path?.startsWith("/avatars/") && !path.startsWith("/avatars/saju/"));
}

// 관리자 화면에서는 기존 번들 기본 캐릭터를 새 사주 캐릭터로 교체한다.
// 직접 업로드한 이미지(/uploads 등)는 그대로 보존한다.
export function resolveAdminDashboardAvatar(seed: string, currentAvatar?: string | null): string {
  if (currentAvatar && !isLegacyBundledAvatar(currentAvatar)) return currentAvatar;
  return pickSajuAvatar(`admin:${seed}`);
}

// 상담사 프로필 이미지 확정.
// 직접 업로드한 이미지(점집 로고 · /uploads 등)는 보존하고, DB 에 남아 있는 레거시 꿀벌
// 캐릭터 경로이거나 이미지가 아예 없으면 seed 기반 사주 동물 캐릭터로 교체한다.
export function resolveConsultantAvatar(seed: string, currentAvatar?: string | null): string {
  if (currentAvatar && !isLegacyBundledAvatar(currentAvatar)) return currentAvatar;
  return pickSajuAvatar(seed);
}

// ─── 점집 기본 배너 (생성형 이미지 5종) ─────────────────────────────────────
// 배너를 올리지 않은 상담사에게 점집·사주 분위기의 생성형 기본 배너를 배정한다.
// 상담사 id 해시 기반이라 같은 상담사는 항상 같은 배너를 본다.
export const SHOP_BANNERS = Array.from(
  { length: 5 },
  (_, i) => `/images/banners/shop-generated-banner-${String(i + 1).padStart(2, "0")}.jpg`,
);

export function pickShopBanner(seed: string): string {
  return SHOP_BANNERS[computeHash(seed) % SHOP_BANNERS.length];
}

/** 점집 배너 확정 — 업로드한 배너가 있으면 그대로, 없으면 seed 기반 기본 배너. */
export function resolveShopBanner(shopBanner: string | null | undefined, seed: string): string {
  return shopBanner && shopBanner.trim() ? shopBanner : pickShopBanner(seed);
}

// ─── 상담사 표시 이미지 단일 진입점 ─────────────────────────────────────────
// 앱 전체에서 상담사 프로필 이미지는 반드시 이 함수로 구한다.
// (예전에는 화면마다 pickSellerAvatar(seller.id) / pickSellerAvatar(seller.slug) 처럼
//  seed 가 제각각이라 같은 상담사가 화면마다 다른 캐릭터로 보였다.)
//
// 우선순위: 점집 로고 > 회원 아바타(가입 시 배정된 동물 캐릭터) > sellerId 해시 동물 캐릭터
// 레거시 꿀벌 경로(/avatars/라이브셀러_*.png 등)는 무시하고 동물 캐릭터로 대체한다.
export interface SellerImageInput {
  id?: string | null;
  shopLogo?: string | null;
  user?: { avatar?: string | null } | null;
}

export function resolveSellerDisplayImage(seller: SellerImageInput, seedFallback?: string): string {
  const logo = seller.shopLogo;
  if (logo && !isLegacyBundledAvatar(logo)) return logo;

  const avatar = seller.user?.avatar;
  if (avatar && !isLegacyBundledAvatar(avatar)) return avatar;

  return pickSajuAvatar(seller.id || seedFallback || "seller");
}

// 정적 placeholder 용 단일 기본 아바타 (SafeImage placeholder 등)
export const DEFAULT_AVATAR = BUYER_FEMALE_AVATARS[0]; // /avatars/여성구매회원_1.png

// ─── 아바타 제외 목록 ──────────────────────────────────────────────────────────
// 아래 이름의 계정은 랜덤 캐릭터를 적용하지 않고 기존 프로필 이미지 또는 이미지 없음 상태 유지.
export const AVATAR_EXCLUSIONS: ReadonlySet<string> = new Set(["김혜선", "천송이 쇼핑"]);

// name 또는 shopName 이 제외 목록에 있으면 false 반환.
export function shouldUseAvatar(name?: string | null, shopName?: string | null): boolean {
  if (name && AVATAR_EXCLUSIONS.has(name)) return false;
  if (shopName && AVATAR_EXCLUSIONS.has(shopName)) return false;
  return true;
}
