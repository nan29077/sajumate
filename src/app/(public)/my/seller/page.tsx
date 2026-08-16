import { Icon } from "@/components/shared/Icon";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopAwareLoginPath } from "@/lib/shopLoginRedirect";
import { Users } from "lucide-react";
import SafeImage from "@/components/shared/SafeImage";
import PickSellerButton from "@/components/shared/PickSellerButton";
import { pickSajuAvatar } from "@/lib/defaults";
import { isSellerLive, sellerProfileImage } from "@/lib/sellerLive";
import LiveStatusPoller from "@/components/shared/LiveStatusPoller";
import { LIVE_RING_CLASS, OnAirBadge } from "@/components/shared/LiveBadge";
import { getFeatureFlags } from "@/lib/settings";
import ConsultantSearchWidget from "@/components/shared/ConsultantSearchWidget";

export const dynamic = "force-dynamic";

// "내 픽" 은 역할과 무관하게 모든 로그인 사용자가 접근 가능 (상담사/관리자/브랜드 포함).
export default async function MySellerPage() {
  const session = await auth();
  if (!session?.user) redirect(getShopAwareLoginPath());
  const { seller: FEATURE_SELLER } = await getFeatureFlags();

  const profile = await prisma.buyerProfile.findUnique({
    where: { userId: session.user!.id },
    include: {
      primarySeller: {
        include: {
          user: { select: { name: true, avatar: true } },
          liveStreams: {
            where: { status: "LIVE" },
            take: 1,
            select: { id: true, shareCode: true },
          },
          _count: {
            select: { shopProducts: true, fans: true },
          },
        },
      },
      follows: {
        include: {
          seller: {
            include: {
              user: { select: { name: true, avatar: true } },
              liveStreams: {
                where: { status: "LIVE" },
                take: 1,
                select: { id: true, shareCode: true },
              },
              _count: {
                select: { shopProducts: true, fans: true },
              },
            },
          },
        },
      },
    },
  });

  const allSellers = [
    ...(profile?.primarySeller ? [profile.primarySeller] : []),
    ...(profile?.follows?.map((f) => f.seller) || []),
  ];

  // Remove duplicates
  const uniqueSellers = allSellers.filter(
    (seller, idx, self) => self.findIndex((s) => s.id === seller.id) === idx,
  );

  return (
    <div className="animate-fade-in pb-4">

      <div className="px-4 pt-4">
        {/* 단골 유무와 관계없이 항상 상단에 검색 바 표시 */}
        <ConsultantSearchWidget />

        {uniqueSellers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users
              size={48}
              strokeWidth={1.2}
              className="mx-auto mb-3 opacity-30"
            />
            <p className="text-sm font-medium text-gray-500">
              아직 단골 상담사가 없습니다
            </p>
            <p className="text-xs text-gray-400 mt-1">
              마음에 드는 상담사를 단골로 등록하고 소식을 받아보세요!
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {uniqueSellers.map((seller) => {
              const live = isSellerLive(seller);
              return (
                <div
                  key={seller.id}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden"
                >
                  <Link
                    href={
                      live && seller.liveStreams[0]?.shareCode
                        ? `/live/${seller.liveStreams[0].shareCode}`
                        : `/shop/${seller.slug}`
                    }
                    className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="relative flex-shrink-0 flex flex-col items-center gap-1">
                      <div
                        className={`w-14 h-14 rounded-full overflow-hidden bg-gray-100 ${live ? LIVE_RING_CLASS : "ring-2 ring-gray-100"}`}
                      >
                        <SafeImage
                          src={sellerProfileImage(seller)}
                          placeholder={pickSajuAvatar(seller.id)}
                          alt={seller.user.name || seller.shopName}
                          width={56}
                          height={56}
                          fallbackText={(seller.user.name || seller.shopName).charAt(0)}
                        />
                      </div>
                      {live && <OnAirBadge />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {seller.user.name || seller.shopName}
                        </p>
                      </div>
                      {seller.mood && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {seller.mood}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                        <span className="flex items-center gap-0.5">
                          <Icon name="Users" size={10} /> 단골 {seller._count.fans}명
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Icon name="Package" size={10} /> 상담상품{" "}
                          {seller._count.shopProducts}개
                        </span>
                      </div>
                    </div>
                    <PickSellerButton
                      sellerId={seller.id}
                      sellerName={seller.user.name || seller.shopName}
                    />
                  </Link>
                  <div className="px-4 pb-3 space-y-2">
                    {live &&
                      (seller.liveStreams[0]?.shareCode ? (
                        <Link
                          href={`/live/${seller.liveStreams[0].shareCode}`}
                          className="w-full flex items-center justify-center gap-1.5 bg-black text-white text-sm font-bold py-2.5 rounded-xl hover:bg-gray-900"
                        >
                          라이브 바로가기
                        </Link>
                      ) : seller.liveLink ? (
                        <a
                          href={seller.liveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-1.5 bg-black text-white text-sm font-bold py-2.5 rounded-xl hover:bg-gray-900"
                        >
                          라이브 바로가기
                        </a>
                      ) : null)}
                    <Link
                      href={`/shop/${seller.slug}`}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium py-2 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      라이브 점집 바로가기
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <LiveStatusPoller />
    </div>
  );
}
