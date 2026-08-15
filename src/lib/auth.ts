import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SELLER_REF_COOKIE,
  isValidSellerSlug,
  linkReferralForNewBuyer,
} from "@/lib/referral";
import { verifyImpersonationToken } from "@/lib/impersonation";
import { pickBuyerAvatar, pickSajuAvatar } from "@/lib/defaults";
import { normalizeRole } from "@/lib/roles";
import { ensureSellerProfile } from "@/lib/sellerProfile";

// 환경변수 미설정 provider 는 등록하지 않는다 (getProviders() 결과에서도 자동 제외).
const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      let user: any;
      try {
        user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            sellerProfile: true,
            buyerProfile: true,
          },
        });
      } catch (e) {
        console.error("[authorize] DB 조회 실패:", e);
        return null;
      }

      if (!user || !user.isActive) return null;
      if (!user.password) return null; // OAuth 만 가입한 사용자

      let isValid = false;
      try {
        isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
      } catch (e) {
        console.error("[authorize] bcrypt.compare 실패:", e);
        return null;
      }
      if (!isValid) return null;

      // DB 레거시 역할(SELLER/BUYER 등)을 현행 3역할로 정규화
      const role = normalizeRole(user.role);

      if (role === "CONSULTANT" && user.sellerProfile && !user.sellerProfile.isApproved) {
        throw new Error("CONSULTANT_NOT_APPROVED");
      }

      // 레거시/테스트 상담사 계정은 SellerProfile 이 없을 수 있다 → 최소 프로필 자동 생성
      let sellerSlug = user.sellerProfile?.slug || null;
      if (role === "CONSULTANT" && !user.sellerProfile) {
        try {
          sellerSlug = (await ensureSellerProfile(user)).slug;
        } catch (e) {
          console.error("[authorize] SellerProfile 자동 생성 실패:", e);
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        // image (NextAuth 표준) 우선, 없으면 legacy avatar 사용.
        image: (user as any).image || user.avatar,
        sellerSlug,
        mustResetPassword: user.mustResetPassword,
      } as any;
    },
  }),
  // 최고관리자 "임시 로그인" 전용 provider — 서명 토큰(/api/admin/impersonate 발급)만 검증.
  Credentials({
    id: "impersonate",
    name: "impersonate",
    credentials: { token: { label: "Token", type: "text" } },
    async authorize(credentials) {
      const token = credentials?.token as string | undefined;
      if (!token) return null;
      const userId = verifyImpersonationToken(token);
      if (!userId) return null;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          sellerProfile: true,
          buyerProfile: true,
        },
      });
      if (!user || !user.isActive) return null;

      const role = normalizeRole(user.role);
      let sellerSlug = user.sellerProfile?.slug || null;
      if (role === "CONSULTANT" && !user.sellerProfile) {
        try {
          sellerSlug = (await ensureSellerProfile(user)).slug;
        } catch (e) {
          console.error("[impersonate] SellerProfile 자동 생성 실패:", e);
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        image: (user as any).image || user.avatar,
        sellerSlug,
      } as any;
    },
  }),
];

// User.email 은 schema 상 @unique 필수. 비즈니스 앱 미인증 카카오/네이버 앱은 이메일이
// "선택 동의" 라 미동의 시 응답에 이메일이 빠진다. 이때 가입 자체가 막히지 않도록
// provider 별로 placeholder 이메일(예: kakao_<id>@no-email.local) 을 주입한다.
// 실제 이메일이 필요한 기능(예약 영수증 등) 은 별도 UI 에서 사용자에게 채우도록 유도.

function placeholderEmail(provider: string, id: string | number) {
  return `${provider}_${id}@no-email.local`;
}

// ── 소셜 프로필 부가정보(성별/생일/휴대전화/주소) 정규화 ──────────────────────
// User 컬럼 규약: gender "male"|"female", birthday "YYYY-MM-DD", phone 숫자만("01012345678").
// 모든 항목이 provider 에서 "선택 동의" 라 사용자가 거부하면 응답에서 빠진다.
// 이때 undefined 를 반환해야 PrismaAdapter 의 stripUndefined 가 걸러내어 컬럼을 건드리지 않는다.

type SocialExtras = {
  gender?: string;
  birthday?: string;
  phone?: string;
  zipCode?: string;
  address1?: string;
  address2?: string;
};

// 카카오는 E.164("+82 10-1234-5678"), 네이버는 국내형("010-1234-5678") 으로 준다.
function normalizeKoreanPhone(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const digits = raw.replace(/[^0-9]/g, "");
  // +82 국가번호는 선행 0 으로 치환 (821012345678 → 01012345678)
  const local = raw.trim().startsWith("+82") ? `0${digits.slice(2)}` : digits;
  return local || undefined;
}

// 연도까지 동의받지 못하면 YYYY-MM-DD 를 만들 수 없어 저장하지 않는다.
function toBirthday(year: unknown, month: unknown, day: unknown): string | undefined {
  const y = String(year ?? "");
  const m = String(month ?? "").padStart(2, "0");
  const d = String(day ?? "").padStart(2, "0");
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return undefined;
  return `${y}-${m}-${d}`;
}

// 네이버: gender "M"/"F"/"U", birthday "MM-DD", birthyear "1990", mobile "010-1234-5678"
// (네이버는 배송지 주소를 제공하지 않는다)
function naverExtras(r: any): SocialExtras {
  const [month, day] = String(r?.birthday ?? "").split("-");
  return {
    gender: r?.gender === "M" ? "male" : r?.gender === "F" ? "female" : undefined,
    birthday: toBirthday(r?.birthyear, month, day),
    phone: normalizeKoreanPhone(r?.mobile),
  };
}

// 카카오 배송지: /v2/user/me 응답에는 없고 별도 API 로만 조회된다.
// shipping_addresses 는 배열이고 기본 배송지(is_default) 가 없을 수도 있다.
// 우편번호는 신주소 zone_number(5자리) 우선, 없으면 구주소 zip_code(6자리).
// 도로명 주소가 없으면 주소로서 의미가 없으므로 세 컬럼 모두 채우지 않는다.
function kakaoAddress(listRaw: unknown): Pick<SocialExtras, "zipCode" | "address1" | "address2"> {
  const list: any[] = Array.isArray(listRaw) ? listRaw : [];
  const addr = list.find((a) => a?.is_default) ?? list[0];
  const address1 = addr?.base_address?.trim();
  if (!address1) return {};
  return {
    zipCode: addr.zone_number?.trim() || addr.zip_code?.trim() || undefined,
    address1,
    address2: addr.detail_address?.trim() || undefined,
  };
}

// 배송지 조회 실패(미동의/scope 미승인/네트워크)는 로그인 자체를 막지 않는다.
async function fetchKakaoShippingAddress(
  accessToken?: string,
): Promise<Pick<SocialExtras, "zipCode" | "address1" | "address2">> {
  if (!accessToken) return {};
  try {
    const res = await fetch("https://kapi.kakao.com/v1/user/shipping_address", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error("[kakao] shipping_address API", res.status, await res.text().catch(() => ""));
      return {};
    }
    const data: any = await res.json();
    return kakaoAddress(data?.shipping_addresses);
  } catch (e) {
    console.error("[kakao] shipping_address API error", e);
    return {};
  }
}

// 카카오: gender "male"/"female"(앱 규약과 동일), birthday "MMDD", birthyear "1990",
// phone_number "+82 10-1234-5678". 미동의 항목은 *_needs_agreement=true 이고 값이 빠진다.
function kakaoExtras(acc: any): SocialExtras {
  const bd = String(acc?.birthday ?? "");
  return {
    gender: acc?.gender === "male" || acc?.gender === "female" ? acc.gender : undefined,
    birthday: toBirthday(acc?.birthyear, bd.slice(0, 2), bd.slice(2, 4)),
    phone: normalizeKoreanPhone(acc?.phone_number),
  };
}

// 인가 요청에 scope 를 명시해야 "이미 연결된" 사용자에게도 미동의 항목의 추가 동의
// 화면이 뜬다 (동의 항목을 콘솔에 나중에 추가한 경우 이 방법뿐).
// ⚠️ 콘솔 동의 항목에 없는 scope 를 요청하면 KOE205 로 로그인 전체가 실패한다 —
// 아래 목록은 카카오 개발자센터 동의 항목 설정과 반드시 일치해야 한다.
// 2026-07-21 비즈 앱 전환 + 전화번호·배송지(선택동의) 활성화 → phone_number, shipping_address 추가.
// 콘솔에서 성별/생일/출생연도를 추가로 활성화하면
// "gender", "birthday", "birthyear" 를 다시 추가할 것.
const KAKAO_SCOPES = [
  "profile_nickname",
  "profile_image",
  "account_email",
  "phone_number",
  "shipping_address",
].join(",");

if (process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET) {
  providers.push(Kakao({
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    // params 만 주면 provider 기본 URL 이 placeholder 로 대체되고, 카카오는 issuer 가
    // 없어 discovery 시도 중 Invalid URL 로 로그인이 죽는다 — url 을 반드시 함께 명시.
    authorization: {
      url: "https://kauth.kakao.com/oauth/authorize",
      params: { scope: KAKAO_SCOPES },
    },
    async profile(profile: any, tokens: any) {
      const acc = profile?.kakao_account ?? {};
      const props = profile?.properties ?? {};
      const email =
        (acc.is_email_valid && !acc.email_needs_agreement && acc.email) ||
        placeholderEmail("kakao", profile.id);
      const name = acc.profile?.nickname || props.nickname || "카카오사용자";
      const image = acc.profile?.profile_image_url || props.profile_image || null;
      return {
        id: String(profile.id),
        name,
        email,
        image,
        ...kakaoExtras(acc),
        ...(await fetchKakaoShippingAddress(tokens?.access_token)),
      };
    },
  }));
}
if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
  providers.push(Naver({
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    profile(profile: any) {
      const r = profile?.response ?? profile;
      const id = r.id ?? profile.id;
      const email = r.email || placeholderEmail("naver", id);
      const name = r.name || r.nickname || "네이버사용자";
      const image = r.profile_image || null;
      // 성별/생일/휴대전화 동의 항목 — PrismaAdapter.createUser 가 User 컬럼에 그대로 저장한다.
      return { id: String(id), name, email, image, ...naverExtras(r) };
    },
  }));
}
// 구글은 id_token / userinfo 응답에 성별·생일·전화번호가 없다 (People API + 민감 scope 필요).
// 민감 scope 는 별도 검수 대상이라 수집하지 않는다 — 부가정보는 카카오/네이버에서만 받는다.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // 구글은 사실상 이메일이 항상 오지만 방어적 fallback 만 추가.
    profile(profile: any) {
      const email = profile.email || placeholderEmail("google", profile.sub);
      return {
        id: profile.sub,
        name: profile.name || "구글사용자",
        email,
        image: profile.picture || null,
      };
    },
  }));
}

// 이미 소셜 가입된 사용자의 빈 프로필 항목을 재로그인 시 보충한다.
// 신규 가입은 profile() → PrismaAdapter.createUser 가 처리하므로 여기 대상이 아니다.
async function backfillSocialProfile(existing: any, account: any, profile: any) {
  let extras: SocialExtras;
  if (account.provider === "naver") {
    extras = naverExtras(profile?.response ?? profile);
  } else if (account.provider === "kakao") {
    extras = kakaoExtras(profile?.kakao_account ?? {});
    // 배송지는 별도 API — 채울 여지가 있을 때만 호출해 불필요한 왕복을 피한다.
    if (!existing.address1) {
      Object.assign(extras, await fetchKakaoShippingAddress(account.access_token));
    }
  } else {
    return; // 구글은 부가정보를 수집하지 않는다.
  }

  const fill: Record<string, string> = {};
  for (const key of ["gender", "birthday", "phone"] as const) {
    const value = extras[key];
    if (!existing[key] && value) fill[key] = value;
  }
  // 주소는 세 컬럼이 한 세트다. address1 이 이미 있으면 우편번호만 갈아끼워
  // 서로 어긋난 주소가 되지 않도록 통째로 건너뛴다.
  if (!existing.address1 && extras.address1) {
    fill.address1 = extras.address1;
    if (extras.zipCode) fill.zipCode = extras.zipCode;
    if (extras.address2) fill.address2 = extras.address2;
  }
  if (!Object.keys(fill).length) return;

  try {
    await prisma.user.update({ where: { id: existing.id }, data: fill });
  } catch (e) {
    console.error(`[signIn] ${account.provider} profile backfill error`, e);
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma as any) as any,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  providers,
  callbacks: {
    /**
     * OAuth signIn 시 이메일 충돌 차단.
     * 기존 일반 가입 사용자(같은 이메일, OAuth Account 없음)와 OAuth 이메일이 같으면
     * 자동 link 하지 않는다. 사용자는 비밀번호로 로그인해야 함.
     */
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;

      const email = user?.email;
      if (!email) return true;

      // Account 모델은 prisma generate 후 인식 — 빌드 안전 위해 as any
      const existing = await (prisma.user as any).findUnique({
        where: { email },
        include: { accounts: true },
      });
      if (!existing) return true; // 신규 → Adapter 가 User+Account 생성 → events.createUser

      const accounts: Array<{ provider: string; providerAccountId: string }> =
        existing.accounts ?? [];

      const hasSameOAuth = accounts.some(
        (a) =>
          a.provider === account.provider &&
          a.providerAccountId === account.providerAccountId,
      );
      if (hasSameOAuth) {
        // 이미 가입된 사용자는 events.createUser 가 다시 불리지 않는다. 동의 항목을 나중에
        // 추가했거나 최초 가입 때 거부했다가 재동의한 경우를 위해 "비어 있는 값만" 보충한다.
        // (사용자가 마이페이지에서 직접 고친 값은 덮어쓰지 않는다.)
        await backfillSocialProfile(existing, account, profile);
        return true;
      }

      const hasOnlyCredentials = accounts.length === 0 && !!existing.password;
      if (hasOnlyCredentials) {
        return "/auth/login?error=EmailExists";
      }

      // 이 이메일이 "실제로 가입된" 로그인 방식을 팝업에서 안내하기 위해 함께 넘긴다.
      const methods: string[] = [];
      if (existing.password) methods.push("credentials");
      for (const a of accounts) methods.push(a.provider);
      const methodParam = methods.length
        ? `&method=${encodeURIComponent(methods.join(","))}`
        : "";
      return `/auth/login?error=OAuthAccountNotLinked${methodParam}`;
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = normalizeRole((user as any).role);
        token.sellerSlug = (user as any).sellerSlug;
        token.picture = (user as any).image || null;
        token.mustResetPassword = Boolean((user as any).mustResetPassword);
      }
      // 강제 재설정 완료 시 클라이언트 update({ mustResetPassword: false }) 로 토큰 갱신
      if (trigger === "update" && typeof (session as any)?.mustResetPassword === "boolean") {
        token.mustResetPassword = (session as any).mustResetPassword;
      }
      if (!token.role && token.sub) {
        const u = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { sellerProfile: true },
        });
        if (u) {
          token.role = normalizeRole(u.role);
          token.sellerSlug = u.sellerProfile?.slug || null;
          token.picture = (u as any).image || u.avatar || null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.image = (token.picture as string) || null;
        // 기존 발급 JWT 에 레거시 역할이 남아 있을 수 있어 세션에서도 한 번 더 정규화
        session.user.role = normalizeRole(token.role);
        session.user.sellerSlug = token.sellerSlug as string | null;
        session.user.mustResetPassword = Boolean(token.mustResetPassword);
      }
      return session;
    },
  },
  events: {
    /**
     * OAuth 신규 가입 시 호출. Credentials 가입은 호출 안 됨 — register API 에서 직접 처리.
     * 처리:
     *  1) 소셜 프로필 사진이 없는 고객에게 랜덤 고객 캐릭터 배정
     *  2) 쿠키 sb_ref 에서 상담사 slug 추출
     *  3) linkReferralForNewBuyer 로 BuyerProfile 생성 + 추천인 매핑 + totalFans++
     *  4) OAuth 가입자는 CUSTOMER 역할 (schema default 유지)
     */
    async createUser({ user }) {
      if (!user?.id) return;

      try {
        const cookieStore = await cookies();
        const refCookie = cookieStore.get(SELLER_REF_COOKIE)?.value;
        const sellerSlug = refCookie && isValidSellerSlug(refCookie) ? refCookie : null;

        // 개인 샵 유입 고객은 기존 프로필 풀, 일반 유입 고객은 사주 캐릭터 풀을 사용한다.
        // 소셜 제공자가 프로필 사진을 준 경우에는 사용자의 원본 이미지를 존중한다.
        if (!user.image) {
          await prisma.user.update({
            where: { id: user.id },
            data: { avatar: sellerSlug ? pickBuyerAvatar(user.id) : pickSajuAvatar(user.id) },
          });
        }

        await linkReferralForNewBuyer(prisma, { userId: user.id, sellerRef: sellerSlug, referralCode: null });
      } catch (e) {
        console.error("[createUser] avatar/referral setup error", e);
      }
    },
  },
});
