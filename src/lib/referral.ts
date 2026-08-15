import type { PrismaClient } from "@/generated/prisma";

// 기존 쿠키 이름은 이미 배포된 링크와의 호환성을 위해 유지한다.
export const SELLER_REF_COOKIE = "sb_ref";
export const SELLER_REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SELLER_REF_COOKIE_OPTIONS = {
  maxAge: SELLER_REF_COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

export function isValidSellerSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && /^[a-z0-9][a-z0-9-_]*$/i.test(value);
}

export interface ReferralLinkInput {
  userId: string;
  sellerRef?: string | null;
  // 과거 호출부 호환 전용. 추천 코드로는 더 이상 연결하지 않는다.
  referralCode?: string | null;
}

export interface ReferralLinkResult {
  mappedSellerId: string | null;
  reason?: string;
}

/**
 * 상담사 전용 공간에서 가입한 시청자를 해당 상담사의 회원으로 연결한다.
 * 추천 커미션·할인 코드는 처리하지 않는다.
 */
export async function linkReferralForNewBuyer(
  prisma: PrismaClient,
  input: ReferralLinkInput,
): Promise<ReferralLinkResult> {
  const sellerSlug = isValidSellerSlug(input.sellerRef) ? input.sellerRef : null;
  const seller = sellerSlug
    ? await prisma.sellerProfile.findUnique({
        where: { slug: sellerSlug },
        select: { id: true, isApproved: true },
      })
    : null;
  const mappedSellerId = seller?.isApproved ? seller.id : null;

  await prisma.buyerProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      primarySellerId: mappedSellerId,
      referredBySellerId: mappedSellerId,
      referralCode: sellerSlug,
    },
    update: mappedSellerId
      ? {
          primarySellerId: mappedSellerId,
          referredBySellerId: mappedSellerId,
          referralCode: sellerSlug,
        }
      : {},
  });

  if (mappedSellerId) {
    await prisma.sellerProfile.update({
      where: { id: mappedSellerId },
      data: { totalFans: { increment: 1 } },
    });
  }

  return { mappedSellerId, reason: mappedSellerId ? "shop_member_linked" : "no_shop_member_link" };
}
