import { Icon } from "@/components/shared/Icon";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SellerShopBottomNav from "@/components/shared/SellerShopBottomNav";
import { auth } from "@/lib/auth";
import { pickBuyerAvatar } from "@/lib/defaults";
import { safeQuery } from "@/lib/safeDb";
import ConsultDetailSheet from "@/components/shop/ConsultDetailSheet";

export const dynamic = "force-dynamic";

export default async function ShopMyPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await Promise.resolve(params);

  // 상담사 존재 확인
  const seller = await prisma.sellerProfile.findUnique({
    where: { slug },
    select: { id: true, slug: true, shopName: true, isApproved: true, user: { select: { name: true } } },
  });
  if (!seller || !seller.isApproved) notFound();

  // 인증 확인 (비로그인 → 점집 로그인 페이지로)
  const session = await auth();
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/shop/${slug}/my`)}`);
  }

  const userId = session.user.id!;

  // 사용자 정보 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { reviews: true } },
    },
  });

  if (!user) redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/shop/${slug}/my`)}`);

  // 이 점집에서의 예약 내역
  const rawShopReservations = await safeQuery(
    "shop my page reservations",
    () =>
      prisma.reservation.findMany({
        where: { userId, sellerId: seller.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          reservationDate: true,
          reservationTime: true,
          createdAt: true,
          items: {
            take: 1,
            select: { productName: true },
          },
        },
      }),
    [] as {
      id: string;
      status: string;
      reservationDate: Date;
      reservationTime: string;
      createdAt: Date;
      items: { productName: string }[];
    }[],
  );
  const shopReservations = rawShopReservations.map(({ items, ...reservation }) => ({
    ...reservation,
    product: items[0] ? { name: items[0].productName } : null,
  }));

  // AI 상담 요약 — 이 상담사의 라이브 채팅에서 AI 봇 메시지 추출
  const participatedStreamIds = await safeQuery(
    "shop my page stream ids",
    async () => {
      const msgs = await prisma.liveChatMessage.findMany({
        where: { userId, liveStream: { sellerId: seller.id } },
        select: { liveStreamId: true },
        distinct: ["liveStreamId"],
      });
      return msgs.map((m: { liveStreamId: string }) => m.liveStreamId);
    },
    [] as string[],
  );

  const aiSummaries = participatedStreamIds.length > 0
    ? await safeQuery(
        "shop my page ai summaries",
        () =>
          prisma.liveChatMessage.findMany({
            where: {
              isBot: true,
              liveStream: { sellerId: seller.id },
              liveStreamId: { in: participatedStreamIds },
            },
            include: { liveStream: { select: { title: true, startedAt: true, shareCode: true } } },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        [] as any[],
      )
    : [];

  // 라이브 스트림별로 그룹핑 (최신 AI 메시지 1개씩)
  const summaryByStream = new Map<string, (typeof aiSummaries)[number]>();
  for (const msg of aiSummaries) {
    if (!summaryByStream.has(msg.liveStreamId)) {
      summaryByStream.set(msg.liveStreamId, msg);
    }
  }
  const consultSummaries = [...summaryByStream.values()];

  const consultantName = seller.user.name || seller.shopName;

  const RESERVATION_STATUS: Record<string, { label: string; color: string }> = {
    PENDING: { label: "예약신청", color: "bg-yellow-50 text-yellow-700" },
    CONFIRMED: { label: "예약확정", color: "bg-blue-50 text-blue-600" },
    COMPLETED: { label: "상담완료", color: "bg-green-50 text-green-600" },
    CANCELLED: { label: "취소됨", color: "bg-red-50 text-red-600" },
    NO_SHOW: { label: "노쇼", color: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="animate-fade-in pb-32">
      {/* 헤더 */}
      <div className="bg-violet-600 px-4 pt-6 pb-10">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            <img
              src={user.avatar || pickBuyerAvatar(user.id, (user as any).gender)}
              alt={user.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">{user.name}</h1>
            {user.email && !user.email.endsWith("@no-email.local") && (
              <p className="text-xs text-white/70">{user.email}</p>
            )}
          </div>
          <Link href="/my/settings" className="p-2 text-white/80 hover:text-white">
            <Icon name="Settings" size={20} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mx-4 -mt-6 bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="text-center py-1">
            <p className="text-lg font-bold text-gray-900">{shopReservations.length}</p>
            <p className="text-[10px] text-gray-400">이 점집 예약</p>
          </div>
          <Link href="/my/reservations" className="text-center py-1">
            <p className="text-lg font-bold text-gray-900">{user._count.reviews}</p>
            <p className="text-[10px] text-gray-400">리뷰</p>
          </Link>
        </div>
      </div>

      {/* 빠른 메뉴 */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/my/reservations"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Icon name="File" size={20} />
            </div>
            <p className="text-xs font-medium text-gray-800">예약 내역</p>
          </Link>
          <Link
            href={`/shop/${slug}/book`}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Icon name="Calendar" size={20} />
            </div>
            <p className="text-xs font-medium text-gray-800">예약하기</p>
          </Link>
          <Link
            href="/my/settings"
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
              <Icon name="Settings" size={20} />
            </div>
            <p className="text-xs font-medium text-gray-800">설정</p>
          </Link>
        </div>
      </div>

      {/* 상담 내역 + 상세보기(AI 요약 포함) */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Icon name="File" size={14} className="text-violet-500" />
              {consultantName} 상담 내역
            </h2>
            {shopReservations.length > 0 && (
              <Link href="/my/reservations" className="text-xs text-violet-600 hover:underline">
                전체보기 ({shopReservations.length})
              </Link>
            )}
          </div>
          <ConsultDetailSheet
            reservations={shopReservations as any}
            aiSummaries={consultSummaries as any}
            consultantName={consultantName}
            sellerSlug={slug}
          />
        </div>
      </div>

      {/* 점집 하단 네비 */}
      <SellerShopBottomNav sellerSlug={slug} />
    </div>
  );
}
