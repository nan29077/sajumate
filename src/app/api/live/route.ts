import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyLiveStartToFollowers, type LiveNotifyResult } from "@/lib/liveNotify";
import { createLiveStartNotifications } from "@/lib/notifications";
import { forwardSiteChatToYoutube } from "@/lib/youtubeChatForward";
import { sellerProfileImage } from "@/lib/sellerLive";
import { isMissingSchemaError } from "@/lib/safeDb";

// B방식(OBS/PRISM → YouTube 송출)용 고정 RTMP 서버 주소
const YOUTUBE_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";

function generateShareCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// datetime-local 값은 timezone 정보가 없어 Node.js 에서 UTC 로 해석됨.
// 상담사는 KST 기준으로 입력하므로 +09:00 을 명시해 파싱한다.
function parseKstDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  if (hasTimezone) return new Date(value);
  const withSeconds = /T\d{2}:\d{2}:\d{2}/.test(value) ? value : `${value}:00`;
  return new Date(`${withSeconds}+09:00`);
}

// GET: 상담사의 라이브 목록 또는 라이브 검색
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode"); // "seller" | "search" | "detail"
  const code = searchParams.get("code");
  const query = searchParams.get("q");

  // 라이브 상세 (liveId 직접 조회 - 상담사 채팅관리용)
  const liveId = searchParams.get("liveId");
  if (mode === "detail" && liveId) {
    const live = await prisma.liveStream.findUnique({
      where: { id: liveId },
      include: {
        // 스팸 필터로 숨김 처리된 메시지는 무인증 상세 조회에서 제외
        chatMessages: { where: { isHidden: false }, orderBy: { createdAt: "desc" }, take: 100 },
        products: {
          include: { product: { select: { id: true, name: true, thumbnail: true, basePrice: true, comparePrice: true, badges: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!live) return NextResponse.json({ error: "라이브를 찾을 수 없습니다." }, { status: 404 });
    // 스트림 키는 송출용 비밀값 — 인증 없는 상세 조회 응답에서 제외
    const { streamKey: _sk1, ...liveSafe } = live;
    return NextResponse.json({
      live: {
        ...liveSafe,
        products: live.products.map(p => ({
          ...p,
          product: { ...p.product, basePrice: Number(p.product.basePrice), comparePrice: p.product.comparePrice ? Number(p.product.comparePrice) : null },
          livePrice: p.livePrice ? Number(p.livePrice) : null,
        })),
      },
    });
  }

  // 라이브 상세 (공유코드로)
  if (mode === "detail" && code) {
    const live = await prisma.liveStream.findUnique({
      where: { shareCode: code },
      include: {
        seller: { select: { id: true, shopName: true, shopLogo: true, user: { select: { avatar: true } }, slug: true, totalFans: true, _count: { select: { followers: true, liveStreams: true } } } },
        products: {
          include: { product: { select: { id: true, name: true, thumbnail: true, basePrice: true, comparePrice: true, badges: true } } },
          orderBy: { sortOrder: "asc" },
        },
        // 스팸 필터로 숨김 처리된 메시지는 공개 시청 페이지에서 제외
        chatMessages: { where: { isHidden: false }, orderBy: { createdAt: "desc" }, take: 50 },
        coupons: {
          select: { id: true, code: true, discountType: true, discountValue: true, validDays: true, maxCount: true, minOrderAmount: true, issuedCount: true },
        },
      },
    });
    if (!live) return NextResponse.json({ error: "라이브를 찾을 수 없습니다." }, { status: 404 });
    // 스트림 키는 송출용 비밀값 — 공개 시청 페이지 응답에서 제외
    const { streamKey: _sk2, ...liveSafe } = live;
    const { user: _sellerUser, ...sellerRest } = live.seller;

    // 점사 예약 정보 — 설정·당일 예약 수 (테이블 미반영 환경에서는 null)
    let reservationInfo: {
      showReservationWidget: boolean;
      dailySlotLimit: number | null;
      reservedToday: number;
    } | null = null;
    try {
      const settings = await prisma.liveReservationSettings.findUnique({
        where: { liveStreamId: live.id },
        select: { dailySlotLimit: true, showReservationWidget: true },
      });
      if (settings) {
        let reservedToday = 0;
        try {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          reservedToday = await prisma.reservation.count({
            where: {
              liveStreamId: live.id,
              createdAt: { gte: dayStart },
              status: { not: "CANCELLED" },
            },
          });
        } catch (e) {
          if (!isMissingSchemaError(e)) throw e;
        }
        reservationInfo = {
          showReservationWidget: settings.showReservationWidget,
          dailySlotLimit: settings.dailySlotLimit,
          reservedToday,
        };
      }
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }

    return NextResponse.json({
      live: {
        ...liveSafe,
        seller: { ...sellerRest, shopLogo: sellerProfileImage(live.seller) },
        products: live.products.map(p => ({ ...p, product: { ...p.product, basePrice: Number(p.product.basePrice), comparePrice: p.product.comparePrice ? Number(p.product.comparePrice) : null }, livePrice: p.livePrice ? Number(p.livePrice) : null })),
        coupons: live.coupons.map(c => ({ ...c, discountValue: Number(c.discountValue), minOrderAmount: c.minOrderAmount ? Number(c.minOrderAmount) : null })),
        reservationInfo,
      }
    });
  }

  // 라이브 검색 (공유코드 또는 키워드, 빈 쿼리일 경우 진행중인 라이브 반환)
  if (mode === "search") {
    const searchWhere = query ? {
      OR: [
        { shareCode: { contains: query } },
        { title: { contains: query } },
        { seller: { shopName: { contains: query } } },
      ],
      status: { in: ["LIVE", "SCHEDULED", "ENDED"] as any },
    } : {
      status: { in: ["LIVE", "SCHEDULED"] as any },
    };
    const lives = await prisma.liveStream.findMany({
      where: searchWhere,
      include: {
        // id 는 sellerProfileImage() 의 동물 캐릭터 해시 시드 — 누락 시 전 상담사가 동일 캐릭터로 표시됨
        seller: { select: { id: true, shopName: true, shopLogo: true, user: { select: { avatar: true } }, slug: true } },
        products: { include: { product: { select: { name: true, thumbnail: true, basePrice: true } } }, take: 3 },
        _count: { select: { products: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
    });
    return NextResponse.json({
      lives: lives.map(l => {
        const { user: _u, ...sellerRest } = l.seller;
        return {
          ...l,
          seller: { ...sellerRest, shopLogo: sellerProfileImage(l.seller) },
          products: l.products.map(p => ({ ...p, product: { ...p.product, basePrice: Number(p.product.basePrice) }, livePrice: p.livePrice ? Number(p.livePrice) : null })),
        };
      }),
    });
  }

  // 상담사 자신의 라이브 목록
  const session = await auth();
  if (!session) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const role = session.user?.role;
  if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 접근 가능" }, { status: 403 });

  const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
  if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

  const lives = await prisma.liveStream.findMany({
    where: { sellerId: seller.id },
    include: {
      products: {
        include: { product: { select: { id: true, name: true, thumbnail: true, basePrice: true, comparePrice: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { chatMessages: true, products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    lives: lives.map(l => ({
      ...l,
      products: l.products.map(p => ({ ...p, product: { ...p.product, basePrice: Number(p.product.basePrice), comparePrice: p.product.comparePrice ? Number(p.product.comparePrice) : null }, livePrice: p.livePrice ? Number(p.livePrice) : null })),
    })),
  });
}

// POST: 라이브 생성 / 시작 / 종료 / 상담상품관리 / 채팅
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // liveId 를 대상으로 하는 조작성 액션은 라이브 소유 상담사 본인(또는 관리자)만 허용.
  // (기존에는 세션 체크만 있어 로그인한 고객이 타 상담사 라이브를 시작/종료/삭제할 수 있었다)
  const OWNER_ONLY_ACTIONS = ["start", "end", "update_products", "switch_product", "kakao_notify", "delete", "update"];
  if (OWNER_ONLY_ACTIONS.includes(action)) {
    if (!body.liveId) return NextResponse.json({ error: "liveId가 필요합니다." }, { status: 400 });
    const role = session.user?.role;
    if (role !== "SUPER_ADMIN") {
      if (role !== "CONSULTANT") return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
      if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });
      const target = await prisma.liveStream.findUnique({ where: { id: body.liveId }, select: { sellerId: true } });
      if (!target || target.sellerId !== seller.id) {
        return NextResponse.json({ error: "본인 라이브만 조작할 수 있습니다." }, { status: 403 });
      }
    }
  }

  if (action === "create") {
    const role = session.user?.role;
    if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 라이브 생성 가능" }, { status: 403 });

    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
    if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

    let shareCode = generateShareCode();
    while (await prisma.liveStream.findUnique({ where: { shareCode } })) {
      shareCode = generateShareCode();
    }

    // 외부 플랫폼: YOUTUBE | INSTAGRAM | TIKTOK 만 허용.
    const allowedPlatforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK"] as const;
    const platform = typeof body.platform === "string" && (allowedPlatforms as readonly string[]).includes(body.platform)
      ? body.platform
      : null;
    const externalUrl = typeof body.externalUrl === "string" && body.externalUrl.trim().length > 0
      ? body.externalUrl.trim()
      : null;
    // YouTube 라이브(B방식): 상담사가 입력한 YouTube 스트림 키 + 유튜브 고정 RTMP 서버 저장
    const isYoutube = platform === "YOUTUBE";
    const youtubeStreamKey = typeof body.streamKey === "string" && body.streamKey.trim().length > 0
      ? body.streamKey.trim()
      : null;

    const live = await prisma.liveStream.create({
      data: {
        sellerId: seller.id,
        title: body.title || "새 라이브",
        description: body.description || null,
        thumbnailImage: body.thumbnailImage || null,
        scheduledAt: parseKstDateTime(body.scheduledAt),
        platform,
        externalUrl,
        shareCode,
        rtmpUrl: isYoutube ? YOUTUBE_RTMP_URL : "rtmp://live.sajumate.com/live",
        streamKey: isYoutube ? youtubeStreamKey : `sk_${seller.id}_${Date.now()}`,
      },
    });

    // 상담상품 추가
    if (body.productIds?.length > 0) {
      await prisma.liveStreamProduct.createMany({
        data: body.productIds.map((pid: string, idx: number) => ({
          liveStreamId: live.id,
          productId: pid,
          sortOrder: idx,
          livePrice: body.livePrices?.[pid] ? parseFloat(body.livePrices[pid]) : null,
        })),
      });
    }

    // 예약 설정 (점사 예약 방식 방송) — 테이블 미반영(P2021) 환경에서는 생략
    try {
      const dailySlotLimit =
        body.dailySlotLimit != null && !Number.isNaN(parseInt(body.dailySlotLimit))
          ? Math.max(0, parseInt(body.dailySlotLimit))
          : null;
      await prisma.liveReservationSettings.create({
        data: {
          liveStreamId: live.id,
          dailySlotLimit,
          showReservationWidget: body.showReservationWidget !== false,
        },
      });
    } catch (e) {
      if (isMissingSchemaError(e)) {
        console.warn("[live:create] live_reservation_settings 미반영 — 예약 설정 생략");
      } else {
        console.error("[live:create] 예약 설정 저장 실패:", e);
      }
    }

    // 쿠폰 생성 (코드와 할인값이 있을 때만)
    if (body.coupon?.code && body.coupon?.discountValue) {
      await prisma.liveCoupon.create({
        data: {
          liveStreamId: live.id,
          code: String(body.coupon.code).toUpperCase(),
          discountType: body.coupon.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
          discountValue: parseFloat(body.coupon.discountValue),
          validDays: parseInt(body.coupon.validDays) || 7,
          maxCount: body.coupon.maxCount ? parseInt(body.coupon.maxCount) : null,
          minOrderAmount: body.coupon.minOrderAmount ? parseFloat(body.coupon.minOrderAmount) : null,
        },
      });
    }

    return NextResponse.json({ live });
  }

  if (action === "start") {
    const live = await prisma.liveStream.update({
      where: { id: body.liveId },
      data: { status: "LIVE", startedAt: new Date() },
    });
    // 라이브 상담 시작 시 점집관리 수동 라이브 스위치 자동 OFF (중복 배지 방지)
    await prisma.sellerProfile.update({
      where: { id: live.sellerId },
      data: { isManualLive: false },
    }).catch(() => {});
    // 방송 시작 시 팔로워에게 카카오 알림톡 자동 발송 (실패해도 방송 시작은 막지 않음)
    const notify = await notifyLiveStartToFollowers(body.liveId).catch((e): LiveNotifyResult => {
      console.error("[live:start] 알림톡 발송 오류:", e);
      return { notified: false, reason: String(e?.message || e) };
    });
    // 인앱 알림 생성 (알림톡과 별개로 항상 저장 — 알림 벨/목록에 노출)
    await createLiveStartNotifications(body.liveId).catch((e) => {
      console.error("[live:start] 인앱 알림 생성 오류:", e);
    });
    return NextResponse.json({ live, notify });
  }

  if (action === "end") {
    const live = await prisma.liveStream.update({
      where: { id: body.liveId },
      data: { status: "ENDED", endedAt: new Date(), isVodSaved: true, vodUrl: `/vod/${body.liveId}` },
    });
    return NextResponse.json({ live });
  }

  if (action === "update_products") {
    // 라이브 중 상담상품 교체
    const { liveId, productIds, livePrices } = body;
    await prisma.liveStreamProduct.deleteMany({ where: { liveStreamId: liveId } });
    if (productIds?.length > 0) {
      await prisma.liveStreamProduct.createMany({
        data: productIds.map((pid: string, idx: number) => ({
          liveStreamId: liveId,
          productId: pid,
          sortOrder: idx,
          livePrice: livePrices?.[pid] ? parseFloat(livePrices[pid]) : null,
          isActive: true,
        })),
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "update_external_url") {
    // SCHEDULED/LIVE 상태일 때만 외부 라이브 URL(및 플랫폼) 수정 허용.
    const role = session.user?.role;
    if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 가능" }, { status: 403 });
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
    if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

    const target = await prisma.liveStream.findUnique({ where: { id: body.liveId } });
    if (!target || target.sellerId !== seller.id) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    if (target.status !== "SCHEDULED" && target.status !== "LIVE") {
      return NextResponse.json({ error: "진행 중이거나 예정된 라이브만 수정 가능합니다" }, { status: 400 });
    }

    const data: { externalUrl?: string | null; platform?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(body, "externalUrl")) {
      data.externalUrl = typeof body.externalUrl === "string" && body.externalUrl.trim().length > 0
        ? body.externalUrl.trim()
        : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "platform")) {
      const allowedPlatforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK"] as const;
      data.platform = typeof body.platform === "string" && (allowedPlatforms as readonly string[]).includes(body.platform)
        ? body.platform
        : null;
    }

    const updated = await prisma.liveStream.update({ where: { id: body.liveId }, data });
    return NextResponse.json({ live: updated });
  }

  if (action === "update_stream_key") {
    // B방식(OBS/PRISM → YouTube 송출)용 스트림 키 저장. 상담사 본인 라이브만 가능.
    const role = session.user?.role;
    if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 가능" }, { status: 403 });
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
    if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

    const target = await prisma.liveStream.findUnique({ where: { id: body.liveId } });
    if (!target || target.sellerId !== seller.id) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    if (target.status !== "SCHEDULED" && target.status !== "LIVE") {
      return NextResponse.json({ error: "진행 중이거나 예정된 라이브만 수정 가능합니다" }, { status: 400 });
    }

    const streamKey = typeof body.streamKey === "string" && body.streamKey.trim().length > 0
      ? body.streamKey.trim()
      : null;
    const updated = await prisma.liveStream.update({
      where: { id: body.liveId },
      data: { streamKey, rtmpUrl: YOUTUBE_RTMP_URL },
    });
    return NextResponse.json({ live: updated });
  }

  if (action === "switch_product") {
    // 라이브 중 특정 상담상품 활성화/비활성화
    await prisma.liveStreamProduct.updateMany({ where: { liveStreamId: body.liveId }, data: { isActive: false } });
    if (body.productId) {
      await prisma.liveStreamProduct.updateMany({
        where: { liveStreamId: body.liveId, productId: body.productId },
        data: { isActive: true },
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "toggle_past_in_shop") {
    // 종료된 방송을 점집 "지난 방송 상담상품" 영역에 노출할지 상담사가 방송별로 on/off
    const role = session.user?.role;
    if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 가능" }, { status: 403 });
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
    if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

    const target = await prisma.liveStream.findUnique({ where: { id: body.liveId } });
    if (!target || target.sellerId !== seller.id) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    await prisma.liveStream.update({
      where: { id: body.liveId },
      data: { showPastInShop: Boolean(body.show) },
    });
    return NextResponse.json({ success: true, showPastInShop: Boolean(body.show) });
  }

  if (action === "chat") {
    // isManager/isSystem 은 body 값을 신뢰하지 않는다 — 라이브 소유 상담사·관리자만 부여 가능
    let isManager = false;
    let isSystem = false;
    if (body.isManager || body.isSystem) {
      const role = session.user?.role;
      if (role === "SUPER_ADMIN") {
        isManager = !!body.isManager;
        isSystem = !!body.isSystem;
      } else if (role === "CONSULTANT") {
        const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
        const target = seller
          ? await prisma.liveStream.findUnique({ where: { id: body.liveId }, select: { sellerId: true } })
          : null;
        if (seller && target && target.sellerId === seller.id) {
          isManager = !!body.isManager;
          isSystem = !!body.isSystem;
        }
      }
    }
    const msg = await prisma.liveChatMessage.create({
      data: {
        liveStreamId: body.liveId,
        userId: session.user!.id,
        nickname: body.nickname || session.user!.name || "익명",
        message: body.message,
        isManager,
        isSystem,
      },
    });
    // 사이트 채팅 → YouTube 라이브 채팅 전달 (시스템 메시지 제외, 실패해도 채팅 저장에 영향 없음)
    if (!msg.isSystem) {
      await forwardSiteChatToYoutube(body.liveId, msg.nickname, msg.message).catch((e) =>
        console.error("[live:chat] YouTube 채팅 전달 오류:", e),
      );
    }
    return NextResponse.json({ message: msg });
  }

  if (action === "toggle_yt_forward") {
    // 사이트 채팅 → YouTube 전달 on/off (상담사 본인 라이브만)
    const role = session.user?.role;
    if (role !== "CONSULTANT") return NextResponse.json({ error: "상담사만 가능" }, { status: 403 });
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: session.user!.id } });
    if (!seller) return NextResponse.json({ error: "상담사 프로필 없음" }, { status: 404 });

    const target = await prisma.liveStream.findUnique({ where: { id: body.liveId } });
    if (!target || target.sellerId !== seller.id) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const updated = await prisma.liveStream.update({
      where: { id: body.liveId },
      data: { ytChatForward: Boolean(body.enabled) },
    });
    return NextResponse.json({ success: true, ytChatForward: updated.ytChatForward });
  }

  if (action === "kakao_notify") {
    // 카카오 알림톡 수동 발송/재발송 (force: 이미 발송된 라이브도 다시 전송)
    const result = await notifyLiveStartToFollowers(body.liveId, { force: true }).catch((e): LiveNotifyResult => {
      console.error("[live:kakao_notify] 알림톡 발송 오류:", e);
      return { notified: false, reason: String(e?.message || e) };
    });
    if (!result.notified) {
      return NextResponse.json(
        { success: false, message: `알림톡 발송 실패: ${result.reason || "알 수 없는 오류"}`, result },
        { status: 400 },
      );
    }
    return NextResponse.json({
      success: true,
      message: `알림톡 발송 요청 완료 (접수 ${result.successCount}/${result.attempted}건)`,
      result,
    });
  }

  if (action === "claim_coupon") {
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const coupon = await prisma.liveCoupon.findUnique({ where: { id: body.couponId } });
    if (!coupon) return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });

    // 수량 소진 확인 (1차 — 빠른 응답용. 최종 확정은 아래 조건부 갱신에서 원자적으로 판정)
    if (coupon.maxCount !== null && coupon.issuedCount >= coupon.maxCount) {
      return NextResponse.json({ error: "쿠폰이 모두 소진되었습니다.", soldOut: true }, { status: 400 });
    }

    // 이미 수령한 쿠폰 확인
    const existing = await prisma.userCoupon.findUnique({
      where: { liveCouponId_userId: { liveCouponId: body.couponId, userId: session.user!.id } },
    });
    if (existing) {
      return NextResponse.json({ alreadyClaimed: true, message: "이미 수령한 쿠폰입니다.", couponCode: coupon.code });
    }

    // 쿠폰 발급 — issuedCount < maxCount 조건부 갱신으로 동시 요청 초과 발급(race) 방지
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.liveCoupon.updateMany({
          where: {
            id: body.couponId,
            ...(coupon.maxCount !== null ? { issuedCount: { lt: coupon.maxCount } } : {}),
          },
          data: { issuedCount: { increment: 1 } },
        });
        if (claimed.count === 0) throw new Error("COUPON_SOLD_OUT");
        await tx.userCoupon.create({ data: { liveCouponId: body.couponId, userId: session.user!.id } });
      });
    } catch (e: any) {
      if (e instanceof Error && e.message === "COUPON_SOLD_OUT") {
        return NextResponse.json({ error: "쿠폰이 모두 소진되었습니다.", soldOut: true }, { status: 400 });
      }
      // 동시 중복 수령(userCoupon unique 충돌) — 이미 수령한 것으로 응답 (increment 는 트랜잭션 롤백됨)
      if (e?.code === "P2002") {
        return NextResponse.json({ alreadyClaimed: true, message: "이미 수령한 쿠폰입니다.", couponCode: coupon.code });
      }
      throw e;
    }

    return NextResponse.json({ success: true, couponCode: coupon.code });
  }

  // 시청자 입장/퇴장 — viewerCount 증감, peakViewerCount 는 최대값 유지
  if (action === "join" || action === "leave") {
    if (!body.liveId) return NextResponse.json({ error: "liveId가 필요합니다." }, { status: 400 });
    const target = await prisma.liveStream.findUnique({
      where: { id: body.liveId },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "라이브를 찾을 수 없습니다." }, { status: 404 });

    if (action === "join") {
      const live = await prisma.$transaction(async (tx) => {
        const inc = await tx.liveStream.update({
          where: { id: body.liveId },
          data: { viewerCount: { increment: 1 } },
          select: { viewerCount: true, peakViewerCount: true },
        });
        if (inc.viewerCount > inc.peakViewerCount) {
          return tx.liveStream.update({
            where: { id: body.liveId },
            data: { peakViewerCount: inc.viewerCount },
            select: { viewerCount: true, peakViewerCount: true },
          });
        }
        return inc;
      });
      return NextResponse.json({ success: true, viewerCount: live.viewerCount, peakViewerCount: live.peakViewerCount });
    }

    // leave — 0 미만으로 내려가지 않도록 조건부 감소
    await prisma.liveStream.updateMany({
      where: { id: body.liveId, viewerCount: { gt: 0 } },
      data: { viewerCount: { decrement: 1 } },
    });
    const live = await prisma.liveStream.findUnique({
      where: { id: body.liveId },
      select: { viewerCount: true, peakViewerCount: true },
    });
    return NextResponse.json({
      success: true,
      viewerCount: live?.viewerCount ?? 0,
      peakViewerCount: live?.peakViewerCount ?? 0,
    });
  }

  // 좋아요 — likeCount +1
  if (action === "like") {
    if (!body.liveId) return NextResponse.json({ error: "liveId가 필요합니다." }, { status: 400 });
    const liked = await prisma.liveStream.updateMany({
      where: { id: body.liveId },
      data: { likeCount: { increment: 1 } },
    });
    if (liked.count === 0) return NextResponse.json({ error: "라이브를 찾을 수 없습니다." }, { status: 404 });
    const live = await prisma.liveStream.findUnique({
      where: { id: body.liveId },
      select: { likeCount: true },
    });
    return NextResponse.json({ success: true, likeCount: live?.likeCount ?? 0 });
  }

  if (action === "delete") {
    // 라이브에 연결된 예약의 FK 를 먼저 끊는다 (liveStreamId 참조로 인한 삭제 실패 방어).
    // 예약 테이블 미반영(P2021) 환경에서는 건너뛴다.
    try {
      await prisma.reservation.updateMany({
        where: { liveStreamId: body.liveId },
        data: { liveStreamId: null },
      });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
    }
    await prisma.liveChatMessage.deleteMany({ where: { liveStreamId: body.liveId } });
    await prisma.liveStreamProduct.deleteMany({ where: { liveStreamId: body.liveId } });
    await prisma.liveStream.delete({ where: { id: body.liveId } });
    return NextResponse.json({ success: true });
  }

  if (action === "update") {
    const live = await prisma.liveStream.update({
      where: { id: body.liveId },
      data: {
        title: body.title,
        description: body.description,
        thumbnailImage: body.thumbnailImage,
        scheduledAt: body.scheduledAt ? parseKstDateTime(body.scheduledAt) : undefined,
      },
    });
    return NextResponse.json({ live });
  }

  return NextResponse.json({ error: "알 수 없는 액션" }, { status: 400 });
}
