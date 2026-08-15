"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Radio, Play, Square, Users, Bell, X, Loader2, Clock, CheckCircle, MonitorPlay, ChevronDown, Ban, Mic, MicOff, Image as ImageIcon, Hash, Edit3, MoreVertical, GripVertical, Bot, Settings, Palette, Globe, Link, Save, Type, AlignLeft, Gamepad2, Disc3, Network, Ticket, Zap, HelpCircle, BarChart3, Target, Star, ListOrdered, Trophy, Monitor } from 'lucide-react';
import GameFields from "@/components/shared/GameFields";
import { GAME_TYPES, GAME_TYPE_META, GAME_TYPE_GUIDE, defaultConfig, usesItems, usesParticipants, validateGameInput, type GameTypeId } from "@/lib/gameTypes";
import ImageUploader from "@/components/shared/ImageUploader";
import ChatBotManager from "@/components/seller/ChatBotManager";
import HexNumBadge from "@/components/shared/HexNumBadge";
import ScheduledTimePicker from "@/components/shared/ScheduledTimePicker";
import { useAppDialog } from "@/components/shared/AppDialog";
import { useFeatureFlags } from "@/components/shared/FeatureFlagsProvider";
import Pagination, { usePagination } from "@/components/shared/Pagination";

interface LiveStream {
  id: string; title: string; description: string | null; thumbnailImage: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  scheduledAt: string | null; startedAt: string | null; endedAt: string | null;
  vodUrl: string | null; shareCode: string; viewerCount: number; peakViewerCount: number;
  likeCount: number; isVodSaved: boolean; kakaoNotified: boolean;
  showPastInShop?: boolean;
  ytChatForward?: boolean;
  rtmpUrl: string | null; streamKey: string | null;
  platform: "YOUTUBE" | "INSTAGRAM" | "TIKTOK" | null;
  externalUrl: string | null;
  products: any[]; _count: { chatMessages: number; products: number };
}

const PLATFORM_OPTIONS = [
  { id: "YOUTUBE", label: "YouTube", color: "#FF0000", placeholder: "https://youtube.com/live/..." },
  { id: "INSTAGRAM", label: "Instagram", color: "#E4405F", placeholder: "https://instagram.com/..." },
  { id: "TIKTOK", label: "TikTok", color: "#111111", placeholder: "https://tiktok.com/@.../live" },
] as const;

// OBS/PRISM → YouTube 송출용 고정 RTMP 서버 주소 (B방식)
const YOUTUBE_RTMP_URL = "rtmp://a.rtmp.youtube.com/live2";
type PlatformId = (typeof PLATFORM_OPTIONS)[number]["id"];

interface Product {
  id: string; name: string; thumbnail: string | null; basePrice: number;
  comparePrice: number | null; brandName: string | null; categoryName: string | null;
  isOwn?: boolean;
}

interface ChatMsg { id: string; nickname: string; message: string; isManager: boolean; isSystem: boolean; isBot?: boolean; isHidden?: boolean; isYoutube?: boolean; createdAt: string; }

interface LiveProduct {
  id: string;
  productId: string;
  sortOrder: number;
  livePrice: number | null;
  isActive: boolean;
  product: { id: string; name: string; thumbnail: string | null; basePrice: number; comparePrice: number | null; badges: string | null };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; icon: any }> = {
  SCHEDULED: { label: "예정", color: "text-blue-600", bgClass: "bg-blue-50 border-blue-200", icon: Clock },
  LIVE: { label: "라이브", color: "text-red-600", bgClass: "bg-red-50 border-red-200", icon: Radio },
  ENDED: { label: "종료", color: "text-gray-500", bgClass: "bg-gray-50 border-gray-200", icon: CheckCircle },
  CANCELLED: { label: "취소", color: "text-gray-400", bgClass: "bg-gray-50 border-gray-200", icon: X },
};

type PendingCoupon = { code: string; discountType: "PERCENT" | "AMOUNT"; discountValue: string; minOrderAmount: string; validDays: string; maxCount: string };

export default function SellerLivePage() {
  const router = useRouter();
  const { appAlert } = useAppDialog();
  const { liveCommerce: FEATURE_LIVE_COMMERCE } = useFeatureFlags();
  const [lives, setLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showProductManager, setShowProductManager] = useState<string | null>(null);
  const [showChatManager, setShowChatManager] = useState<string | null>(null);
  // OBS/PRISM 송출 설정 모달 (B방식 — YouTube 라이브)
  const [showStreamSetup, setShowStreamSetup] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "vod" | "bot" | "settings">("live");

  // Create form
  const [form, setForm] = useState({
    title: "", description: "", thumbnailImage: "", scheduledAt: "",
    selectedProducts: [] as string[], livePrices: {} as Record<string, string>,
    // 외부 라이브 플랫폼: YouTube / Instagram / TikTok
    platform: null as PlatformId | null,
    externalUrl: "",
    // YouTube 연동 방식: "url" | "channel"
    youtubeMode: "url" as "url" | "channel",
    youtubeChannelInput: "",
    // B방식: OBS/PRISM 송출용 YouTube 스트림 키 (선택 입력)
    youtubeStreamKey: "",
    // New fields: coupons, intro, notices
    couponCode: "", couponDiscount: "",
    liveIntro: "",
    notices: "",
    theme: "default" as string,
    // 점사 예약 방식: 당일 예약 가능 슬롯 수(빈 값 = 무제한) + 방송 중 예약 위젯 표시
    dailySlotLimit: "",
    showReservationWidget: true,
  });

  // YouTube API 상태
  const [youtubeApiEnabled, setYoutubeApiEnabled] = useState<boolean | null>(null);
  const [ytDetecting, setYtDetecting] = useState(false);
  const [ytDetectError, setYtDetectError] = useState("");
  // YouTube OAuth 연결 상태 (B방식 자동 감지·봇 채팅 전송용)
  const [ytOauth, setYtOauth] = useState<{ connected: boolean; channelTitle: string | null } | null>(null);
  // 설명 팝업
  const [showYoutubeHelpA, setShowYoutubeHelpA] = useState(false);
  const [showYoutubeHelpB, setShowYoutubeHelpB] = useState(false);

  // ★ 테마 옵션
  const THEME_OPTIONS = [
    { id: "default", name: "기본", color: "#6366f1", desc: "사주메이트 기본 테마" },
    { id: "modern", name: "모던", color: "#111827", desc: "심플하고 세련된 블랙" },
    { id: "simple", name: "심플", color: "#0ea5e9", desc: "깔끔한 스카이블루" },
    { id: "lovely", name: "러블리", color: "#ec4899", desc: "사랑스러운 핑크" },
    { id: "natural", name: "네추럴", color: "#059669", desc: "자연스러운 그린" },
    { id: "luxury", name: "럭셔리", color: "#7c3aed", desc: "고급스러운 바이올렛" },
  ];
  const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4>(1);
  const [productTab, setProductTab] = useState<"own" | "brick">("own");

  // Product management for live (ordered array with prices)
  const [managingProducts, setManagingProducts] = useState<string[]>([]);
  const [managingPrices, setManagingPrices] = useState<Record<string, string>>({});

  // Chat management
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [managerMsg, setManagerMsg] = useState("");
  const [systemMsg, setSystemMsg] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Expose product (노출 상담상품 관리)
  const [exposedProductId, setExposedProductId] = useState<string | null>(null);
  const [exposingLoading, setExposingLoading] = useState(false);

  // SNS 라이브 연동 노출 여부 (관리자 사이트관리 토글, 기본값 true)
  const [enableSnsLive, setEnableSnsLive] = useState(true);
  // 점집관리 수동 라이브 상태 (충돌 팝업 조건)
  const [shopManualLive, setShopManualLive] = useState(false);

  // 라이브 시작 확인 팝업 (충돌 여부에 따라 안내 문구 변경)
  const [startPrompt, setStartPrompt] = useState<{ liveId: string; conflict: boolean } | null>(null);
  const [startProcessing, setStartProcessing] = useState(false);

  // 알림톡 연동 안됨 경고 모달
  const [alimtalkWarnMsg, setAlimtalkWarnMsg] = useState<string | null>(null);

  // 라이브 쿠폰 관리
  const [showCoupon, setShowCoupon] = useState<string | null>(null);

  // 게임 관리 모달
  const [showGameManager, setShowGameManager] = useState<string | null>(null);

  // 새 라이브 생성 시 pending 쿠폰 목록
  const [pendingCoupons, setPendingCoupons] = useState<PendingCoupon[]>([]);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [couponDraft, setCouponDraft] = useState<PendingCoupon>({ code: "", discountType: "PERCENT", discountValue: "", minOrderAmount: "", validDays: "7", maxCount: "" });

  const fetchLives = useCallback(async () => {
    try {
      const res = await fetch("/api/live");
      const data = await res.json();
      setLives(data.lives || []);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/live/products");
      const data = await res.json();
      setProducts(data.products || []);
    } catch {}
  }, []);

  useEffect(() => { fetchLives(); fetchProducts(); }, [fetchLives, fetchProducts]);

  // SNS 라이브 연동 토글 조회 (관리자 사이트관리). "false"일 때만 외부 플랫폼 섹션 숨김.
  useEffect(() => {
    fetch("/api/admin/site-config?key=enableSnsLive")
      .then(r => r.json())
      .then(d => setEnableSnsLive(d?.value !== "false"))
      .catch(() => {});
  }, []);

  // 점집관리 수동 라이브 상태 조회 (충돌 팝업 조건)
  const fetchShopManualLive = useCallback(() => {
    fetch("/api/seller/shop")
      .then(r => r.json())
      .then(d => setShopManualLive(Boolean(d?.seller?.isManualLive)))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchShopManualLive(); }, [fetchShopManualLive]);

  // 🤖 AI 챗봇 활성 여부 조회 + 라이브 진행 중 봇 엔진 tick 폴링 (20초 간격)
  const [botEnabled, setBotEnabled] = useState(false);
  const fetchBotEnabled = useCallback(() => {
    fetch("/api/seller/chatbot")
      .then(r => r.json())
      .then(d => setBotEnabled(Boolean(d?.config?.enabled)))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchBotEnabled(); }, [fetchBotEnabled]);

  const activeLiveId = lives.find(l => l.status === "LIVE")?.id ?? null;
  useEffect(() => {
    if (!botEnabled || !activeLiveId) return;
    const tick = () => {
      fetch("/api/live/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveId: activeLiveId }),
      }).catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 20000);
    return () => clearInterval(interval);
  }, [botEnabled, activeLiveId]);

  // 진행 중인 YouTube 라이브의 실시간 채팅 수집 트리거 (봇 ON/OFF 무관).
  // 서버가 상담사 API 키로 YouTube 채팅을 폴링해 앱 채팅에 병합 → 방송자/시청자 채팅창에 함께 표시.
  const activeYoutubeLiveId = lives.find(l => l.status === "LIVE" && l.platform === "YOUTUBE" && l.externalUrl)?.id ?? null;
  useEffect(() => {
    if (!activeYoutubeLiveId) return;
    const ping = () => {
      fetch("/api/live/youtube-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liveId: activeYoutubeLiveId }),
      }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 5000);
    return () => clearInterval(interval);
  }, [activeYoutubeLiveId]);

  // 생성 다이얼로그가 닫히면 A/B 방식 선택 상태를 항상 초기화(url)로 되돌린다.
  // openCreate/resetCreate 외 경로로 닫혀도 다음 열람 시 방식이 남지 않도록 보강.
  useEffect(() => {
    if (!showCreate) {
      setForm(prev => ({ ...prev, platform: null, externalUrl: "", youtubeMode: "url", youtubeChannelInput: "", youtubeStreamKey: "" }));
      setYtDetectError("");
    }
  }, [showCreate]);

  // YouTube API 키 설정 여부 체크
  useEffect(() => {
    fetch("/api/youtube/live-check?channelId=_check_only_")
      .then(r => r.json())
      .then(d => setYoutubeApiEnabled(d.error !== "API_KEY_NOT_SET"))
      .catch(() => setYoutubeApiEnabled(false));
  }, []);

  // YouTube OAuth 연결 상태 조회 (B방식 자동 감지용)
  useEffect(() => {
    fetch("/api/auth/youtube/status")
      .then(r => r.json())
      .then(d => setYtOauth({ connected: Boolean(d?.connected), channelTitle: d?.channelTitle ?? null }))
      .catch(() => setYtOauth({ connected: false, channelTitle: null }));
  }, []);

  // OAuth 연결된 상담사: 내 채널의 진행 중인 방송을 클릭 한 번으로 자동 감지 (B방식)
  const handleMyLiveDetect = async () => {
    setYtDetecting(true);
    setYtDetectError("");
    try {
      const res = await fetch("/api/youtube/my-live");
      const data = await res.json();
      if (data.live && data.liveUrl) {
        setForm(prev => ({ ...prev, externalUrl: data.liveUrl }));
        setYtDetectError("");
      } else {
        setYtDetectError("현재 채널에서 진행 중인 방송을 찾지 못했습니다. YouTube에서 방송을 먼저 시작해 주세요.");
      }
    } catch {
      setYtDetectError("감지 중 오류가 발생했습니다.");
    } finally {
      setYtDetecting(false);
    }
  };

  // 방송 상태 동기화 (B방식): LIVE 중인데 외부 URL 이 아직 없는 YouTube 라이브는
  // 주기적으로 내 채널 방송을 확인해 감지되면 자동으로 URL 을 연결한다.
  const pendingYoutubeLiveId = ytOauth?.connected
    ? lives.find(l => l.status === "LIVE" && l.platform === "YOUTUBE" && !l.externalUrl)?.id ?? null
    : null;
  useEffect(() => {
    if (!pendingYoutubeLiveId) return;
    let stopped = false;
    const sync = async () => {
      try {
        const res = await fetch("/api/youtube/my-live");
        const data = await res.json();
        if (!stopped && data.live && data.liveUrl) {
          await fetch("/api/live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_external_url", liveId: pendingYoutubeLiveId, externalUrl: data.liveUrl, platform: "YOUTUBE" }),
          });
          if (!stopped) fetchLives();
        }
      } catch {}
    };
    sync();
    const interval = setInterval(sync, 60000);
    return () => { stopped = true; clearInterval(interval); };
  }, [pendingYoutubeLiveId, fetchLives]);

  const handleYoutubeDetect = async () => {
    const input = form.youtubeChannelInput.trim();
    if (!input) { setYtDetectError("채널 ID 또는 URL을 입력하세요."); return; }
    setYtDetecting(true);
    setYtDetectError("");
    try {
      const params = input.startsWith("http") || input.startsWith("@") || input.startsWith("UC")
        ? `channelUrl=${encodeURIComponent(input)}`
        : `channelId=${encodeURIComponent(input)}`;
      const res = await fetch(`/api/youtube/live-check?${params}`);
      const data = await res.json();
      if (data.liveUrl) {
        setForm(prev => ({ ...prev, externalUrl: data.liveUrl }));
        setYtDetectError("");
      } else {
        setYtDetectError(data.error || "라이브를 찾을 수 없습니다.");
      }
    } catch {
      setYtDetectError("감지 중 오류가 발생했습니다.");
    } finally {
      setYtDetecting(false);
    }
  };

  // 라이브 데이터에서 현재 노출 중인 상담상품 동기화
  useEffect(() => {
    const activeLive = lives.find(l => l.status === "LIVE");
    if (activeLive) {
      const activeP = activeLive.products.find((p: any) => p.isActive);
      if (activeP) {
        setExposedProductId(activeP.product?.id || (activeP as any).productId);
      }
    }
  }, [lives]);

  const fetchChat = useCallback(async (liveId: string) => {
    try {
      const res = await fetch(`/api/live?mode=detail&liveId=${liveId}`);
      const data = await res.json();
      setChatMessages(data.live?.chatMessages || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (showChatManager) {
      fetchChat(showChatManager);
      const interval = setInterval(() => fetchChat(showChatManager), 5000);
      return () => clearInterval(interval);
    }
  }, [showChatManager, fetchChat]);

  // 노출 상담상품 전환
  const handleExposeProduct = async (liveId: string, productId: string) => {
    setExposingLoading(true);
    const isAlreadyExposed = exposedProductId === productId;
    try {
      await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_product", liveId, productId: isAlreadyExposed ? null : productId }),
      });
      setExposedProductId(isAlreadyExposed ? null : productId);
      fetchLives();
    } catch {} finally { setExposingLoading(false); }
  };

  // 지난방송 상담상품노출 스위치 (점집 "지난 방송 상담상품" 영역 노출 on/off)
  const [pastToggleLoading, setPastToggleLoading] = useState<string | null>(null);
  const handleTogglePastInShop = async (liveId: string, show: boolean) => {
    // 낙관적 업데이트
    setLives(prev => prev.map(l => l.id === liveId ? { ...l, showPastInShop: show } : l));
    setPastToggleLoading(liveId);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_past_in_shop", liveId, show }),
      });
      if (!res.ok) throw new Error("저장 실패");
    } catch {
      // 롤백
      setLives(prev => prev.map(l => l.id === liveId ? { ...l, showPastInShop: !show } : l));
    } finally { setPastToggleLoading(null); }
  };

  const handleCreate = async () => {
    if (!form.title) return;
    setCreating(true);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", title: form.title, description: form.description || null,
          thumbnailImage: form.thumbnailImage || null,
          scheduledAt: form.scheduledAt || null,
          platform: form.platform,
          externalUrl: form.externalUrl.trim() || null,
          // B방식: YouTube 라이브일 때만 OBS/PRISM 송출용 스트림 키 전달
          streamKey: form.platform === "YOUTUBE" ? form.youtubeStreamKey.trim() || null : undefined,
          productIds: form.selectedProducts, livePrices: form.livePrices,
          // 점사 예약 방식 설정
          dailySlotLimit: form.dailySlotLimit.trim() || null,
          showReservationWidget: form.showReservationWidget,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const liveId = data?.live?.id || data?.id;
        // pending 쿠폰 일괄 생성
        if (liveId && pendingCoupons.length > 0) {
          for (const coupon of pendingCoupons) {
            await fetch(`/api/seller/live/${liveId}/coupon`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: coupon.code.trim() || undefined,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minOrderAmount: coupon.minOrderAmount || undefined,
                validDays: coupon.validDays || undefined,
                maxCount: coupon.maxCount || undefined,
              }),
            }).catch(() => {});
          }
        }
        resetCreate();
        fetchLives();
      }
    } catch {} finally { setCreating(false); }
  };

  const handleUpdateExternalUrl = async (liveId: string, externalUrl: string) => {
    try {
      // URL 패턴으로 platform 자동 감지 (platform 없는 라이브에 URL 추가 시에도 embed 동작)
      let platform: string | null = null;
      const trimmed = externalUrl.trim();
      if (trimmed) {
        if (/youtube\.com|youtu\.be/i.test(trimmed)) platform = "YOUTUBE";
        else if (/instagram\.com/i.test(trimmed)) platform = "INSTAGRAM";
        else if (/tiktok\.com/i.test(trimmed)) platform = "TIKTOK";
      }
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_external_url", liveId, externalUrl, platform }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        appAlert({ message: data?.error || "URL 저장에 실패했습니다.", type: "warning" });
        return false;
      }
      fetchLives();
      appAlert({ message: "외부 라이브 URL이 저장되었습니다.", type: "success" });
      return true;
    } catch {
      appAlert({ message: "URL 저장 중 오류가 발생했습니다.", type: "warning" });
      return false;
    }
  };

  const handleAction = async (action: string, liveId: string, extra?: any) => {
    setActionLoading(liveId);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, liveId, ...extra }),
      });
      if (action === "kakao_notify") {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          appAlert({ message: data.message || "알림톡 발송 완료", type: "success" });
          fetchLives();
        } else {
          setAlimtalkWarnMsg(data.message || "알림톡 발송 처리 결과를 확인할 수 없습니다.");
        }
        return;
      }
      if (res.ok) {
        if (action === "start") {
          const data = await res.json().catch(() => ({}));
          const n = data?.notify;
          if (n?.notified) appAlert({ message: `알림톡 발송 요청 완료 (접수 ${n.successCount}/${n.attempted}건)`, type: "success" });
          else if (n?.reason && n.reason !== "이미 발송됨") setAlimtalkWarnMsg(`알림톡이 연동되지 않아 알림톡 발송이 안됩니다.\n(${n.reason})`);
        }
        // 방송 종료 → 이 방송의 예약 목록 확인 화면으로 자동 이동
        if (action === "end") {
          router.push(`/seller/reservations?live=${liveId}`);
          return;
        }
        fetchLives();
      }
    } catch {} finally { setActionLoading(null); }
  };

  // 라이브 시작 요청 — 충돌(진행 중 라이브 or 수동 라이브 ON) 여부를 확인하고 팝업을 띄운다.
  const requestStart = (liveId: string) => {
    const conflict = lives.some(l => l.status === "LIVE") || shopManualLive;
    setStartPrompt({ liveId, conflict });
  };

  // 팝업에서 "라이브 시작" 확정
  const confirmStart = async () => {
    if (!startPrompt || startProcessing) return;
    const { liveId, conflict } = startPrompt;
    setStartProcessing(true);
    try {
      if (conflict) {
        // 진행 중이던 라이브 자동 종료
        const runningLives = lives.filter(l => l.status === "LIVE" && l.id !== liveId);
        for (const l of runningLives) {
          await fetch("/api/live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end", liveId: l.id }),
          }).catch(() => {});
        }
        // 점집관리 수동 라이브 OFF
        if (shopManualLive) {
          await fetch("/api/seller/shop", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isManualLive: false }),
          }).catch(() => {});
          setShopManualLive(false);
        }
      }
      // 새 라이브 시작
      await handleAction("start", liveId);
      fetchShopManualLive();
    } finally {
      setStartProcessing(false);
      setStartPrompt(null);
    }
  };

  const handleProductUpdate = async (liveId: string) => {
    setActionLoading(liveId);
    try {
      await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_products", liveId, productIds: managingProducts, livePrices: managingPrices }),
      });
      setShowProductManager(null);
      fetchLives();
    } catch {} finally { setActionLoading(null); }
  };

  const sendManagerChat = async (liveId: string, isSystem = false) => {
    const msg = isSystem ? systemMsg : managerMsg;
    if (!msg.trim()) return;
    try {
      await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", liveId, message: msg, nickname: isSystem ? "공지사항" : "매니저", isManager: !isSystem, isSystem }),
      });
      if (isSystem) setSystemMsg(""); else setManagerMsg("");
      fetchChat(liveId);
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    appAlert({ message: "복사되었습니다!", type: "success" });
  };

  const resetCreate = () => {
    setShowCreate(false);
    setCreateStep(1);
    setForm({ title: "", description: "", thumbnailImage: "", scheduledAt: "", selectedProducts: [], livePrices: {}, platform: null, externalUrl: "", youtubeMode: "url", youtubeChannelInput: "", youtubeStreamKey: "", couponCode: "", couponDiscount: "", liveIntro: "", notices: "", theme: "default", dailySlotLimit: "", showReservationWidget: true });
    setYtDetectError("");
    setPendingCoupons([]);
    setShowCouponForm(false);
    setCouponDraft({ code: "", discountType: "PERCENT", discountValue: "", minOrderAmount: "", validDays: "7", maxCount: "" });
  };

  // 라이브 생성 다이얼로그 열기 — 항상 초기 상태(플랫폼/방식 A·B 선택 포함)로 리셋 후 오픈.
  // 이전 라이브에서 고른 platform/youtubeMode가 다음 생성에 남아 강제 선택되지 않도록 함.
  const openCreate = () => {
    setCreateStep(1);
    setForm({ title: "", description: "", thumbnailImage: "", scheduledAt: "", selectedProducts: [], livePrices: {}, platform: null, externalUrl: "", youtubeMode: "url", youtubeChannelInput: "", youtubeStreamKey: "", couponCode: "", couponDiscount: "", liveIntro: "", notices: "", theme: "default", dailySlotLimit: "", showReservationWidget: true });
    setYtDetectError("");
    setPendingCoupons([]);
    setShowCouponForm(false);
    setCouponDraft({ code: "", discountType: "PERCENT", discountValue: "", minOrderAmount: "", validDays: "7", maxCount: "" });
    setShowCreate(true);
  };

  // ★ 상담상품 순서 이동 헬퍼 (create form)
  const moveProduct = (list: string[], idx: number, dir: -1 | 1): string[] => {
    const newList = [...list];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= newList.length) return newList;
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    return newList;
  };

  const activeLives = lives.filter(l => l.status === "LIVE");
  const scheduledLives = lives.filter(l => l.status === "SCHEDULED");
  const endedLives = lives.filter(l => ["ENDED", "CANCELLED"].includes(l.status));
  // 라이브 목록 페이지네이션 (페이지당 20개)
  const activeLivesPg = usePagination(activeLives, 20);
  const scheduledLivesPg = usePagination(scheduledLives, 20);
  const endedLivesPg = usePagination(endedLives, 20);
  const detailLive = showDetail ? lives.find(l => l.id === showDetail) : null;
  const streamSetupLive = showStreamSetup ? lives.find(l => l.id === showStreamSetup) : null;
  const liveCount = activeLives.length + scheduledLives.length;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-page-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="dashboard-icon-tile bg-red-50 text-red-500 ring-red-100"><Icon name="Live" size={19} /></span>
          <div>
          <h1 className="text-xl font-bold text-brand-950">라이브 상담</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">방송과 실시간 상담을 관리합니다 · 전체 {lives.length}개 · 진행/예정 {liveCount}개</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-1.5 !px-4 !py-2.5">
          <Icon name="Plus" size={16} /> 새 라이브
        </button>
      </div>

      {/* Tab: Live / VOD / AI Bot / Site Settings */}
      <div className="flex gap-1.5 bg-brand-50/70 p-1.5 rounded-2xl overflow-x-auto no-scrollbar border border-brand-100">
        <button onClick={() => setActiveTab("live")} className={`flex-1 flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === "live" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"}`}>
          <Radio size={14} className="flex-shrink-0" /> 라이브/예정 ({activeLives.length + scheduledLives.length})
        </button>
        <button onClick={() => setActiveTab("vod")} className={`flex-1 flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === "vod" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"}`}>
          <Clock size={14} className="flex-shrink-0" /> 지난 방송 ({endedLives.length})
        </button>
        <button onClick={() => setActiveTab("bot")} className={`flex-1 flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === "bot" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"}`}>
          <Bot size={14} className="flex-shrink-0" /> 유튜브AI챗봇
          {botEnabled && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse flex-shrink-0" />}
        </button>
        <button onClick={() => setActiveTab("settings")} className={`flex-1 flex-shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5 ${activeTab === "settings" ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"}`}>
          <Settings size={14} className="flex-shrink-0" /> 라이브 사이트 설정
        </button>
      </div>

      {activeTab === "settings" ? (
        <LiveSiteSettingsPanel />
      ) : activeTab === "bot" ? (
        <ChatBotManager onConfigSaved={fetchBotEnabled} />
      ) : loading ? (
        <div className="text-center py-20"><Loader2 size={24} className="animate-spin mx-auto text-gray-300" /></div>
      ) : lives.length === 0 ? (
        <EmptyState onCreateClick={openCreate} />
      ) : (
        <div className="space-y-4">
          {activeTab === "live" ? (
            <>
              {activeLives.length > 0 && (
                <Section title="진행 중" badge={<span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}>
                  {activeLivesPg.pageItems.map(live => (
                    <LiveCard key={live.id} live={live} onAction={handleAction} actionLoading={actionLoading}
                      onDetail={() => {
                        setShowDetail(live.id);
                        // 현재 노출 중인 상담상품 찾기
                        const activeP = live.products.find((p: any) => p.isActive);
                        setExposedProductId(activeP ? (activeP.product?.id || activeP.productId) : null);
                      }}
                      onProductManage={() => {
                        setShowProductManager(live.id);
                        const orderedIds = live.products
                          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .map((p: any) => p.product?.id || p.productId);
                        setManagingProducts(orderedIds);
                        setManagingPrices(Object.fromEntries(live.products.filter((p: any) => p.livePrice).map((p: any) => [p.product?.id || p.productId, String(p.livePrice)])));
                      }}
                      onChatManage={() => setShowChatManager(live.id)}
                      onGameManage={() => setShowGameManager(live.id)}
                      onCouponManage={() => setShowCoupon(live.id)}
                      onExposeProduct={handleExposeProduct}
                      exposedProductId={exposedProductId}
                      exposingLoading={exposingLoading}
                      onUpdateExternalUrl={handleUpdateExternalUrl}
                      onStreamSetup={() => setShowStreamSetup(live.id)}
                      copyToClipboard={copyToClipboard} />
                  ))}
                  <Pagination currentPage={activeLivesPg.page} totalPages={activeLivesPg.totalPages} onPageChange={activeLivesPg.setPage} />
                </Section>
              )}
              {scheduledLives.length > 0 && (
                <Section title={`예정 (${scheduledLives.length})`}>
                  {scheduledLivesPg.pageItems.map(live => (
                    <LiveCard key={live.id} live={live} onAction={handleAction} actionLoading={actionLoading}
                      onDetail={() => {
                        setShowDetail(live.id);
                        setExposedProductId(null);
                      }}
                      onProductManage={() => {
                        setShowProductManager(live.id);
                        const orderedIds = live.products
                          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .map((p: any) => p.product?.id || p.productId);
                        setManagingProducts(orderedIds);
                        setManagingPrices(Object.fromEntries(live.products.filter((p: any) => p.livePrice).map((p: any) => [p.product?.id || p.productId, String(p.livePrice)])));
                      }}
                      onStart={() => requestStart(live.id)}
                      onUpdateExternalUrl={handleUpdateExternalUrl}
                      onStreamSetup={() => setShowStreamSetup(live.id)}
                      copyToClipboard={copyToClipboard} />
                  ))}
                  <Pagination currentPage={scheduledLivesPg.page} totalPages={scheduledLivesPg.totalPages} onPageChange={scheduledLivesPg.setPage} />
                </Section>
              )}
              {activeLives.length === 0 && scheduledLives.length === 0 && (
                <div className="dashboard-empty dashboard-panel">
                  <Icon name="Live" size={40} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-500">진행 중이거나 예정된 라이브가 없습니다.</p>
                  <button onClick={openCreate} className="mt-3 text-sm text-brand-600 font-medium">+ 새 라이브 만들기</button>
                </div>
              )}
            </>
          ) : (
            <>
              {endedLives.length > 0 ? (
                <div className="space-y-3">
                  {endedLivesPg.pageItems.map(live => (
                    <LiveCard key={live.id} live={live} onAction={handleAction} actionLoading={actionLoading}
                      onDetail={() => setShowDetail(live.id)} copyToClipboard={copyToClipboard}
                      onTogglePastInShop={handleTogglePastInShop}
                      pastToggleLoading={pastToggleLoading === live.id} />
                  ))}
                  <Pagination currentPage={endedLivesPg.page} totalPages={endedLivesPg.totalPages} onPageChange={endedLivesPg.setPage} />
                </div>
              ) : (
                <div className="dashboard-empty dashboard-panel">
                  <MonitorPlay size={40} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-500">아직 지난 방송이 없습니다.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ YouTube 방식 A 설명 팝업 ============ */}
      {showYoutubeHelpA && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white border border-amber-300 flex items-center justify-center flex-shrink-0">
                  <Icon name="ProductVideo_icon" size={18} />
                </div>
                <div>
                  <p className="text-xs font-black text-amber-700">방식 A</p>
                  <p className="text-sm font-bold text-gray-900">URL 직접 입력 방식</p>
                </div>
              </div>
              <button onClick={() => setShowYoutubeHelpA(false)} className="w-7 h-7 rounded-full hover:bg-amber-100 flex items-center justify-center text-gray-400">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-gray-600 leading-relaxed">
                유튜브에서 라이브 방송 시작 후 URL을 복사해서 붙여넣는 방식입니다.
              </p>
              <div className="space-y-2.5">
                {[
                  { n: 1, text: "유튜브 스튜디오(studio.youtube.com)에서 라이브 방송 시작" },
                  { n: 2, text: "방송 중인 유튜브 URL 복사\n(예: youtube.com/watch?v=xxxx 또는 youtu.be/xxxx)" },
                  { n: 3, text: "사주메이트 라이브 생성 → URL 입력란에 붙여넣기" },
                  { n: 4, text: "라이브 시작 클릭" },
                ].map(s => (
                  <div key={s.n} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</span>
                    <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">{s.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Icon name="Warning" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 leading-relaxed">라이브 방송이 먼저 유튜브에서 시작된 후 URL을 입력해야 시청자에게 바로 표시됩니다.</p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setShowYoutubeHelpA(false)} className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ YouTube 방식 B 설명 팝업 ============ */}
      {showYoutubeHelpB && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white border border-amber-300 flex items-center justify-center flex-shrink-0">
                  <Icon name="SnsFeed_icon" size={18} />
                </div>
                <div>
                  <p className="text-xs font-black text-amber-700">방식 B</p>
                  <p className="text-sm font-bold text-gray-900">채널 자동 감지 방식</p>
                </div>
              </div>
              <button onClick={() => setShowYoutubeHelpB(false)} className="w-7 h-7 rounded-full hover:bg-amber-100 flex items-center justify-center text-gray-400">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-gray-600 leading-relaxed">
                유튜브 채널 ID를 등록하면 현재 라이브 중인 영상을 자동으로 감지하는 방식입니다.
              </p>
              <div className="space-y-2.5">
                {[
                  { n: 1, text: "유튜브 채널 URL 또는 채널 ID 확인\n(유튜브 채널 페이지 → 더보기 → 채널 정보)" },
                  { n: 2, text: "사주메이트 라이브 생성 → 채널 ID/URL 입력" },
                  { n: 3, text: "'라이브 자동 감지' 버튼 클릭 → 현재 라이브 중인 영상 자동 세팅" },
                  { n: 4, text: "라이브 시작 클릭" },
                ].map(s => (
                  <div key={s.n} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-amber-400 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</span>
                    <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">{s.text}</p>
                  </div>
                ))}
              </div>
              {youtubeApiEnabled === false ? (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <Icon name="Warning" size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-700 leading-relaxed">현재 자동 감지 기능을 사용할 수 없습니다. 관리자에게 문의하세요.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Icon name="Warning" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">YouTube API 키가 관리자에 의해 설정되어 있어야 합니다. 라이브 방송이 유튜브에서 먼저 시작되어야 자동 감지됩니다.</p>
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setShowYoutubeHelpB(false)} className="w-full py-2.5 bg-amber-400 text-white text-sm font-bold rounded-xl hover:bg-amber-500">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Create Live Modal (Step-based) ============ */}
      {showCreate && (
        <Modal title="새 라이브 생성" onClose={resetCreate}>
          {/* Step Indicator */}
          <div className="flex items-center gap-0 px-5 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
            {[
              { n: 1, label: "기본 정보·예약 설정" },
              { n: 2, label: "예약 상담 상품" },
              { n: 3, label: "혜택·공지" },
              { n: 4, label: "확인" },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${createStep >= s.n ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-400"}`}>
                  <span className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold">{s.n}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-px mx-1.5 ${createStep > s.n ? "bg-brand-400" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>

          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {createStep === 1 && (
              <>
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="ProductName_icon" size={14} /> 라이브 제목 <span className="text-red-500">*</span></label>
                  <input type="text" className="input-field mt-1.5" placeholder="예: 오늘의 사주·타로 실시간 상담" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="ShortDescription_icon" size={14} /> 설명</label>
                  <textarea className="input-field mt-1.5 h-20 resize-none" placeholder="예: 오늘 방송에서 받을 상담 종류와 특이사항을 적어주세요" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                {/* 썸네일 이미지 — 인앱 라이브 시스템 복원 시(FEATURE_LIVE_COMMERCE=true) 자동 노출 */}
                {FEATURE_LIVE_COMMERCE && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="ProductThumbnail_icon" size={14} /> 썸네일 이미지</label>
                    <div className="mt-1.5">
                      <ImageUploader images={form.thumbnailImage ? [form.thumbnailImage] : []} onChange={urls => setForm({ ...form, thumbnailImage: urls[0] || "" })} maxImages={1} compact />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="Calendar" size={12} /> 예정 시간</label>
                  <ScheduledTimePicker value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} />
                </div>

                {/* ★ 점사 예약 설정 — 방송 중 시청자 예약 접수 방식 */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-3">
                  <p className="text-xs font-bold text-amber-800 flex items-center gap-1">
                    <Icon name="Calendar" size={13} /> 점사 예약 설정
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-700">오늘 받을 상담 수</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field mt-1 text-sm py-2"
                      placeholder="비워두면 무제한 (열어둔 예약 가능 시간 내에서)"
                      value={form.dailySlotLimit}
                      onChange={e => setForm({ ...form, dailySlotLimit: e.target.value })}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">이 방송을 통해 당일 접수 가능한 예약 건수를 제한합니다.</p>
                  </div>
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-[11px] font-semibold text-gray-700">
                      방송 중 예약 위젯(예약 현황) 표시
                      <span className="block text-[10px] font-normal text-gray-400 mt-0.5">
                        OBS 오버레이 위젯 URL은 <a href="/seller/widget" target="_blank" className="text-amber-600 underline">위젯 설정</a>에서 복사할 수 있어요.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.showReservationWidget}
                      onChange={e => setForm({ ...form, showReservationWidget: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 flex-shrink-0"
                    />
                  </label>
                </div>
                {/* ★ 외부 라이브 플랫폼 선택 + URL — 관리자 SNS 라이브 연동 토글이 꺼지면 숨김 */}
                {enableSnsLive && (
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <Icon name="SnsLiveStream_icon" size={14} /> 외부 라이브 플랫폼
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1">선택하면 점집 프로필의 LIVE 뱃지가 이 URL로 연결됩니다.</p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {PLATFORM_OPTIONS.map(p => {
                      const selected = form.platform === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setForm({ ...form, platform: selected ? null : p.id, externalUrl: "", youtubeMode: "url", youtubeChannelInput: "", youtubeStreamKey: "", })}
                          className={`p-2.5 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                            selected ? "shadow-sm" : "border-gray-200 hover:border-gray-300"
                          }`}
                          style={selected ? { borderColor: p.color, backgroundColor: `${p.color}10` } : {}}
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-[11px] font-bold text-gray-800">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* YouTube 선택 시: 방식 A / B */}
                  {form.platform === "YOUTUBE" && (
                    <div className="mt-3 space-y-2">
                      {/* 방식 선택 탭 */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setForm(prev => ({ ...prev, youtubeMode: "url", externalUrl: "", youtubeChannelInput: "" })); setYtDetectError(""); }}
                          className={`flex-1 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                            form.youtubeMode === "url"
                              ? "border-[#FF0000] bg-red-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon name="LinkShorten_icon" size={14} className={form.youtubeMode === "url" ? "" : "opacity-40 grayscale"} />
                            <span className={`text-[11px] font-bold ${form.youtubeMode === "url" ? "text-[#FF0000]" : "text-gray-500"}`}>방식 A: URL 직접 입력</span>
                          </div>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setShowYoutubeHelpA(true); }}
                            className="text-gray-400 hover:text-amber-500 transition-colors flex-shrink-0"
                            title="설명 보기"
                          >
                            <Icon name="Help" size={13} />
                          </button>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForm(prev => ({ ...prev, youtubeMode: "channel", externalUrl: "" })); setYtDetectError(""); }}
                          className={`flex-1 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl border-2 text-left transition-all ${
                            form.youtubeMode === "channel"
                              ? "border-amber-400 bg-amber-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon name="SnsFeed_icon" size={14} className={form.youtubeMode === "channel" ? "" : "opacity-40 grayscale"} />
                            <span className={`text-[11px] font-bold ${form.youtubeMode === "channel" ? "text-amber-600" : "text-gray-500"}`}>방식 B: 채널 자동 감지</span>
                          </div>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setShowYoutubeHelpB(true); }}
                            className="text-gray-400 hover:text-amber-500 transition-colors flex-shrink-0"
                            title="설명 보기"
                          >
                            <Icon name="Help" size={13} />
                          </button>
                        </button>
                      </div>

                      {/* 방식 A: URL 직접 입력 */}
                      {form.youtubeMode === "url" && (
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                            <Icon name="Info" size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700 leading-relaxed">
                              진행 중인 유튜브 라이브 URL을 입력하세요. (예: https://www.youtube.com/watch?v=VIDEO_ID) 시청 페이지에서 유튜브 방송이 직접 임베드됩니다.
                            </p>
                          </div>
                          <input
                            type="url"
                            className="input-field text-sm"
                            placeholder="https://youtube.com/watch?v=... 또는 youtu.be/..."
                            value={form.externalUrl}
                            onChange={e => setForm({ ...form, externalUrl: e.target.value })}
                          />
                          {form.externalUrl && (
                            <p className="text-[11px] text-green-600 flex items-center gap-1">
                              <Icon name="Check" size={11} /> 시청 페이지에서 유튜브 영상이 바로 재생됩니다.
                            </p>
                          )}
                        </div>
                      )}

                      {/* 방식 B: 채널 자동 감지 */}
                      {form.youtubeMode === "channel" && (
                        <div className="space-y-2">
                          {ytOauth?.connected ? (
                            <>
                              {/* OAuth 연결됨: 채널 입력 없이 내 방송 자동 감지 */}
                              <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                                <Icon name="YouTube_icon" size={15} className="flex-shrink-0" />
                                <p className="flex-1 text-[11px] text-gray-700 truncate">
                                  <b>{ytOauth.channelTitle || "내 YouTube 채널"}</b> 연결됨 — 진행 중인 방송을 자동으로 가져옵니다.
                                </p>
                                <button
                                  type="button"
                                  onClick={handleMyLiveDetect}
                                  disabled={ytDetecting}
                                  className="px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
                                >
                                  {ytDetecting ? <Loader2 size={12} className="animate-spin" /> : <Icon name="Search" size={12} />}
                                  {ytDetecting ? "감지 중" : "내 방송 감지"}
                                </button>
                              </div>
                              {ytDetectError && (
                                <>
                                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                                    <Icon name="Warning" size={11} /> {ytDetectError}
                                  </p>
                                  <input
                                    type="url"
                                    className="input-field text-sm"
                                    placeholder="또는 YouTube 라이브 URL을 직접 입력하세요"
                                    value={form.externalUrl}
                                    onChange={e => { setForm({ ...form, externalUrl: e.target.value }); setYtDetectError(""); }}
                                  />
                                </>
                              )}
                              {form.externalUrl && !ytDetectError && (
                                <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                                  <Icon name="Check" size={13} className="text-green-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-green-600 font-bold">라이브 감지 완료!</p>
                                    <p className="text-[10px] text-green-700 truncate">{form.externalUrl}</p>
                                  </div>
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, externalUrl: "" }))} className="text-gray-400 hover:text-gray-600">
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                              {!form.externalUrl && !ytDetectError && (
                                <p className="text-[10px] text-gray-400 leading-relaxed">
                                  지금 방송 전이라면 비워 두세요. 라이브 시작 후 YouTube 방송이 감지되면 자동으로 연결됩니다.
                                </p>
                              )}
                            </>
                          ) : youtubeApiEnabled === false ? (
                            <>
                              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                                <Icon name="Warning" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-700">자동 감지 기능을 사용할 수 없습니다. YouTube 라이브 URL을 직접 입력하세요.</p>
                              </div>
                              <input
                                type="url"
                                className="input-field text-sm"
                                placeholder="https://youtube.com/watch?v=... 또는 youtu.be/..."
                                value={form.externalUrl}
                                onChange={e => setForm({ ...form, externalUrl: e.target.value })}
                              />
                            </>
                          ) : (
                            <>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  className="input-field text-sm flex-1"
                                  placeholder="채널 URL 또는 채널 ID (예: @내채널 / UCxxx...)"
                                  value={form.youtubeChannelInput}
                                  onChange={e => { setForm({ ...form, youtubeChannelInput: e.target.value }); setYtDetectError(""); }}
                                />
                                <button
                                  type="button"
                                  onClick={handleYoutubeDetect}
                                  disabled={ytDetecting || !form.youtubeChannelInput.trim()}
                                  className="px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
                                >
                                  {ytDetecting ? <Loader2 size={12} className="animate-spin" /> : <Icon name="Search" size={12} />}
                                  {ytDetecting ? "감지 중" : "자동 감지"}
                                </button>
                              </div>
                              {ytDetectError && (
                                <>
                                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                                    <Icon name="Warning" size={11} /> {ytDetectError}
                                  </p>
                                  {/* 자동감지 실패 시 URL 직접 입력 폼 표시 */}
                                  <input
                                    type="url"
                                    className="input-field text-sm"
                                    placeholder="또는 YouTube 라이브 URL을 직접 입력하세요"
                                    value={form.externalUrl}
                                    onChange={e => { setForm({ ...form, externalUrl: e.target.value }); setYtDetectError(""); }}
                                  />
                                </>
                              )}
                              {form.externalUrl && !ytDetectError && (
                                <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-xl">
                                  <Icon name="Check" size={13} className="text-green-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-green-600 font-bold">라이브 감지 완료!</p>
                                    <p className="text-[10px] text-green-700 truncate">{form.externalUrl}</p>
                                  </div>
                                  <button type="button" onClick={() => setForm(prev => ({ ...prev, externalUrl: "" }))} className="text-gray-400 hover:text-gray-600">
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}

                          {ytOauth && !ytOauth.connected && (
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                              AI 봇 탭에서 <b>YouTube 채널 연결</b>을 하면 채널 입력 없이 내 방송을 자동 감지하고, 라이브 시작 후 방송 상태도 자동 동기화됩니다.
                            </p>
                          )}

                          {/* B방식: OBS/PRISM 송출용 YouTube 스트림 키 (선택) */}
                          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
                            <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                              <Icon name="StreamKey_icon" size={14} /> YouTube 스트림 키 (선택)
                            </p>
                            <p className="text-[10px] text-amber-700/80 leading-relaxed">
                              OBS·PRISM으로 송출하는 경우 YouTube 스튜디오의 스트림 키를 입력해 두면
                              라이브 생성 후 <b>송출 설정</b>에서 RTMP 주소와 함께 바로 확인·복사할 수 있습니다.
                            </p>
                            <input
                              type="text"
                              className="input-field text-sm font-mono"
                              placeholder="예: abcd-efgh-ijkl-mnop-qrst"
                              value={form.youtubeStreamKey}
                              onChange={e => setForm({ ...form, youtubeStreamKey: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 비 YouTube 플랫폼: 기존 URL 입력 */}
                  {form.platform && form.platform !== "YOUTUBE" && (
                    <input
                      type="url"
                      className="input-field mt-2 text-sm"
                      placeholder={PLATFORM_OPTIONS.find(p => p.id === form.platform)?.placeholder || "라이브 URL"}
                      value={form.externalUrl}
                      onChange={e => setForm({ ...form, externalUrl: e.target.value })}
                    />
                  )}
                </div>
                )}
                {/* ★ 테마 선택 */}
                <div>
                  <label className="text-xs font-bold text-gray-700 mb-2 block">라이브 테마</label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_OPTIONS.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm({ ...form, theme: t.id })}
                        className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                          form.theme === t.id
                            ? "border-current shadow-md"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        style={form.theme === t.id ? { borderColor: t.color } : {}}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-[11px] font-bold text-gray-800">{t.name}</span>
                        </div>
                        <p className="text-[9px] text-gray-400">{t.desc}</p>
                        {form.theme === t.id && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-white flex items-center justify-center text-[8px]" style={{ backgroundColor: t.color }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {createStep === 2 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">라이브에서 판매할 상담상품을 선택하고 순서와 특가를 설정하세요.</p>
                  <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-lg">
                    <Hash size={10} className="inline mr-0.5" />{form.selectedProducts.length}개 선택
                  </span>
                </div>

                {/* ★ 선택된 상담상품 순서 관리 영역 */}
                {form.selectedProducts.length > 0 && (
                  <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
                    <p className="text-[10px] font-bold text-brand-700 mb-2 flex items-center gap-1">
                      <GripVertical size={10} /> 상담상품 순서 (번호 = 방송 중 표시 번호)
                    </p>
                    <div className="space-y-1.5">
                      {form.selectedProducts.map((pid, idx) => {
                        const p = products.find(pp => pp.id === pid);
                        if (!p) return null;
                        return (
                          <div key={pid} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-brand-200/50">
                            <HexNumBadge size={24} className="flex-shrink-0">
                              {idx + 1}
                            </HexNumBadge>
                            {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                            <span className="text-[11px] font-medium text-gray-800 truncate flex-1">{p.name}</span>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, selectedProducts: moveProduct(form.selectedProducts, idx, -1) })}
                                disabled={idx === 0}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 rounded"
                              >
                                <Icon name="ArrowRight" size={12} className="-rotate-90" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, selectedProducts: moveProduct(form.selectedProducts, idx, 1) })}
                                disabled={idx === form.selectedProducts.length - 1}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 rounded"
                              >
                                <Icon name="ArrowRight" size={12} className="rotate-90" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, selectedProducts: form.selectedProducts.filter(id => id !== pid) })}
                                className="p-1 text-red-400 hover:text-red-600 rounded ml-0.5"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 상담상품 탭 (내 상담상품 / 사주메이트 상담상품) */}
                {(() => {
                  const ownCount = products.filter(p => p.isOwn).length;
                  const brickCount = products.length - ownCount;
                  return (
                    <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
                      <button
                        type="button"
                        onClick={() => setProductTab("own")}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${productTab === "own" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        내 상담상품 <span className="text-[10px] text-gray-400">({ownCount})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductTab("brick")}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${productTab === "brick" ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        사주메이트 상담상품 <span className="text-[10px] text-gray-400">({brickCount})</span>
                      </button>
                    </div>
                  );
                })()}

                {/* 상담상품 목록 (선택/해제) */}
                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-100 rounded-xl p-2">
                  {(() => {
                    const filtered = products.filter(p => (productTab === "own" ? p.isOwn : !p.isOwn));
                    if (filtered.length === 0) {
                      return (
                        <p className="text-xs text-gray-400 text-center py-8">
                          {productTab === "own"
                            ? "직접 등록한 상담상품이 없습니다. 상담상품관리에서 등록해주세요."
                            : "점집에 추가한 사주메이트 상담상품이 없습니다. 상담상품관리에서 추가해주세요."}
                        </p>
                      );
                    }
                    return filtered.map(p => {
                    const isSelected = form.selectedProducts.includes(p.id);
                    const selectedIdx = form.selectedProducts.indexOf(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? "bg-brand-50 border border-brand-200" : "hover:bg-gray-50 border border-transparent"}`}>
                        <input type="checkbox" checked={isSelected} onChange={e => {
                          if (e.target.checked) setForm({ ...form, selectedProducts: [...form.selectedProducts, p.id] });
                          else setForm({ ...form, selectedProducts: form.selectedProducts.filter(id => id !== p.id) });
                        }} className="accent-brand-600 w-4 h-4" />
                        {isSelected && (
                          <HexNumBadge size={20} fontSize={9} className="flex-shrink-0">
                            {selectedIdx + 1}
                          </HexNumBadge>
                        )}
                        {p.thumbnail && <img src={p.thumbnail} alt={p.name} className="w-12 h-12 rounded-lg object-cover" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.basePrice.toLocaleString()}원</p>
                        </div>
                      </label>
                    );
                    });
                  })()}
                </div>
              </>
            )}
            {createStep === 3 && (
              <>
                {/* Coupons */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="Tag" size={12} /> 라이브 쿠폰</label>
                    <button
                      type="button"
                      onClick={() => setShowCouponForm(v => !v)}
                      className="text-[11px] px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 flex items-center gap-1"
                    >
                      <Icon name="Plus" size={11} /> 쿠폰 추가
                    </button>
                  </div>

                  {/* 쿠폰 입력 폼 */}
                  {showCouponForm && (
                    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-2.5 mb-2">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-600">쿠폰 코드</label>
                        <input
                          type="text"
                          className="input-field text-sm mt-1 uppercase"
                          placeholder="비워두면 자동 생성"
                          value={couponDraft.code}
                          onChange={e => setCouponDraft(d => ({ ...d, code: e.target.value.toUpperCase() }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">할인 유형</label>
                          <div className="flex gap-1.5 mt-1">
                            {([["PERCENT", "정률(%)"], ["AMOUNT", "정액(원)"]] as const).map(([val, label]) => (
                              <button key={val} type="button"
                                onClick={() => setCouponDraft(d => ({ ...d, discountType: val }))}
                                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all ${couponDraft.discountType === val ? "border-amber-400 bg-amber-100 text-amber-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                              >{label}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">할인 값</label>
                          <input type="number" className="input-field text-sm mt-1"
                            placeholder={couponDraft.discountType === "PERCENT" ? "예: 10" : "예: 5000"}
                            value={couponDraft.discountValue}
                            onChange={e => setCouponDraft(d => ({ ...d, discountValue: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">최소 구매 금액</label>
                          <input type="number" className="input-field text-sm mt-1" placeholder="0 (제한 없음)"
                            value={couponDraft.minOrderAmount}
                            onChange={e => setCouponDraft(d => ({ ...d, minOrderAmount: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-gray-600">발급 수량 제한</label>
                          <input type="number" className="input-field text-sm mt-1" placeholder="무제한"
                            value={couponDraft.maxCount}
                            onChange={e => setCouponDraft(d => ({ ...d, maxCount: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">라이브 종료 후</span>
                        <input type="number" className="input-field text-sm w-16"
                          value={couponDraft.validDays}
                          onChange={e => setCouponDraft(d => ({ ...d, validDays: e.target.value }))}
                        />
                        <span className="text-[11px] text-gray-500">일간 유효</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!couponDraft.discountValue || Number(couponDraft.discountValue) <= 0) return;
                            setPendingCoupons(prev => [...prev, { ...couponDraft }]);
                            setCouponDraft({ code: "", discountType: "PERCENT", discountValue: "", minOrderAmount: "", validDays: "7", maxCount: "" });
                            setShowCouponForm(false);
                          }}
                          disabled={!couponDraft.discountValue || Number(couponDraft.discountValue) <= 0}
                          className="flex-1 py-2 text-[12px] font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          <Icon name="Plus" size={13} /> 쿠폰 추가
                        </button>
                        <button type="button" onClick={() => setShowCouponForm(false)}
                          className="px-3 py-2 text-[12px] text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200">
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 추가된 쿠폰 목록 */}
                  {pendingCoupons.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingCoupons.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 p-2.5 bg-white border border-amber-100 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-amber-50 flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[12px] font-bold text-amber-600 leading-none">
                              {c.discountValue}{c.discountType === "PERCENT" ? "%" : ""}
                            </span>
                            {c.discountType === "AMOUNT" && <span className="text-[8px] text-amber-500">원</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-mono font-bold text-gray-700">{c.code || "자동생성"}</p>
                            <p className="text-[10px] text-gray-400">
                              종료 후 {c.validDays}일
                              {c.minOrderAmount ? ` · ${Number(c.minOrderAmount).toLocaleString()}원 이상` : ""}
                              {c.maxCount ? ` · ${c.maxCount}개 한정` : ""}
                            </p>
                          </div>
                          <button type="button" onClick={() => setPendingCoupons(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-red-400 hover:text-red-600 rounded flex-shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingCoupons.length === 0 && !showCouponForm && (
                    <p className="text-[11px] text-gray-400 text-center py-2">쿠폰 없음 (라이브 생성 후 쿠폰 관리에서도 추가 가능)</p>
                  )}
                </div>
                {/* Live Intro */}
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="Megaphone" size={12} /> 라이브 소개</label>
                  <textarea className="input-field mt-1.5 h-16 resize-none text-sm" placeholder="시청자에게 보여질 라이브 소개글" value={form.liveIntro} onChange={e => setForm({...form, liveIntro: e.target.value})} />
                </div>
                {/* Notices */}
                <div>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="ProductSummary_icon" size={14} /> 공지사항</label>
                  <textarea className="input-field mt-1.5 h-16 resize-none text-sm" placeholder="방송 중 안내할 공지사항" value={form.notices} onChange={e => setForm({...form, notices: e.target.value})} />
                </div>
              </>
            )}
            {createStep === 4 && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-gray-700 flex items-center gap-1"><Icon name="ProductDetailPage_icon" size={14} /> 라이브 정보 확인</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>제목: <span className="font-medium text-gray-900">{form.title || "-"}</span></p>
                    <p>설명: {form.description || "-"}</p>
                    <p>예정 시간: {form.scheduledAt ? new Date(form.scheduledAt).toLocaleString("ko-KR") : "미정"}</p>
                    <p>외부 플랫폼: {form.platform ? `${PLATFORM_OPTIONS.find(p => p.id === form.platform)?.label} (${form.externalUrl || "URL 미입력"})` : "없음"}</p>
                    <p>선택 상담상품: {form.selectedProducts.length}개</p>
                    <p>테마: {THEME_OPTIONS.find(t => t.id === form.theme)?.name || "기본"}</p>
                    {pendingCoupons.length > 0 && <p>쿠폰: {pendingCoupons.length}개 예정</p>}
                    {FEATURE_LIVE_COMMERCE && form.thumbnailImage && (
                      <div className="mt-2">
                        <img src={form.thumbnailImage} alt="썸네일" className="w-32 h-20 object-cover rounded-lg" />
                      </div>
                    )}
                  </div>
                </div>
                {/* 상담상품 순서 미리보기 */}
                {form.selectedProducts.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                      <Hash size={11} /> 상담상품 번호 순서
                    </p>
                    <div className="space-y-1">
                      {form.selectedProducts.map((pid, idx) => {
                        const p = products.find(pp => pp.id === pid);
                        return (
                          <div key={pid} className="flex items-center gap-2 text-xs">
                            <HexNumBadge size={20} fontSize={9}>
                              {idx + 1}
                            </HexNumBadge>
                            <span className="text-gray-800 truncate flex-1">{p?.name || "알 수 없음"}</span>
                            {form.livePrices[pid] && (
                              <span className="text-red-500 font-medium">{Number(form.livePrices[pid]).toLocaleString()}원</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="bg-yellow-50 rounded-xl p-3 flex items-start gap-2">
                  <Icon name="Warning" size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] text-yellow-700">
                    <p className="font-medium">라이브 생성 후 안내</p>
                    <p className="mt-0.5">• RTMP URL과 스트림 키가 자동 생성됩니다</p>
                    <p>• OBS 등 방송 소프트웨어에서 설정하세요</p>
                    <p>• 카카오 알림톡으로 팬에게 알릴 수 있습니다</p>
                    <p>• 쿠폰/혜택/공지가 시청 페이지에 자동 반영됩니다</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 하단 액션 바 — 콘텐츠가 길어도 항상 보이도록 고정. iOS 홈 인디케이터 영역 확보. */}
          <div
            className="flex items-center justify-between gap-2 px-5 pt-4 border-t border-gray-100 bg-white flex-shrink-0 sticky bottom-0 z-10"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button onClick={createStep === 1 ? resetCreate : () => setCreateStep((createStep - 1) as any)} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl font-medium">
              {createStep === 1 ? "취소" : "이전"}
            </button>
            {createStep < 4 ? (
              <button onClick={() => {
                if (createStep === 1 && !form.title) { appAlert("제목을 입력하세요"); return; }
                setCreateStep((createStep + 1) as any);
              }} className="btn-primary text-sm !px-5 !py-2.5">다음</button>
            ) : (
              <button onClick={handleCreate} disabled={creating || !form.title} className="btn-primary text-sm !px-6 !py-2.5 disabled:opacity-40">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <><Icon name="Lightning" size={14} className="inline mr-1" /> 라이브 생성</>}
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ============ Product Manager Modal (with numbering) ============ */}
      {showProductManager && (
        <Modal title="라이브 상담상품 관리" onClose={() => setShowProductManager(null)}>
          <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">상담상품 순서를 변경하고 번호를 설정하세요. 방송 중에도 실시간 반영됩니다.</p>
              <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-lg flex-shrink-0">
                <Hash size={10} className="inline mr-0.5" />{managingProducts.length}개
              </span>
            </div>

            {/* ★ 선택된 상담상품 순서 관리 (번호 표시) */}
            {managingProducts.length > 0 && (
              <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
                <p className="text-[10px] font-bold text-brand-700 mb-2 flex items-center gap-1">
                  <GripVertical size={10} /> 방송 상담상품 순서 (↑↓ 버튼으로 순서 변경)
                </p>
                <div className="space-y-1.5">
                  {managingProducts.map((pid, idx) => {
                    let p = products.find(pp => pp.id === pid);
                    // 상담상품 목록에 없는 경우, 라이브에 등록된 상담상품 데이터에서 폴백
                    if (!p) {
                      const currentLive = lives.find(l => l.id === showProductManager);
                      const liveP = currentLive?.products?.find((lp: any) => (lp.product?.id || lp.productId) === pid);
                      if (liveP?.product) {
                        p = { id: liveP.product.id, name: liveP.product.name, thumbnail: liveP.product.thumbnail, basePrice: liveP.product.basePrice, comparePrice: liveP.product.comparePrice || null, brandName: null, categoryName: null };
                      }
                    }
                    if (!p) return null;
                    return (
                      <div key={pid} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-brand-200/50">
                        <HexNumBadge size={28} fontSize={12} className="flex-shrink-0">
                          {idx + 1}
                        </HexNumBadge>
                        {p.thumbnail && <img src={p.thumbnail} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-gray-800 truncate">{p.name}</p>
                          <p className="text-[9px] text-gray-400">{p.basePrice.toLocaleString()}원</p>
                        </div>
                        {/* 라이브 특가 입력 */}
                        <input
                          type="number"
                          placeholder="특가"
                          className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-brand-200"
                          value={managingPrices[pid] || ""}
                          onChange={e => setManagingPrices({ ...managingPrices, [pid]: e.target.value })}
                        />
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setManagingProducts(moveProduct(managingProducts, idx, -1))}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-400 hover:text-brand-600 disabled:opacity-20 rounded hover:bg-brand-50"
                          >
                            <Icon name="ArrowRight" size={12} className="-rotate-90" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setManagingProducts(moveProduct(managingProducts, idx, 1))}
                            disabled={idx === managingProducts.length - 1}
                            className="p-0.5 text-gray-400 hover:text-brand-600 disabled:opacity-20 rounded hover:bg-brand-50"
                          >
                            <Icon name="ArrowRight" size={12} className="rotate-90" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManagingProducts(managingProducts.filter(id => id !== pid))}
                          className="p-1 text-red-400 hover:text-red-600 rounded"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 추가 가능한 상담상품 목록 */}
            <div className="border border-gray-100 rounded-xl">
              <p className="text-[10px] font-bold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-100">상담상품 추가</p>
              <div className="max-h-40 overflow-y-auto p-2 space-y-1">
                {products.filter(p => !managingProducts.includes(p.id)).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">추가할 상담상품이 없습니다.</p>
                ) : products.filter(p => !managingProducts.includes(p.id)).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setManagingProducts([...managingProducts, p.id])}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-brand-50 transition-colors w-full text-left"
                  >
                    <Icon name="Plus" size={14} className="text-brand-500 flex-shrink-0" />
                    {p.thumbnail && <img src={p.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-[9px] text-gray-400">{p.basePrice.toLocaleString()}원</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 pt-4 border-t border-gray-100 bg-white flex-shrink-0 sticky bottom-0 z-10" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <button onClick={() => setShowProductManager(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">취소</button>
            <button onClick={() => handleProductUpdate(showProductManager)} className="btn-primary text-sm !px-5 !py-2.5">
              {actionLoading === showProductManager ? <Loader2 size={14} className="animate-spin" /> : <>
                <Hash size={12} className="inline mr-1" />상담상품 업데이트 ({managingProducts.length})
              </>}
            </button>
          </div>
        </Modal>
      )}

      {/* ============ Chat Manager Modal ============ */}
      {showChatManager && (
        <Modal title="채팅 관리" onClose={() => setShowChatManager(null)}>
          <div className="flex flex-col min-h-0" style={{ height: "60vh" }}>
            {/* 채팅 메시지 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 bg-gray-50 min-h-0">
              {chatMessages.length === 0 && <p className="text-xs text-gray-400 text-center py-8">채팅이 없습니다</p>}
              {[...chatMessages].reverse().map(msg => (
                <div key={msg.id} className={`px-3 py-1.5 rounded-lg text-[12px] ${
                  msg.isBot ? "bg-amber-50 text-amber-800 border border-amber-100" :
                  msg.isSystem ? "bg-yellow-50 text-yellow-700 border border-yellow-100 text-center" :
                  msg.isManager ? "bg-brand-50 text-brand-700 border border-brand-100" :
                  msg.isHidden ? "bg-gray-50 border border-gray-100 opacity-50 line-through" : "bg-white border border-gray-100"
                }`}>
                  <span className="font-bold inline-flex items-center gap-1 align-middle">
                    {/* 출처 배지: YouTube 실시간 채팅 vs 사주메이트 앱 채팅 */}
                    {msg.isYoutube ? (
                      <span title="YouTube 채팅" className="inline-flex items-center px-1 py-[1px] rounded bg-[#FF0000] text-white text-[8px] font-bold leading-none">YT</span>
                    ) : (!msg.isBot && !msg.isManager && !msg.isSystem) ? (
                      <img src="/favicon.png" alt="사주메이트" title="사주메이트 채팅" className="w-3.5 h-3.5 rounded-[3px]" />
                    ) : null}
                    <span>{msg.isBot ? "🤖 " : msg.isManager ? "📢 " : msg.isSystem ? "📌 " : ""}{msg.nickname}</span>
                  </span>
                  {msg.isHidden && <span className="text-[9px] text-red-400 ml-1">[숨김]</span>}
                  <span className="text-gray-400 mx-1">·</span>
                  <span>{msg.message}</span>
                  <span className="text-[9px] text-gray-300 ml-2">{new Date(msg.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* ── 입력 영역 ── */}
            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded">매니저</div>
                <input type="text" value={managerMsg} onChange={e => setManagerMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendManagerChat(showChatManager)}
                  placeholder="매니저 메시지 입력..."
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-brand-200" />
                <button onClick={() => sendManagerChat(showChatManager)} className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                  <Icon name="Share" size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">공지사항</div>
                <input type="text" value={systemMsg} onChange={e => setSystemMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendManagerChat(showChatManager, true)}
                  placeholder="공지사항 입력..."
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-yellow-200" />
                <button onClick={() => sendManagerChat(showChatManager, true)} className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                  <Icon name="Megaphone" size={14} />
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {["환영합니다!", "잠시 후 시작합니다", "지금 예약하시면 특별 혜택!", "상담상품 교체 중입니다", "질문은 채팅으로 남겨주세요"].map(msg => (
                  <button key={msg} onClick={() => setManagerMsg(msg)}
                    className="text-[10px] px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200">
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ Detail Modal ============ */}
      {detailLive && (
        <Modal title={detailLive.title} onClose={() => setShowDetail(null)}>
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "시청자", value: detailLive.viewerCount, sub: `최고 ${detailLive.peakViewerCount}` },
                { label: "좋아요", value: detailLive.likeCount },
                { label: "채팅", value: detailLive._count.chatMessages },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-gray-900">{s.value.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                  {s.sub && <p className="text-[9px] text-gray-300">{s.sub}</p>}
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600 mb-1 flex items-center gap-1"><Icon name="Broadcast_icon" size={13} /> RTMP 서버</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] bg-white px-2.5 py-1.5 rounded-lg flex-1 truncate border border-gray-200">{detailLive.rtmpUrl}</code>
                <button onClick={() => copyToClipboard(detailLive.rtmpUrl || "")} className="p-1.5 text-gray-400 hover:text-gray-600 bg-white rounded-lg border border-gray-200"><Icon name="Copy" size={14} /></button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600 mb-1 flex items-center gap-1"><Icon name="StreamKey_icon" size={13} /> 스트림 키</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] bg-white px-2.5 py-1.5 rounded-lg flex-1 truncate border border-gray-200">{detailLive.streamKey}</code>
                <button onClick={() => copyToClipboard(detailLive.streamKey || "")} className="p-1.5 text-gray-400 hover:text-gray-600 bg-white rounded-lg border border-gray-200"><Icon name="Copy" size={14} /></button>
              </div>
            </div>
            <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
              <p className="text-xs font-bold text-brand-700 mb-1">라이브 공유 링크</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] bg-white px-2.5 py-1.5 rounded-lg flex-1 truncate text-brand-600 border border-brand-200">
                  {typeof window !== "undefined" ? `${window.location.origin}/live/${detailLive.shareCode}` : `/live/${detailLive.shareCode}`}
                </code>
                <button onClick={() => copyToClipboard(`${window.location.origin}/live/${detailLive.shareCode}`)} className="p-1.5 text-brand-400 hover:text-brand-600 bg-white rounded-lg border border-brand-200"><Icon name="Copy" size={14} /></button>
              </div>
            </div>

            {/* ★ 상담상품 목록 (번호 표시 + 노출 버튼 포함) */}
            {detailLive.products.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                  <Hash size={11} /> 라이브 상담상품 ({detailLive.products.length})
                </p>
                <div className="space-y-1.5">
                  {detailLive.products
                    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                    .map((lp: any, idx: number) => {
                      const isExposed = exposedProductId === (lp.product?.id || lp.productId);
                      return (
                        <div key={lp.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${isExposed ? "bg-brand-50 border border-brand-200 ring-1 ring-brand-100" : "bg-gray-50"}`}>
                          <HexNumBadge size={24} className="flex-shrink-0">
                            {idx + 1}
                          </HexNumBadge>
                          {lp.product?.thumbnail && <img src={lp.product.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{lp.product?.name}</p>
                            <div className="flex items-center gap-1">
                              {lp.livePrice && <span className="text-[10px] font-bold text-red-600">{Number(lp.livePrice).toLocaleString()}원</span>}
                              <span className={`text-[10px] ${lp.livePrice ? "text-gray-400 line-through" : "text-gray-600"}`}>{Number(lp.product?.basePrice).toLocaleString()}원</span>
                            </div>
                          </div>
                          {detailLive.status === "LIVE" && (
                            <button
                              onClick={() => handleExposeProduct(detailLive.id, lp.product?.id || lp.productId)}
                              disabled={exposingLoading}
                              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all flex-shrink-0 ${
                                isExposed
                                  ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                                  : "bg-white border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600"
                              }`}
                            >
                              {exposingLoading ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : isExposed ? (
                                <><Icon name="Eye" size={10} /> 방송화면에 노출중</>
                              ) : (
                                <><Icon name="Eye" size={10} /> 방송화면에 노출</>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ============ 라이브 시작 확인 팝업 ============ */}
      {startPrompt && (
        <div className="fixed inset-0 z-[10100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !startProcessing && setStartPrompt(null)} />
          <div className="relative w-full max-w-[340px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-[dialogIn_200ms_ease-out]">
            <div className="h-1 bg-gradient-to-r from-amber-400 to-yellow-400" />
            <div className="px-6 pt-6 pb-2 text-center">
              <h3 className="text-[15px] font-bold text-gray-900 mb-2">잠깐, 안내드려요!</h3>
              {startPrompt.conflict ? (
                <div className="text-[13px] text-gray-500 leading-relaxed space-y-2">
                  <p>이미 라이브 상담 또는 SNS 라이브가 진행 중입니다.<br />이대로 새 라이브를 시작하시겠습니까?</p>
                  <p className="text-[12px] text-amber-600 font-semibold bg-amber-50 rounded-lg py-2 px-3">
                    기존 라이브는 자동으로 종료됩니다.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  라이브 방송을 시작하시겠습니까?<br />팔로워에게 시작 알림이 발송됩니다.
                </p>
              )}
            </div>
            <div className="p-4 pt-5 flex gap-2.5">
              <button
                onClick={() => setStartPrompt(null)}
                disabled={startProcessing}
                className="flex-1 py-3 text-[13px] font-semibold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                취소
              </button>
              <button
                onClick={confirmStart}
                disabled={startProcessing}
                className="flex-1 py-3 text-[13px] font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {startProcessing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} 라이브 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 알림톡 연동 안됨 경고 모달 ============ */}
      {alimtalkWarnMsg && (
        <div className="fixed inset-0 z-[10100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_150ms_ease-out]"
            onClick={() => setAlimtalkWarnMsg(null)}
          />
          <div className="relative w-full max-w-[340px] bg-amber-50 border border-amber-400 rounded-2xl shadow-lg overflow-hidden animate-[dialogIn_200ms_ease-out]">
            {/* 상단 꿀 그라데이션 바 */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-yellow-400" />
            {/* 내용 */}
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center">
                <Icon name="Warning" className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="text-[15px] font-bold text-amber-800 mb-2">알림톡 안내</h3>
              <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">
                {alimtalkWarnMsg}
              </p>
              <p className="text-[11px] text-amber-600 mt-3 bg-amber-100 rounded-lg px-3 py-2">
                알림톡 설정은 상담사 메뉴 → 알림톡 관리에서 할 수 있습니다.
              </p>
            </div>
            {/* 버튼 */}
            <div className="p-4 pt-5">
              <button
                onClick={() => setAlimtalkWarnMsg(null)}
                className="w-full py-3 text-[13px] font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 active:scale-[0.98] transition-all"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 라이브 쿠폰 관리 모달 ============ */}
      {showCoupon && (
        <CouponManagerModal liveId={showCoupon} onClose={() => setShowCoupon(null)} />
      )}

      {/* ============ 게임 관리 모달 ============ */}
      {showGameManager && (
        <GameManagerModal onClose={() => setShowGameManager(null)} />
      )}

      {/* ============ OBS/PRISM 송출 설정 모달 ============ */}
      {streamSetupLive && (
        <StreamSetupModal
          live={streamSetupLive}
          onClose={() => setShowStreamSetup(null)}
          onSaved={fetchLives}
          copyToClipboard={copyToClipboard}
        />
      )}
    </div>
  );
}

/* ── Helper Components ── */

/* ── Helper Components ── */

function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
        {badge} {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
      <Icon name="Video" size={48} className="mx-auto text-gray-200 mb-3" />
      <p className="text-sm text-gray-500 font-medium">아직 라이브가 없습니다.</p>
      <p className="text-xs text-gray-400 mt-1">새 라이브를 생성하여 팬들과 소통하세요.</p>
      <button onClick={onCreateClick} className="mt-4 btn-primary text-sm !px-5 !py-2.5">
        <Icon name="Plus" size={14} className="inline mr-1" /> 첫 라이브 만들기
      </button>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startMouseX: number; startMouseY: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const onTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: rect.left, startY: rect.top, startMouseX: e.clientX, startMouseY: e.clientY };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.startX + (ev.clientX - dragRef.current.startMouseX),
        y: dragRef.current.startY + (ev.clientY - dragRef.current.startMouseY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" />
      <div
        ref={modalRef}
        // max-h-[calc(100vh-5rem)] 는 dvh 미지원 브라우저용 폴백.
        // 인라인 style 의 dvh 값이 유효하면 그쪽이 우선 적용된다.
        className={`fixed z-[51] bg-white ${wide ? "w-[min(100vw-2rem,42rem)]" : "w-[min(100vw-2rem,32rem)]"} rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[calc(100vh-5rem)]`}
        style={{
          ...(pos ? { left: pos.x, top: pos.y } : { left: "50%", top: "4rem", transform: "translateX(-50%)" }),
          // 모바일에서 하단 버튼이 화면 밖으로 밀려나지 않도록 뷰포트 높이에 맞춰 제한한다.
          // (iOS Safari 주소창 높이 변화 대응: dvh)
          maxHeight: "calc(100dvh - 5rem)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={onTitleMouseDown}
        >
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            onMouseDown={e => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

const GMGR_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Disc3, Network, Ticket, Zap, Hash, HelpCircle, BarChart3, Target, Star, ListOrdered,
};
const GMGR_STATUS: Record<string, { label: string; cls: string }> = {
  IDLE:     { label: "대기",   cls: "bg-gray-100 text-gray-500" },
  RUNNING:  { label: "진행중", cls: "bg-amber-100 text-amber-700" },
  FINISHED: { label: "종료",   cls: "bg-emerald-100 text-emerald-700" },
};

function GameManagerModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // 새 게임 폼 상태
  const [cType, setCType] = useState<GameTypeId>("ROULETTE");
  const [cTitle, setCTitle] = useState("");
  const [cItems, setCItems] = useState<string[]>(["", ""]);
  const [cConfig, setCConfig] = useState<Record<string, any>>(defaultConfig("ROULETTE"));
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/seller/games");
      const data = await res.json();
      setGames(data.games || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames]);

  const doAction = async (id: string, action: string) => {
    setActioning(id + action);
    try {
      await fetch(`/api/seller/games/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await loadGames();
    } finally { setActioning(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 게임을 삭제하시겠습니까?")) return;
    setActioning(id + "del");
    try {
      await fetch(`/api/seller/games/${id}`, { method: "DELETE" });
      await loadGames();
    } finally { setActioning(null); }
  };

  const changeType = (t: GameTypeId) => {
    setCType(t);
    setCConfig(defaultConfig(t));
    setCItems(["", ""]);
  };

  const handleCreate = async () => {
    const err = validateGameInput(cType, cTitle, cItems, cConfig);
    if (err) return showToast(err, false);
    const cleanItems = usesItems(cType) ? cItems.map(i => i.trim()).filter(Boolean) : [];
    const payloadConfig: Record<string, any> = { ...cConfig };
    if (Array.isArray(payloadConfig.choices))
      payloadConfig.choices = payloadConfig.choices.map((c: string) => c.trim()).filter(Boolean);
    if (Array.isArray(payloadConfig.boxes))
      payloadConfig.boxes = payloadConfig.boxes.filter((b: any) => String(b.label).trim())
        .map((b: any) => ({ label: String(b.label).trim(), kind: b.kind, prob: Number(b.prob) || 0 }));
    setSaving(true);
    try {
      const res = await fetch("/api/seller/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: cType, title: cTitle.trim(), items: cleanItems, config: payloadConfig }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("게임이 생성되었습니다");
        setCTitle(""); setCItems(["", ""]); setCConfig(defaultConfig(cType));
        setTab("list");
        loadGames();
      } else {
        showToast(data.error || "생성에 실패했습니다", false);
      }
    } catch { showToast("오류가 발생했습니다", false); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="게임 관리" onClose={onClose} wide>
      {/* 토스트 */}
      {toast && (
        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-bold text-white shadow-lg transition-all ${toast.ok ? "bg-emerald-500" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {([["list", "내 게임"], ["create", "새 게임 만들기"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab === id ? "text-amber-600 border-b-2 border-amber-500" : "text-gray-400 hover:text-gray-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 내 게임 탭 ── */}
      {tab === "list" && (
        <div className="p-4 space-y-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {loading && <p className="text-sm text-gray-400 text-center py-8">불러오는 중...</p>}
          {!loading && games.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-2">등록된 게임이 없습니다.</p>
              <button onClick={() => setTab("create")} className="text-xs text-amber-600 font-semibold hover:underline">
                새 게임 만들기 →
              </button>
            </div>
          )}
          {games.map(game => {
            const statusMeta = GMGR_STATUS[game.status] ?? GMGR_STATUS.IDLE;
            const typeMeta = GAME_TYPE_META[game.type as GameTypeId];
            const GIcon = typeMeta ? (GMGR_ICONS[typeMeta.icon] || Gamepad2) : Gamepad2;
            const isParticipant = usesParticipants(game.type);
            return (
              <div key={game.id} className="border border-gray-100 rounded-xl p-3">
                {/* 게임 정보 행 */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <GIcon size={16} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{game.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {typeMeta?.label ?? game.type}
                      {isParticipant && <span className="ml-1.5 text-blue-500 font-semibold">· 시청자 참여형</span>}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusMeta.cls}`}>
                    {statusMeta.label}
                  </span>
                </div>

                {/* 액션 버튼 행 */}
                <div className="flex items-center gap-1.5">
                  {game.status === "IDLE" && (
                    <button onClick={() => doAction(game.id, "start")} disabled={!!actioning}
                      className="flex-1 text-[11px] py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm shadow-amber-300 ring-1 ring-amber-400 font-bold transition-all">
                      <Play size={11} fill="currentColor" /> 시작
                    </button>
                  )}
                  {game.status === "RUNNING" && (
                    <button onClick={() => doAction(game.id, "finish")} disabled={!!actioning}
                      className="flex-1 text-[11px] py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm shadow-emerald-300 ring-1 ring-emerald-400 font-bold transition-all">
                      <Square size={11} fill="currentColor" /> 종료
                    </button>
                  )}
                  {game.status === "FINISHED" && (
                    <button onClick={() => doAction(game.id, "reset")} disabled={!!actioning}
                      className="flex-1 text-[11px] py-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 flex items-center justify-center gap-1 disabled:opacity-50 font-semibold transition-colors">
                      초기화
                    </button>
                  )}
                  <a href={`/game/${game.id}?overlay=true`} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold shrink-0 flex items-center gap-1">
                    <Monitor size={11} /> 게임화면
                  </a>
                  <button onClick={() => handleDelete(game.id)} disabled={!!actioning}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 새 게임 탭 ── */}
      {tab === "create" && (
        <div className="p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* 게임 종류 선택 */}
          <label className="block text-xs font-semibold text-gray-500 mb-2">게임 종류</label>
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {GAME_TYPES.map(t => {
              const meta = GAME_TYPE_META[t];
              const GIcon = GMGR_ICONS[meta.icon] || Gamepad2;
              const active = cType === t;
              return (
                <button key={t} onClick={() => changeType(t)}
                  className={`flex flex-col items-center gap-1 py-2 px-0.5 rounded-lg border-2 transition-all ${active ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-amber-200"}`}>
                  <GIcon size={16} className={active ? "text-amber-600" : "text-gray-400"} />
                  <span className={`text-[10px] font-bold text-center leading-tight ${active ? "text-amber-700" : "text-gray-600"}`}>
                    {meta.label}
                  </span>
                  {usesParticipants(t) && (
                    <span className="text-[8px] bg-blue-50 text-blue-500 px-1 py-0.5 rounded-full font-semibold leading-none">시청자</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-gray-500 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
            {GAME_TYPE_GUIDE[cType]}
          </div>

          {/* 제목 + 타입별 필드 */}
          <GameFields
            type={cType} title={cTitle} items={cItems} config={cConfig}
            onTitle={setCTitle} onItems={setCItems} onConfig={setCConfig}
          />

          <div className="flex gap-2 mt-4">
            <button onClick={handleCreate} disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-bold transition-colors">
              {saving ? "생성 중..." : "게임 생성"}
            </button>
            <button onClick={() => setTab("list")}
              className="px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition-colors">
              취소
            </button>
          </div>
        </div>
      )}

    </Modal>
  );
}

function LiveCard({ live, onAction, actionLoading, onDetail, onProductManage, onChatManage, onGameManage, copyToClipboard, onExposeProduct, exposedProductId, exposingLoading, onUpdateExternalUrl, onTogglePastInShop, pastToggleLoading, onStart, onCouponManage, onStreamSetup }: {
  live: LiveStream; onAction: any; actionLoading: string | null;
  onDetail: () => void; onProductManage?: () => void; onChatManage?: () => void; onGameManage?: () => void; copyToClipboard: (t: string) => void;
  onExposeProduct?: (liveId: string, productId: string) => void; exposedProductId?: string | null; exposingLoading?: boolean;
  onUpdateExternalUrl?: (liveId: string, url: string) => Promise<boolean | undefined>;
  onTogglePastInShop?: (liveId: string, show: boolean) => void; pastToggleLoading?: boolean;
  onStart?: () => void; onCouponManage?: () => void; onStreamSetup?: () => void;
}) {
  const { appAlert } = useAppDialog();
  const sc = STATUS_CONFIG[live.status];
  const isLoading = actionLoading === live.id;
  const liveUrl = typeof window !== "undefined" ? `${window.location.origin}/live/${live.shareCode}` : `/live/${live.shareCode}`;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  // ★ 외부 라이브 URL 인라인 편집 (SCHEDULED/LIVE 만 활성).
  const canEditUrl = (live.status === "SCHEDULED" || live.status === "LIVE") && !!onUpdateExternalUrl;
  const [urlDraft, setUrlDraft] = useState(live.externalUrl || "");
  const [savingUrl, setSavingUrl] = useState(false);
  useEffect(() => { setUrlDraft(live.externalUrl || ""); }, [live.externalUrl]);
  const urlDirty = urlDraft.trim() !== (live.externalUrl || "");
  const shareUrl = (live.externalUrl || "").trim() || liveUrl;
  const platformLabel = live.platform
    ? PLATFORM_OPTIONS.find(p => p.id === live.platform)?.label || live.platform
    : null;
  const handleSaveUrl = async () => {
    if (!onUpdateExternalUrl || savingUrl) return;
    setSavingUrl(true);
    try { await onUpdateExternalUrl(live.id, urlDraft.trim()); }
    finally { setSavingUrl(false); }
  };

  return (
    <div className={`bg-white rounded-xl border ${live.status === "LIVE" ? "border-red-200 shadow-md ring-1 ring-red-100" : "border-gray-100"} p-4`}>
      <div className="flex items-start gap-3">
        {live.thumbnailImage ? (
          <img src={live.thumbnailImage} alt={live.title} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0 shadow-sm" />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Icon name="Video" size={24} className="text-gray-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.bgClass} ${sc.color}`}>
              {live.status === "LIVE" && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              {sc.label}
            </span>
            {live.isVodSaved && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium border border-purple-100">VOD</span>}
            {live.kakaoNotified && <span className="text-[9px] bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded-full font-medium border border-yellow-100">알림발송</span>}
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{live.title}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400 flex-wrap">
            {live.scheduledAt && <span><Icon name="Clock" size={10} className="inline mr-0.5" />{formatDate(live.scheduledAt)}</span>}
            <span><Icon name="Eye" size={10} className="inline mr-0.5" />{live.viewerCount}</span>
            <span><Icon name="Wishlist" size={10} className="inline mr-0.5" />{live.likeCount}</span>
            <span><Icon name="Package" size={10} className="inline mr-0.5" />{live._count.products}개</span>
            <span><Icon name="Message" size={10} className="inline mr-0.5" />{live._count.chatMessages}</span>
          </div>
        </div>
      </div>

      {/* ★ 상담상품 목록 (라이브 중일 때 노출 버튼 포함) */}
      {live.products.length > 0 && live.status === "LIVE" && onExposeProduct ? (
        <div className="mt-3 space-y-1.5">
          {live.products
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((lp: any, idx: number) => {
              const pid = lp.product?.id || lp.productId;
              const isExposed = exposedProductId === pid;
              const hasDiscount = lp.livePrice && lp.livePrice < Number(lp.product?.basePrice);
              return (
                <div key={lp.id} className={`flex items-center gap-2 p-2 rounded-xl transition-all ${isExposed ? "bg-brand-50 border border-brand-200 ring-1 ring-brand-100" : "bg-gray-50 border border-transparent"}`}>
                  <HexNumBadge size={20} fontSize={9} className="flex-shrink-0">
                    {idx + 1}
                  </HexNumBadge>
                  {lp.product?.thumbnail ? (
                    <img src={lp.product.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Icon name="Cart" size={12} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-gray-800 truncate">{lp.product?.name}</p>
                    <div className="flex items-center gap-1">
                      {hasDiscount && <span className="text-[9px] font-bold text-red-600">{Number(lp.livePrice).toLocaleString()}원</span>}
                      <span className={`text-[9px] ${hasDiscount ? "text-gray-400 line-through" : "text-gray-600"}`}>{Number(lp.product?.basePrice).toLocaleString()}원</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onExposeProduct(live.id, pid)}
                    disabled={exposingLoading}
                    className={`text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 transition-all flex-shrink-0 ${
                      isExposed
                        ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                        : "bg-white border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600"
                    }`}
                  >
                    <Icon name="Eye" size={9} /> {isExposed ? "방송화면에 노출중" : "방송화면에 노출"}
                  </button>
                </div>
              );
            })}
        </div>
      ) : live.products.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
          {live.products
            .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .slice(0, 8)
            .map((lp: any, idx: number) => (
            <div key={lp.id} className="relative flex-shrink-0" style={{ marginLeft: idx === 0 ? '2px' : '0', marginTop: '2px' }}>
              {lp.product?.thumbnail ? (
                <img src={lp.product.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon name="Cart" size={14} className="text-gray-300" />
                </div>
              )}
              <HexNumBadge size={18} fontSize={8} className="absolute -top-1.5 -left-1.5 z-10">
                {idx + 1}
              </HexNumBadge>
            </div>
          ))}
          {live.products.length > 8 && (
            <span className="text-[10px] text-gray-400 flex-shrink-0 pl-1">+{live.products.length - 8}</span>
          )}
        </div>
      ) : null}

      {/* Share link - 진행/예정 라이브는 외부 URL 인라인 편집, 종료된 라이브는 시청 페이지 URL 노출 */}
      <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-gray-400 mb-0.5 flex items-center gap-1">
              {canEditUrl ? "외부 라이브 URL" : "시청 페이지 URL"}
              {platformLabel && <span className="text-brand-600 font-bold">· {platformLabel}</span>}
            </p>
            {canEditUrl ? (
              <input
                type="url"
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && urlDirty && !savingUrl) { e.preventDefault(); handleSaveUrl(); } }}
                placeholder="https://youtube.com/live/... 등 라이브 URL"
                className="w-full text-[11px] font-mono text-brand-600 bg-white px-2.5 py-1 rounded-lg border border-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
            ) : (
              <code className="text-[11px] font-mono text-brand-600 bg-white px-2.5 py-1 rounded-lg border border-gray-100 block truncate">{liveUrl}</code>
            )}
          </div>
          {canEditUrl ? (
            <button
              onClick={handleSaveUrl}
              disabled={!urlDirty || savingUrl}
              className="text-[10px] font-bold px-3 py-2 rounded-lg bg-brand-600 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0 flex items-center gap-1"
            >
              {savingUrl ? <Loader2 size={10} className="animate-spin" /> : "저장"}
            </button>
          ) : (
            <button onClick={() => copyToClipboard(liveUrl)} className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors flex-shrink-0" title="링크 복사">
              <Icon name="Copy" size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => copyToClipboard(shareUrl)} className="text-[10px] text-brand-600 bg-brand-50 flex items-center gap-1 font-medium px-2.5 py-1.5 rounded-lg hover:bg-brand-100 transition-colors">
            URL 복사
          </button>
          <button
            onClick={() => {
              const kakaoMsg = `🔴 라이브 방송 안내\n\n${live.title}\n\n지금 바로 시청하세요!\n${shareUrl}`;
              if (navigator.share) {
                navigator.share({ title: live.title, text: kakaoMsg, url: shareUrl }).catch(() => {});
              } else {
                navigator.clipboard.writeText(kakaoMsg);
                appAlert({ message: "카카오톡 공유 메시지가 복사되었습니다!\n카카오톡에 붙여넣기 하세요.", type: "success" });
              }
            }}
            className="text-[10px] text-yellow-700 bg-yellow-100 flex items-center gap-1 font-medium px-2.5 py-1.5 rounded-lg hover:bg-yellow-200 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.592 1.677 4.877 4.2 6.2-.13.47-.84 3.03-.87 3.23 0 0-.017.14.074.193.091.053.199.025.199.025.263-.037 3.047-1.987 3.53-2.313.59.083 1.2.165 1.867.165 5.523 0 10-3.477 10-7.5S17.523 3 12 3z" fill="#3C1E1E"/></svg> 카카오톡 공유
          </button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 bg-gray-100 flex items-center gap-1 font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            <Icon name="ArrowRight" size={10} /> 열기
          </a>
        </div>
      </div>

      {/* ★ 지난방송 상담상품노출 스위치 (종료된 방송만) */}
      {live.status === "ENDED" && onTogglePastInShop && (
        <div className={`mt-3 flex items-center gap-2 p-3 rounded-xl border transition-all ${live.showPastInShop ? "bg-brand-50 border-brand-200 ring-1 ring-brand-100" : "bg-gray-50 border-gray-100"}`}>
          <Icon name="Cart" size={14} className={live.showPastInShop ? "text-brand-600" : "text-gray-400"} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-gray-800">지난방송 상담상품노출</p>
            <p className="text-[9px] text-gray-400">
              {live.showPastInShop ? "점집 지난 방송 상담상품 영역에 노출 중" : "점집에 노출되지 않음"}
            </p>
          </div>
          {pastToggleLoading ? (
            <Loader2 size={16} className="animate-spin text-gray-400 flex-shrink-0" />
          ) : (
            <button
              type="button"
              onClick={() => onTogglePastInShop(live.id, !live.showPastInShop)}
              aria-label={live.showPastInShop ? "노출 끄기" : "노출 켜기"}
              className={`relative w-10 rounded-full transition-colors flex-shrink-0 ${live.showPastInShop ? "bg-brand-600" : "bg-gray-300"}`}
              style={{ height: "22px" }}
            >
              <span
                className="absolute rounded-full bg-white shadow-sm transition-transform"
                style={{ width: "18px", height: "18px", top: "2px", left: "2px", transform: live.showPastInShop ? "translateX(18px)" : "translateX(0)" }}
              />
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <button onClick={onDetail} className="text-[11px] px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 flex items-center gap-1">
          <Icon name="Eye" size={12} /> 상세
        </button>

        {/* OBS/PRISM 송출 설정 (YouTube B방식 — 방송 전/중) */}
        {(live.status === "SCHEDULED" || live.status === "LIVE") && live.platform === "YOUTUBE" && onStreamSetup && (
          <button onClick={onStreamSetup} className="text-[11px] px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 flex items-center gap-1">
            <Icon name="Broadcast_icon" size={13} /> 송출 설정
          </button>
        )}

        {live.status === "SCHEDULED" && (
          <>
            {onProductManage && (
              <button onClick={onProductManage} className="text-[11px] px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                <Hash size={12} /> 상담상품번호 관리
              </button>
            )}
            <button onClick={() => (onStart ? onStart() : onAction("start", live.id))} disabled={isLoading} className="text-[11px] px-2.5 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1 disabled:opacity-50">
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} 시작
            </button>
            <button onClick={() => onAction("delete", live.id)} disabled={isLoading} className="text-[11px] px-2.5 py-1.5 bg-gray-100 text-red-500 rounded-lg hover:bg-red-50 flex items-center gap-1">
              <Icon name="Delete" size={12} /> 삭제
            </button>
          </>
        )}

        {live.status === "LIVE" && (
          <>
            {onProductManage && (
              <button onClick={onProductManage} className="text-[11px] px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                <Hash size={12} /> 상담상품번호 관리
              </button>
            )}
            {onChatManage && (
              <button onClick={onChatManage} className="text-[11px] px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center gap-1">
                <Icon name="Message" size={12} /> 채팅관리
              </button>
            )}
            {onGameManage && (
              <button onClick={onGameManage} className="text-[11px] px-2.5 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 flex items-center gap-1">
                <Gamepad2 size={12} /> 게임관리
              </button>
            )}
            {onCouponManage && (
              <button onClick={onCouponManage} className="text-[11px] px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 flex items-center gap-1">
                <Icon name="Tag" size={12} /> 쿠폰 관리
              </button>
            )}
            {live.platform === "YOUTUBE" && (
              <button
                onClick={() => onAction("toggle_yt_forward", live.id, { enabled: !live.ytChatForward })}
                disabled={isLoading}
                title="사이트 채팅을 YouTube 라이브 채팅으로 전달합니다 (연결된 YouTube 계정 명의로 게시)"
                className={`text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors ${live.ytChatForward ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                <MonitorPlay size={12} /> YT채팅전달 {live.ytChatForward ? "ON" : "OFF"}
              </button>
            )}
            <button onClick={() => onAction("kakao_notify", live.id)} disabled={isLoading} className={`text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50 transition-colors ${live.kakaoNotified ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.592 1.677 4.877 4.2 6.2-.13.47-.84 3.03-.87 3.23 0 0-.017.14.074.193.091.053.199.025.199.025.263-.037 3.047-1.987 3.53-2.313.59.083 1.2.165 1.867.165 5.523 0 10-3.477 10-7.5S17.523 3 12 3z" fill="currentColor"/></svg>
              {live.kakaoNotified ? "재알림" : "카카오알림"}
            </button>
            <button onClick={() => onAction("end", live.id)} disabled={isLoading} className="text-[11px] px-2.5 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-1 disabled:opacity-50">
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} 종료
            </button>
          </>
        )}

        {live.status === "ENDED" && live.isVodSaved && (
          <a href={`/live/${live.shareCode}`} target="_blank" className="text-[11px] px-2.5 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 flex items-center gap-1">
            <MonitorPlay size={12} /> VOD
          </a>
        )}

        <a href={`/live/${live.shareCode}`} target="_blank" className="text-[11px] px-2.5 py-1.5 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 flex items-center gap-1">
          <Icon name="ArrowRight" size={12} /> 시청페이지
        </a>
      </div>
    </div>
  );
}

/* ── 라이브 쿠폰 관리 모달 ── */
function CouponManagerModal({ liveId, onClose }: { liveId: string; onClose: () => void }) {
  const { appAlert } = useAppDialog();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discountType: "PERCENT" as "PERCENT" | "AMOUNT",
    discountValue: "",
    minOrderAmount: "",
    validDays: "7",
    maxCount: "",
  });

  const fetchCoupons = useCallback(() => {
    setLoading(true);
    fetch(`/api/seller/live/${liveId}/coupon`)
      .then(r => r.json())
      .then(d => setCoupons(d.coupons || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [liveId]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      appAlert({ message: "할인 값을 입력하세요.", type: "warning" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/seller/live/${liveId}/coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim() || undefined,
          discountType: form.discountType,
          discountValue: form.discountValue,
          minOrderAmount: form.minOrderAmount || undefined,
          validDays: form.validDays || undefined,
          maxCount: form.maxCount || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        appAlert({ message: `쿠폰이 생성되었습니다. (${data.coupon?.code})`, type: "success" });
        setForm({ code: "", discountType: "PERCENT", discountValue: "", minOrderAmount: "", validDays: "7", maxCount: "" });
        fetchCoupons();
      } else {
        appAlert({ message: data?.error || "쿠폰 생성에 실패했습니다.", type: "warning" });
      }
    } catch {
      appAlert({ message: "쿠폰 생성 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="라이브 쿠폰 관리" onClose={onClose}>
      <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* 쿠폰 생성 폼 */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1"><Icon name="Tag" size={12} /> 새 쿠폰 발급</p>

          <div>
            <label className="text-[11px] font-semibold text-gray-600">쿠폰 코드</label>
            <input
              type="text"
              className="input-field text-sm mt-1 uppercase"
              placeholder="비워두면 자동 생성됩니다"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-600">할인 유형</label>
              <div className="flex gap-1.5 mt-1">
                {([["PERCENT", "정률(%)"], ["AMOUNT", "정액(원)"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm({ ...form, discountType: val })}
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg border-2 transition-all ${
                      form.discountType === val ? "border-amber-400 bg-amber-100 text-amber-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600">할인 값</label>
              <input
                type="number"
                className="input-field text-sm mt-1"
                placeholder={form.discountType === "PERCENT" ? "예: 10" : "예: 5000"}
                value={form.discountValue}
                onChange={e => setForm({ ...form, discountValue: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-600">최소 구매 금액</label>
              <input
                type="number"
                className="input-field text-sm mt-1"
                placeholder="0 (제한 없음)"
                value={form.minOrderAmount}
                onChange={e => setForm({ ...form, minOrderAmount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600">발급 수량 제한</label>
              <input
                type="number"
                className="input-field text-sm mt-1"
                placeholder="무제한"
                value={form.maxCount}
                onChange={e => setForm({ ...form, maxCount: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600">사용 기간</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-gray-500">라이브 종료 후</span>
              <input
                type="number"
                className="input-field text-sm w-20"
                value={form.validDays}
                onChange={e => setForm({ ...form, validDays: e.target.value })}
              />
              <span className="text-[11px] text-gray-500">일간 유효</span>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-2.5 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Icon name="Plus" size={14} />} 쿠폰 발급
          </button>
        </div>

        {/* 발급된 쿠폰 목록 */}
        <div>
          <p className="text-xs font-bold text-gray-700 mb-2">발급된 쿠폰 ({coupons.length})</p>
          {loading ? (
            <div className="py-8 text-center"><Loader2 size={18} className="animate-spin mx-auto text-gray-300" /></div>
          ) : coupons.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 rounded-xl">아직 발급된 쿠폰이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {coupons.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                  <div className="w-11 h-11 rounded-lg bg-amber-50 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[13px] font-bold text-amber-600 leading-none">
                      {c.discountValue.toLocaleString()}{c.discountType === "PERCENT" ? "%" : ""}
                    </span>
                    {c.discountType === "AMOUNT" && <span className="text-[8px] text-amber-500">원</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[12px] font-mono font-bold text-gray-800">{c.code}</code>
                      <button onClick={() => { navigator.clipboard.writeText(c.code); appAlert({ message: "쿠폰 코드가 복사되었습니다.", type: "success" }); }} className="text-gray-400 hover:text-brand-600">
                        <Icon name="Copy" size={11} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      라이브 종료 후 {c.validDays}일 유효
                      {c.minOrderAmount ? ` · ${c.minOrderAmount.toLocaleString()}원 이상` : ""}
                      {c.maxCount ? ` · ${c.issuedCount}/${c.maxCount}개 발급` : ` · ${c.issuedCount}개 발급`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── OBS/PRISM 송출 설정 모달 (B방식 — YouTube RTMP) ── */
function StreamSetupModal({ live, onClose, onSaved, copyToClipboard }: {
  live: LiveStream; onClose: () => void; onSaved: () => void; copyToClipboard: (t: string) => void;
}) {
  const { appAlert } = useAppDialog();
  const [streamKey, setStreamKey] = useState(live.streamKey || "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = streamKey.trim() !== (live.streamKey || "");

  const saveKey = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_stream_key", liveId: live.id, streamKey: streamKey.trim() }),
      });
      if (res.ok) {
        appAlert({ message: "스트림 키가 저장되었습니다.", type: "success" });
        onSaved();
      } else {
        const d = await res.json().catch(() => ({}));
        appAlert({ message: d?.error || "스트림 키 저장에 실패했습니다.", type: "warning" });
      }
    } catch {
      appAlert({ message: "스트림 키 저장 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setSaving(false);
    }
  };

  const OBS_STEPS = [
    "OBS Studio 실행 → 설정 → 방송",
    "서비스: YouTube - RTMP (또는 사용자 지정)",
    `서버: ${YOUTUBE_RTMP_URL}`,
    "스트림 키: 아래에 저장한 키 입력",
    "확인 후 메인 화면에서 '방송 시작' 클릭",
  ];
  const PRISM_STEPS = [
    "PRISM Live Studio 실행 → 방송 설정",
    "커스텀 RTMP 선택",
    `URL: ${YOUTUBE_RTMP_URL} / 스트림 키 동일 입력`,
    "'Go Live' 클릭으로 송출 시작",
  ];
  const ENCODING = [
    { label: "해상도", value: "1280×720 (720p)" },
    { label: "프레임레이트", value: "30fps" },
    { label: "비트레이트", value: "2500~4000 kbps" },
    { label: "코덱", value: "H.264" },
  ];

  return (
    <Modal title="송출 설정 (OBS · PRISM)" onClose={onClose}>
      <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* 상단 안내 배너 */}
        <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 flex items-start gap-3">
          <Icon name="EmojiHoney_icon" size={26} className="flex-shrink-0" />
          <p className="text-[12px] text-amber-800 leading-relaxed">
            YouTube 스튜디오에서 발급받은 <b>스트림 키</b>를 아래에 저장하고,
            OBS 또는 PRISM Live에 서버 주소와 함께 입력하면 유튜브로 송출됩니다.
            송출이 시작되면 사주메이트 시청 페이지에 유튜브 방송이 자동으로 표시돼요.
          </p>
        </div>

        {/* RTMP 서버 주소 */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
          <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1">
            <Icon name="Broadcast_icon" size={14} /> RTMP 서버 주소
          </p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono bg-white px-2.5 py-2 rounded-lg flex-1 truncate border border-amber-200 text-gray-800">{YOUTUBE_RTMP_URL}</code>
            <button
              onClick={() => copyToClipboard(YOUTUBE_RTMP_URL)}
              className="p-2 text-amber-600 hover:text-amber-800 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex-shrink-0"
              title="복사"
            >
              <Icon name="Copy" size={14} />
            </button>
          </div>
        </div>

        {/* 스트림 키 입력/저장 */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
          <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1">
            <Icon name="StreamKey_icon" size={14} /> 스트림 키
          </p>
          <p className="text-[10px] text-amber-700/70 mb-2 leading-relaxed">
            YouTube 스튜디오(studio.youtube.com) → 만들기 → 라이브 스트리밍 시작 → 스트림 키 복사
          </p>
          <div className="flex items-center gap-2">
            <input
              type={showKey ? "text" : "password"}
              className="flex-1 text-[12px] font-mono border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
              placeholder="예: abcd-efgh-ijkl-mnop-qrst"
              value={streamKey}
              onChange={e => setStreamKey(e.target.value)}
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className={`p-2 rounded-lg border transition-colors flex-shrink-0 ${showKey ? "text-amber-700 bg-amber-100 border-amber-300" : "text-gray-400 bg-white border-amber-200 hover:bg-amber-100"}`}
              title={showKey ? "숨기기" : "표시"}
            >
              <Icon name="Eye" size={14} />
            </button>
            <button
              onClick={() => {
                if (!streamKey.trim()) { appAlert({ message: "복사할 스트림 키가 없습니다.", type: "warning" }); return; }
                copyToClipboard(streamKey.trim());
              }}
              className="p-2 text-amber-600 hover:text-amber-800 bg-white rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex-shrink-0"
              title="복사"
            >
              <Icon name="Copy" size={14} />
            </button>
          </div>
          <button
            onClick={saveKey}
            disabled={!dirty || saving}
            className="mt-2 w-full py-2 text-[12px] font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Icon name="Check" size={13} />}
            {dirty ? "스트림 키 저장" : "저장됨"}
          </button>
        </div>

        {/* OBS 설정 방법 */}
        <div>
          <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
            <Icon name="Studio_icon" size={15} /> OBS Studio 설정 방법
          </p>
          <div className="space-y-2">
            {OBS_STEPS.map((s, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <HexNumBadge size={20} fontSize={9} className="flex-shrink-0 mt-0.5">{i + 1}</HexNumBadge>
                <p className="text-[12px] text-gray-700 leading-relaxed break-all">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* PRISM 설정 방법 */}
        <div>
          <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
            <Icon name="SnsLiveStream_icon" size={15} /> PRISM Live 설정 방법
          </p>
          <div className="space-y-2">
            {PRISM_STEPS.map((s, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <HexNumBadge size={20} fontSize={9} className="flex-shrink-0 mt-0.5">{i + 1}</HexNumBadge>
                <p className="text-[12px] text-gray-700 leading-relaxed break-all">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 권장 인코딩 설정 */}
        <div>
          <p className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
            <Icon name="StreamQuality_icon" size={15} /> 권장 인코딩 설정
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ENCODING.map(e => (
              <div key={e.label} className="bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-amber-700/70">{e.label}</p>
                <p className="text-[12px] font-bold text-gray-800 mt-0.5">{e.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 주의 안내 */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Icon name="Warning" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            스트림 키는 방송 송출 권한이 있는 비밀값입니다. 외부에 공유하지 마세요.
            유튜브에서 방송이 시작되면 라이브 URL을 확인해 <b>외부 라이브 URL</b>에 입력(또는 자동 감지)해야 시청 페이지에 표시됩니다.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end px-5 pt-4 border-t border-gray-100 bg-white flex-shrink-0 sticky bottom-0 z-10" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-amber-900 bg-amber-400 rounded-xl hover:bg-amber-500 transition-colors">
          확인
        </button>
      </div>
    </Modal>
  );
}

// ─── 사이트 설정 패널 ───
interface SiteSettings {
  siteTitle: string;
  liveIntro: string;
  previewImage: string;
  previewImageLink: string;
  previewBgColor: string;
  themeColor: string;
  buttonColor: string;
}

const SITE_DEFAULTS: SiteSettings = {
  siteTitle: "",
  liveIntro: "",
  previewImage: "",
  previewImageLink: "",
  previewBgColor: "#1a0a00",
  themeColor: "#F59E0B",
  buttonColor: "#F59E0B",
};

function LiveSiteSettingsPanel() {
  const [settings, setSettings] = useState<SiteSettings>(SITE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [imgMode, setImgMode] = useState<"url" | "upload">("url");
  const [imgUploading, setImgUploading] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/seller/live-site-settings")
      .then(r => r.json())
      .then(d => { if (d.settings) setSettings({ ...SITE_DEFAULTS, ...d.settings }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/seller/live-site-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) showToast("저장되었습니다.");
      else showToast("저장에 실패했습니다.", "error");
    } catch {
      showToast("저장 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof SiteSettings, value: string) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleImgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file, file.name || "preview.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data?.urls?.[0] || data?.url || "";
        if (url) set("previewImage", url);
      } else {
        showToast("이미지 업로드에 실패했습니다.", "error");
      }
    } catch {
      showToast("업로드 중 오류가 발생했습니다.", "error");
    } finally {
      setImgUploading(false);
      if (imgFileRef.current) imgFileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <Loader2 size={22} className="animate-spin mx-auto text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 relative">
      {/* 토스트 */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-sm font-bold text-white shadow-xl ${toast.type === "success" ? "bg-gray-800" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Globe size={14} className="text-gray-400" /> 기본 정보
        </h3>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <Type size={12} /> 사이트 제목
          </label>
          <input
            type="text"
            className="input-field text-sm"
            placeholder="예: 하늘 선생님 라이브"
            value={settings.siteTitle}
            onChange={e => set("siteTitle", e.target.value)}
          />
          <p className="text-[11px] text-gray-400 mt-1">시청 페이지 상단에 표시됩니다.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <AlignLeft size={12} /> 라이브 소개 텍스트
          </label>
          <textarea
            className="input-field text-sm h-24 resize-none"
            placeholder="방송 중일 때 우측 패널에 표시되는 소개글을 입력하세요."
            value={settings.liveIntro}
            onChange={e => set("liveIntro", e.target.value)}
          />
        </div>
      </div>

      {/* 미리보기 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <ImageIcon size={14} className="text-gray-400" /> 미리보기 설정 (방송 중이 아닐 때)
        </h3>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <ImageIcon size={12} /> 미리보기 이미지
          </label>
          {/* 입력 모드 토글 */}
          <div className="flex gap-1 mb-2">
            <button
              type="button"
              onClick={() => setImgMode("url")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${imgMode === "url" ? "bg-white border-gray-300 text-gray-800 shadow-sm" : "border-transparent text-gray-400 hover:text-gray-600"}`}
            >
              <Link size={11} /> URL 입력
            </button>
            <button
              type="button"
              onClick={() => setImgMode("upload")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${imgMode === "upload" ? "bg-white border-gray-300 text-gray-800 shadow-sm" : "border-transparent text-gray-400 hover:text-gray-600"}`}
            >
              <ImageIcon size={11} /> 파일 업로드
            </button>
          </div>
          {imgMode === "url" ? (
            <input
              type="url"
              className="input-field text-sm"
              placeholder="https://... 또는 /uploads/..."
              value={settings.previewImage}
              onChange={e => set("previewImage", e.target.value)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={imgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImgFileChange}
              />
              <button
                type="button"
                onClick={() => imgFileRef.current?.click()}
                disabled={imgUploading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {imgUploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
                {imgUploading ? "업로드 중..." : "이미지 선택"}
              </button>
              {settings.previewImage && (
                <span className="text-[11px] text-green-600 flex items-center gap-1">
                  <CheckCircle size={11} /> 업로드 완료
                </span>
              )}
            </div>
          )}
          {settings.previewImage && (
            <div className="mt-2 relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
              <img src={settings.previewImage} alt="미리보기" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <Link size={12} /> 이미지 클릭 시 연결 링크
          </label>
          <input
            type="url"
            className="input-field text-sm"
            placeholder="https://..."
            value={settings.previewImageLink}
            onChange={e => set("previewImageLink", e.target.value)}
          />
          <p className="text-[11px] text-gray-400 mt-1">연결할 링크가 있을 시 입력해 주세요.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <Palette size={12} /> 미리보기 배경 색상
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
              value={settings.previewBgColor}
              onChange={e => set("previewBgColor", e.target.value)}
            />
            <input
              type="text"
              className="input-field text-sm flex-1 font-mono"
              value={settings.previewBgColor}
              onChange={e => set("previewBgColor", e.target.value)}
              placeholder="#1a0a00"
            />
          </div>
        </div>
      </div>

      {/* 테마 설정 */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Palette size={14} className="text-gray-400" /> 테마 설정
        </h3>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <Palette size={12} /> 기본 강조 색상
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
              value={settings.themeColor}
              onChange={e => set("themeColor", e.target.value)}
            />
            <input
              type="text"
              className="input-field text-sm flex-1 font-mono"
              value={settings.themeColor}
              onChange={e => set("themeColor", e.target.value)}
              placeholder="#F59E0B"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">배지, 강조 요소 등에 적용됩니다.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1.5">
            <Palette size={12} /> 버튼 색상
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
              value={settings.buttonColor}
              onChange={e => set("buttonColor", e.target.value)}
            />
            <input
              type="text"
              className="input-field text-sm flex-1 font-mono"
              value={settings.buttonColor}
              onChange={e => set("buttonColor", e.target.value)}
              placeholder="#F59E0B"
            />
          </div>
        </div>

        {/* 미리보기 */}
        <div className="mt-2 p-3 rounded-xl border border-gray-100" style={{ backgroundColor: settings.previewBgColor }}>
          <p className="text-[10px] font-bold text-white/60 mb-2">미리보기</p>
          <div className="flex gap-2">
            <div
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: settings.buttonColor, color: "#1a0a00" }}
            >
              버튼 예시
            </div>
            <div
              className="px-2 py-1 rounded-full text-[10px] font-bold"
              style={{ backgroundColor: settings.themeColor, color: "#1a0a00" }}
            >
              강조 배지
            </div>
          </div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "#F59E0B", color: "#1a0a00" }}
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {saving ? "저장 중..." : "설정 저장"}
      </button>
    </div>
  );
}
