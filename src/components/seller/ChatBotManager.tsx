"use client";

import { Icon } from "@/components/shared/Icon";
import { useState, useEffect, useCallback } from "react";
import { Bot, Loader2, X, RefreshCw, KeyRound, Eye, EyeOff, ExternalLink } from "lucide-react";
import HexNumBadge from "@/components/shared/HexNumBadge";
import { useAppDialog } from "@/components/shared/AppDialog";

// AI YouTube 채팅 봇 관리 (상담사 라이브 관리 → AI 봇 탭)
// 봇 메시지는 앱 채팅에 발송(isBot). 상담사가 YouTube OAuth 를 연결하고
// "YouTube로 전송" 을 켜면 YouTube 라이브 채팅에도 동시 전송된다.

interface KeywordRule { keyword: string; response: string }
interface FaqRule { question: string; answer: string }

interface YoutubeStatus { connected: boolean; channelTitle: string | null; envReady: boolean }

interface BotConfig {
  enabled: boolean;
  greetingEnabled: boolean;
  greetingMessage: string;
  keywordEnabled: boolean;
  keywords: KeywordRule[];
  productInfoEnabled: boolean;
  spamFilterEnabled: boolean;
  bannedWords: string[];
  faqEnabled: boolean;
  faqs: FaqRule[];
  purchaseNudgeEnabled: boolean;
  purchaseNudgeMessage: string;
  purchaseNudgeInterval: number;
  statsEnabled: boolean;
  statsInterval: number;
  couponEnabled: boolean;
  couponInterval: number;
  youtubeSendEnabled: boolean;
  youtubeApiKey: string;
}

interface BotLog { id: string; message: string; createdAt: string; liveTitle: string }

const DEFAULT_CONFIG: BotConfig = {
  enabled: false,
  greetingEnabled: true,
  greetingMessage: "",
  keywordEnabled: true,
  keywords: [],
  productInfoEnabled: true,
  spamFilterEnabled: true,
  bannedWords: [],
  faqEnabled: true,
  faqs: [],
  purchaseNudgeEnabled: false,
  purchaseNudgeMessage: "",
  purchaseNudgeInterval: 5,
  statsEnabled: false,
  statsInterval: 10,
  couponEnabled: false,
  couponInterval: 10,
  youtubeSendEnabled: false,
  youtubeApiKey: "",
};

/* 테마 토글 스위치 */
function BeeToggle({ on, onToggle, small }: { on: boolean; onToggle: () => void; small?: boolean }) {
  const w = small ? "w-9" : "w-11";
  const h = small ? "h-5" : "h-6";
  const knob = small ? "h-4 w-4" : "h-5 w-5";
  const tx = small ? "translate-x-4" : "translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative inline-flex ${h} ${w} flex-shrink-0 items-center rounded-full transition-colors ${on ? "bg-amber-500" : "bg-gray-200"}`}
    >
      <span className={`inline-block ${knob} transform rounded-full bg-white shadow transition-transform ${on ? tx : "translate-x-0.5"}`} />
    </button>
  );
}

/* 기능 카드 래퍼 (육각 번호 + 아이콘 + 제목 + 토글) */
function FeatureCard({ num, icon, title, desc, on, onToggle, children }: {
  num: number; icon: string; title: string; desc: string; on: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${on ? "border-amber-200 bg-amber-50/40" : "border-gray-100 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <HexNumBadge size={24} fontSize={11} className="flex-shrink-0 mt-0.5">{num}</HexNumBadge>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
              <Icon name={icon} size={16} className="flex-shrink-0" /> {title}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
          </div>
        </div>
        <BeeToggle on={on} onToggle={onToggle} small />
      </div>
      {on && children && <div className="mt-3 pt-3 border-t border-amber-100/70 space-y-2">{children}</div>}
    </div>
  );
}

/* AI 봇 사용법 가이드 모달 (브랜드 테마) */
function BotGuideModal({ onClose }: { onClose: () => void }) {
  const FEATURES = [
    { icon: "ChatJoin_icon", name: "자동 인사 메시지", desc: "시청자가 라이브에서 첫 채팅을 남기면 봇이 자동으로 환영 인사를 보내요. 인사 문구는 직접 수정할 수 있어요." },
    { icon: "SnsComment_icon", name: "키워드 자동 응답", desc: "채팅에 등록한 키워드가 포함되면 답변을 자동 발송해요. 앱 채팅과 YouTube 채팅 모두 감지해요." },
    { icon: "ProductDetail_icon", name: "상담상품 정보 자동 안내", desc: "“3번 상담상품 뭐예요?”, “가격 얼마예요?”, “예약 가능한가요?” 같은 질문에 라이브 상담상품의 이름·특가를 자동 안내해요." },
    { icon: "ChatBlock_icon", name: "스팸/욕설 필터", desc: "금지어가 포함된 앱 채팅을 자동 숨김 처리하고 경고를 발송해요. 금지어는 원하는 만큼 등록할 수 있어요." },
    { icon: "ProductQA_icon", name: "FAQ 자동 응답", desc: "자주 묻는 질문(예: 상담 방식 언제)을 등록하면 해당 문구 감지 시 답변을 자동 발송해요." },
    { icon: "BuyNow_icon", name: "구매 유도 메시지", desc: "설정한 주기(분)마다 구매 유도 메시지를 자동 발송해 구매 전환을 도와요." },
    { icon: "StreamStats_icon", name: "라이브 통계 공지", desc: "현재 시청자 수·좋아요 수를 주기적으로 공지해 라이브 분위기를 띄워요." },
    { icon: "Coupon_icon", name: "쿠폰 코드 자동 공지", desc: "라이브에 발급된 쿠폰 코드를 주기적으로 공지해요. 쿠폰이 있는 라이브에서만 동작해요." },
  ];
  const KEYWORD_STEPS = [
    "「키워드 자동 응답」 카드의 스위치를 켜세요.",
    "왼쪽 입력란에 감지할 키워드를 입력하세요. (예: 상담 방식)",
    "오른쪽 입력란에 자동 응답 내용을 입력하고 [추가]를 누르세요.",
    "하단의 [AI 봇 설정 저장] 버튼을 눌러야 실제로 적용돼요.",
  ];
  const YT_STEPS = [
    "라이브 생성 시 외부 플랫폼에서 YouTube를 선택하고 라이브 URL을 연결하세요. (방식 A: URL 직접 입력 / 방식 B: 채널 자동 감지)",
    "AI 봇 탭에서 YouTube Data API v3 키를 등록하면 방송 화면과 봇이 YouTube 채팅을 자동으로 읽어와요. (미등록 시 서버 공용 키가 있으면 그 키를 사용)",
    "YouTube 채팅에서도 키워드·FAQ·상담상품 질문이 감지되면 봇이 답변해요.",
    "AI 봇 탭에서 YouTube 채널을 연결(OAuth)하고 「봇 메시지 YouTube로 전송」을 켜면 봇 답변이 YouTube 채팅에도 함께 발송돼요.",
  ];
  const TIPS = [
    { icon: "BuyNow_icon", title: "구매 유도 키워드 예시", body: "「구매」, 「어디서 사요」, 「살게요」, 「예약」 키워드를 등록하고 “화면의 상담상품 목록에서 바로 구매하실 수 있어요!”라고 응답하게 해보세요." },
    { icon: "Shipping_icon", title: "상담 방식 FAQ 미리 등록", body: "「상담 방식 언제」 → “결제 후 3~5일 이내 출고됩니다” 처럼 방송마다 반복되는 질문은 FAQ로 등록해 두면 편해요." },
    { icon: "ChatBlock_icon", title: "금지어는 구체적으로", body: "너무 짧은 금지어(한 글자 등)는 정상 채팅까지 숨길 수 있어요. 광고 문구·욕설 등 구체적인 단어로 등록하세요." },
    { icon: "Clock_icon", title: "주기 메시지는 5~10분 추천", body: "구매 유도·쿠폰 공지가 너무 잦으면 도배처럼 느껴질 수 있어요. 5~10분 간격을 권장해요." },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white border border-amber-200 flex items-center justify-center flex-shrink-0">
              <Icon name="EmojiBee_icon" size={36} />
            </div>
            <div>
              <p className="text-xs font-black text-amber-700">AI 사주봇 가이드</p>
              <p className="text-[15px] font-bold text-gray-900">사용법 안내</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-amber-100 flex items-center justify-center text-gray-400">
            <X size={15} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* 봇 동작 방식 */}
          <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 flex items-start gap-3">
            <Icon name="EmojiHoney_icon" size={26} className="flex-shrink-0" />
            <p className="text-[12px] text-amber-800 leading-relaxed">
              AI 사주봇은 <b>라이브 진행 중, 라이브 관리 페이지가 열려 있는 동안</b> 약 20초 간격으로 채팅을 분석해요.
              사주메이트 앱 채팅과 YouTube 채팅(읽기)을 함께 감지하고, 봇 메시지는 <b>🤖 봇 뱃지</b>와 함께 앱 채팅에 표시됩니다.
            </p>
          </div>

          {/* 기능별 설명 */}
          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <Icon name="LiveChat_icon" size={15} /> 기능별 설명
            </p>
            <div className="space-y-2">
              {FEATURES.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-50/50 border border-amber-100/70 rounded-xl">
                  <HexNumBadge size={20} fontSize={9} className="flex-shrink-0 mt-0.5">{i + 1}</HexNumBadge>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-gray-800 flex items-center gap-1.5">
                      <Icon name={f.icon} size={14} className="flex-shrink-0" /> {f.name}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 키워드-응답 등록 방법 */}
          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <Icon name="SnsComment_icon" size={15} /> 키워드-응답 등록 방법
            </p>
            <div className="space-y-2">
              {KEYWORD_STEPS.map((s, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[12px] text-gray-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>

          {/* YouTube 채팅 연동 */}
          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <Icon name="YouTube_icon" size={15} /> YouTube 채팅 연동 방법
            </p>
            <div className="space-y-2">
              {YT_STEPS.map((s, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[12px] text-gray-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 활용 팁 */}
          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <Icon name="EmojiSparkle_icon" size={15} /> 활용 팁
            </p>
            <div className="space-y-2">
              {TIPS.map((t, i) => (
                <div key={i} className="p-3 bg-white border border-amber-200 rounded-xl">
                  <p className="text-[12px] font-bold text-amber-700 flex items-center gap-1.5">
                    <Icon name={t.icon} size={14} className="flex-shrink-0" /> {t.title}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-amber-100 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors">
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}

/* YouTube Data API v3 키 발급 방법 안내 모달 */
function ApiKeyGuideModal({ onClose }: { onClose: () => void }) {
  const STEPS = [
    {
      title: "Google Cloud Console 접속",
      body: (
        <>
          <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 underline inline-flex items-center gap-0.5 font-medium">
            console.cloud.google.com <ExternalLink size={10} />
          </a>
          에 접속해 Google 계정으로 로그인하세요. (YouTube 채널 계정이 아니어도 무방해요)
        </>
      ),
    },
    {
      title: "프로젝트 생성",
      body: <>상단 프로젝트 선택 메뉴 → <b>새 프로젝트</b>를 클릭하고, 프로젝트 이름(예: sajumate-live)을 입력한 뒤 <b>만들기</b>를 누르세요. 생성 후 상단에서 해당 프로젝트가 선택되어 있는지 확인하세요.</>,
    },
    {
      title: "YouTube Data API v3 활성화",
      body: <>왼쪽 메뉴 <b>API 및 서비스 → 라이브러리</b>로 이동해 검색창에 <b>YouTube Data API v3</b>를 검색하고, 결과를 클릭한 뒤 <b>사용(사용 설정)</b> 버튼을 누르세요.</>,
    },
    {
      title: "API 키 생성",
      body: <>왼쪽 메뉴 <b>API 및 서비스 → 사용자 인증 정보</b>로 이동해 상단의 <b>+ 사용자 인증 정보 만들기 → API 키</b>를 클릭하세요. 잠시 후 API 키가 생성되어 화면에 표시돼요.</>,
    },
    {
      title: "키 제한 설정 (보안 권장)",
      body: <>생성된 키 옆의 <b>키 제한(API 키 수정)</b>으로 들어가 <b>API 제한사항 → 키 제한</b>을 선택하고, 목록에서 <b>YouTube Data API v3</b>만 체크한 뒤 <b>저장</b>하세요. 키가 유출되어도 다른 서비스에 사용될 수 없어요.</>,
    },
    {
      title: "키 복사 후 등록",
      body: <>키 오른쪽의 복사 버튼으로 API 키를 복사해 입력란에 붙여넣고, 하단의 <b>[AI 봇 설정 저장]</b> 버튼을 눌러 저장하세요.</>,
    },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white border border-amber-200 flex items-center justify-center flex-shrink-0">
              <KeyRound size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-black text-amber-700">YouTube Data API v3</p>
              <p className="text-[15px] font-bold text-gray-900">API 키 발급 방법</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-amber-100 flex items-center justify-center text-gray-400">
            <X size={15} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* API 키 용도 안내 */}
          <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 flex items-start gap-3">
            <Icon name="YouTube_icon" size={22} className="flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-800 leading-relaxed">
              API 키를 등록하면 라이브 방송 화면에서 <b>YouTube 실시간 채팅</b>을 읽어와 사주메이트 채팅과 함께 표시하고,
              AI 봇의 키워드·FAQ 감지에도 활용돼요. 키는 <b>서버에만 저장</b>되며 시청자에게 노출되지 않아요.
            </p>
          </div>

          {/* 발급 단계 */}
          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <KeyRound size={15} className="text-amber-500" /> 발급 단계
            </p>
            <div className="space-y-2">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-2.5 items-start p-3 bg-amber-50/50 border border-amber-100/70 rounded-xl">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-gray-800">{step.title}</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 할당량 안내 */}
          <div className="flex items-start gap-2 p-3 bg-white border border-amber-200 rounded-xl">
            <Icon name="Info" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700/80 leading-relaxed">
              YouTube Data API는 무료이며 일일 할당량(기본 10,000 units)이 제공돼요. 라이브 채팅 조회에 할당량이 소모되므로,
              방송이 많은 날 채팅 수신이 멈추면 할당량 초과 여부를 Google Cloud Console에서 확인해 주세요.
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-amber-100 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors">
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatBotManager({ onConfigSaved }: { onConfigSaved?: () => void }) {
  const { appAlert } = useAppDialog();
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showApiKeyGuide, setShowApiKeyGuide] = useState(false);

  // 키워드/FAQ/금지어 입력 드래프트
  const [kwDraft, setKwDraft] = useState({ keyword: "", response: "" });
  const [faqDraft, setFaqDraft] = useState({ question: "", answer: "" });
  const [banDraft, setBanDraft] = useState("");

  // 봇 활동 로그
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // YouTube OAuth 연결 상태
  const [ytStatus, setYtStatus] = useState<YoutubeStatus | null>(null);
  const [ytDisconnecting, setYtDisconnecting] = useState(false);

  // YouTube Data API 키 입력 표시 상태
  const [showApiKey, setShowApiKey] = useState(false);
  // DB 스키마 미반영(prisma db push 전) 등 서버 측 경고
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  const fetchYtStatus = useCallback(() => {
    fetch("/api/auth/youtube/status")
      .then(r => r.json())
      .then(d => setYtStatus({ connected: Boolean(d?.connected), channelTitle: d?.channelTitle ?? null, envReady: Boolean(d?.envReady) }))
      .catch(() => setYtStatus({ connected: false, channelTitle: null, envReady: false }));
  }, []);
  useEffect(() => { fetchYtStatus(); }, [fetchYtStatus]);

  const disconnectYoutube = async () => {
    if (ytDisconnecting) return;
    setYtDisconnecting(true);
    try {
      const res = await fetch("/api/auth/youtube/status", { method: "DELETE" });
      if (res.ok) {
        setYtStatus(s => (s ? { ...s, connected: false, channelTitle: null } : s));
        setConfig(prev => ({ ...prev, youtubeSendEnabled: false }));
        appAlert({ message: "YouTube 채널 연결이 해제되었습니다.", type: "success" });
      } else {
        appAlert({ message: "연결 해제에 실패했습니다.", type: "warning" });
      }
    } catch {
      appAlert({ message: "연결 해제 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setYtDisconnecting(false);
    }
  };

  const patch = (p: Partial<BotConfig>) => { setConfig(prev => ({ ...prev, ...p })); setDirty(true); };

  useEffect(() => {
    fetch("/api/seller/chatbot")
      .then(r => r.json())
      .then(d => {
        if (d?.config) setConfig({ ...DEFAULT_CONFIG, ...d.config });
        setDbWarning(d?.warning || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchLogs = useCallback(() => {
    setLogsLoading(true);
    fetch("/api/seller/chatbot?mode=logs")
      .then(r => r.json())
      .then(d => setLogs(d?.logs || []))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, []);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/seller/chatbot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data?.warning) {
          // DB 미반영 폴백 저장: API 키는 저장되지 않았으므로 입력값을 유지하고 재저장 가능 상태로 둔다
          if (data?.config) setConfig(prev => ({ ...DEFAULT_CONFIG, ...data.config, youtubeApiKey: prev.youtubeApiKey }));
          setDbWarning(data.warning);
          appAlert({ message: data.warning, type: "warning" });
        } else {
          if (data?.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
          setDbWarning(null);
          setDirty(false);
          appAlert({ message: "AI 봇 설정이 저장되었습니다.", type: "success" });
        }
        onConfigSaved?.();
      } else {
        appAlert({ message: data?.error || "저장에 실패했습니다.", type: "warning" });
      }
    } catch {
      appAlert({ message: "저장 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
        <Loader2 size={24} className="animate-spin mx-auto text-amber-300" />
        <p className="text-xs text-gray-400 mt-2">AI 봇 설정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 마스터 토글 카드 ── */}
      <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-amber-300 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Icon name="EmojiBee_icon" size={42} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-amber-900 flex items-center gap-1.5">
                AI 사주봇 <Icon name="EmojiHoney_icon" size={16} />
              </p>
              <p className="text-[11px] text-amber-700/80 mt-0.5">
                {config.enabled ? "봇이 활성화되어 있어요. 라이브 진행 중 자동으로 동작합니다." : "봇이 꺼져 있어요. 켜면 라이브 채팅을 자동으로 관리해 드려요."}
              </p>
            </div>
          </div>
          <BeeToggle on={config.enabled} onToggle={() => patch({ enabled: !config.enabled })} />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2.5">
          <Icon name="Info" size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            봇 메시지는 <b>사주메이트 앱 채팅</b>에 표시되고, 아래에서 YouTube 채널을 연결하면 <b>YouTube 채팅에도 동시 전송</b>할 수 있어요.
            YouTube 채팅은 <b>읽기 연동</b>되어 키워드 감지에 활용돼요.
            봇은 <b>라이브 진행 중 이 라이브 관리 페이지가 열려 있는 동안</b> 약 20초 간격으로 동작합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="mt-3 w-full py-2.5 bg-white border-2 border-amber-300 text-amber-700 text-[13px] font-bold rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="Help_icon" size={15} /> 사용법 보기
        </button>
      </div>

      {/* ── 사용법 가이드 모달 ── */}
      {showGuide && <BotGuideModal onClose={() => setShowGuide(false)} />}

      {/* ── YouTube Data API v3 API 키 (라이브 YouTube 채팅 읽기용) ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
          <KeyRound size={15} className="text-amber-500" /> YouTube Data API v3 API 키
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          API 키를 등록하면 라이브 방송 화면에서 <b>YouTube 실시간 채팅</b>을 읽어와 사주메이트 채팅과 함께 표시하고,
          AI 봇의 키워드·FAQ 감지에도 활용돼요. 키는 서버에만 저장되며 시청자에게 노출되지 않아요.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type={showApiKey ? "text" : "password"}
              className="w-full text-[12px] border border-amber-200 rounded-lg pl-2.5 pr-9 py-2 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-300"
              placeholder="AIza로 시작하는 API 키를 붙여넣으세요"
              value={config.youtubeApiKey}
              onChange={e => patch({ youtubeApiKey: e.target.value.trim() })}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showApiKey ? "키 숨기기" : "키 표시"}
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        {dbWarning && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
            <Icon name="Info" size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-500 leading-relaxed">{dbWarning}</p>
          </div>
        )}
        {config.youtubeApiKey ? (
          <p className="text-[11px] text-green-600 flex items-center gap-1">
            <Icon name="Check" size={12} /> API 키가 입력되어 있어요. 하단의 [AI 봇 설정 저장]을 눌러야 적용됩니다.
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">아직 등록된 키가 없어요. 아래 안내를 따라 발급 후 등록해 주세요.</p>
        )}

        {/* 발급 방법 안내 (모달) */}
        <button
          type="button"
          onClick={() => setShowApiKeyGuide(true)}
          className="w-full py-2.5 bg-white border-2 border-amber-300 text-amber-700 text-[13px] font-bold rounded-xl hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="Help_icon" size={15} /> 사용법 보기
        </button>
      </div>

      {/* ── API 키 발급 가이드 모달 ── */}
      {showApiKeyGuide && <ApiKeyGuideModal onClose={() => setShowApiKeyGuide(false)} />}

      {/* ── YouTube 채널 연결 (OAuth) + YouTube 전송 설정 ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
          <Icon name="YouTube_icon" size={16} /> YouTube 채널 연결
        </p>

        {ytStatus?.connected ? (
          <>
            <div className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-200 rounded-xl">
              <Icon name="Check" size={15} className="text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-green-700 truncate">
                  {ytStatus.channelTitle || "YouTube 채널"} 연결됨
                </p>
                <p className="text-[10px] text-green-600/80">봇 메시지를 YouTube 라이브 채팅에도 전송할 수 있어요.</p>
              </div>
              <button
                type="button"
                onClick={disconnectYoutube}
                disabled={ytDisconnecting}
                className="text-[11px] font-bold px-2.5 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex-shrink-0"
              >
                {ytDisconnecting ? "해제 중..." : "연결 해제"}
              </button>
            </div>

            {/* YouTube로 전송 토글 */}
            <div className="flex items-center justify-between gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-gray-800">봇 메시지 YouTube로 전송</p>
                <p className="text-[10px] text-gray-400 mt-0.5">켜면 봇 메시지가 앱 채팅과 YouTube 라이브 채팅에 함께 발송돼요.</p>
              </div>
              <BeeToggle small on={config.youtubeSendEnabled} onToggle={() => patch({ youtubeSendEnabled: !config.youtubeSendEnabled })} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
              <Icon name="Info" size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-500 leading-relaxed">
                YouTube 채널을 연결하면 봇 메시지를 YouTube 채팅에도 전송할 수 있어요.
                라이브 생성 시 <b>내 채널의 진행 중인 방송 자동 감지</b>(B방식)도 함께 활성화됩니다.
              </p>
            </div>
            {ytStatus && !ytStatus.envReady ? (
              <p className="text-[11px] text-gray-400 text-center py-1">
                YouTube 연결 기능이 아직 설정되지 않았습니다. 관리자에게 문의하세요.
              </p>
            ) : (
              <a
                href="/api/auth/youtube/connect"
                className="w-full py-2.5 bg-[#FF0000] text-white text-[13px] font-bold rounded-xl hover:bg-[#d90000] transition-colors flex items-center justify-center gap-1.5"
              >
                <Icon name="YouTube_icon" size={15} /> YouTube 채널 연결
              </a>
            )}
            {/* 미연결 시 전송 토글 비활성 안내 */}
            <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl opacity-60">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-gray-500">봇 메시지 YouTube로 전송</p>
                <p className="text-[10px] text-gray-400 mt-0.5">YouTube 채널 연결 후 사용할 수 있어요.</p>
              </div>
              <BeeToggle small on={false} onToggle={() => {}} />
            </div>
          </>
        )}
      </div>

      {/* ── 기능별 설정 ── */}
      <div className="grid grid-cols-1 gap-3">
        {/* 1. 자동 인사 */}
        <FeatureCard
          num={1}
          icon="ChatJoin_icon"
          title="자동 인사 메시지"
          desc="시청자의 첫 채팅을 감지하면 자동으로 환영 인사를 보내요."
          on={config.greetingEnabled}
          onToggle={() => patch({ greetingEnabled: !config.greetingEnabled })}
        >
          <input
            type="text"
            className="input-field text-sm"
            placeholder="환영합니다! 즐거운 라이브 되세요 🍯 (비워두면 기본 문구)"
            value={config.greetingMessage}
            onChange={e => patch({ greetingMessage: e.target.value })}
          />
        </FeatureCard>

        {/* 2. 키워드 자동 응답 */}
        <FeatureCard
          num={2}
          icon="SnsComment_icon"
          title="키워드 자동 응답"
          desc="채팅에 키워드가 감지되면 등록한 답변을 자동 발송해요. (예: 상담 방식 → 상담 방식 안내)"
          on={config.keywordEnabled}
          onToggle={() => patch({ keywordEnabled: !config.keywordEnabled })}
        >
          {config.keywords.length > 0 && (
            <div className="space-y-1.5">
              {config.keywords.map((k, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-amber-100 p-2">
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg flex-shrink-0 max-w-[110px] truncate">{k.keyword}</span>
                  <Icon name="ArrowRight" size={11} className="text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    className="flex-1 text-[12px] text-gray-700 bg-transparent focus:outline-none min-w-0"
                    value={k.response}
                    onChange={e => {
                      const next = [...config.keywords];
                      next[idx] = { ...next[idx], response: e.target.value };
                      patch({ keywords: next });
                    }}
                  />
                  <button type="button" onClick={() => patch({ keywords: config.keywords.filter((_, i) => i !== idx) })} className="p-1 text-red-400 hover:text-red-600 rounded flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              className="w-28 text-[12px] border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 flex-shrink-0"
              placeholder="키워드"
              value={kwDraft.keyword}
              onChange={e => setKwDraft(d => ({ ...d, keyword: e.target.value }))}
            />
            <input
              type="text"
              className="flex-1 text-[12px] border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
              placeholder="자동 응답 내용"
              value={kwDraft.response}
              onChange={e => setKwDraft(d => ({ ...d, response: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => {
                if (!kwDraft.keyword.trim() || !kwDraft.response.trim()) return;
                patch({ keywords: [...config.keywords, { keyword: kwDraft.keyword.trim(), response: kwDraft.response.trim() }] });
                setKwDraft({ keyword: "", response: "" });
              }}
              disabled={!kwDraft.keyword.trim() || !kwDraft.response.trim()}
              className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
            >
              <Icon name="Plus" size={12} /> 추가
            </button>
          </div>
        </FeatureCard>

        {/* 3. 상담상품 정보 자동 안내 */}
        <FeatureCard
          num={3}
          icon="ProductDetail_icon"
          title="상담상품 정보 자동 안내"
          desc="“3번 상담상품 뭐예요?”, “가격 얼마예요?”, “예약 가능한가요?” 같은 질문에 라이브 상담상품 정보를 자동으로 안내해요."
          on={config.productInfoEnabled}
          onToggle={() => patch({ productInfoEnabled: !config.productInfoEnabled })}
        />

        {/* 4. 스팸/욕설 필터 */}
        <FeatureCard
          num={4}
          icon="ChatBlock_icon"
          title="스팸/욕설 감지 및 필터링"
          desc="금지어가 포함된 앱 채팅을 자동 숨김 처리하고 경고 메시지를 발송해요."
          on={config.spamFilterEnabled}
          onToggle={() => patch({ spamFilterEnabled: !config.spamFilterEnabled })}
        >
          {config.bannedWords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {config.bannedWords.map((w, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg">
                  {w}
                  <button type="button" onClick={() => patch({ bannedWords: config.bannedWords.filter((_, i) => i !== idx) })} className="text-red-300 hover:text-red-500">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 text-[12px] border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
              placeholder="금지어 입력 (예: 광고, 도배 문구 등)"
              value={banDraft}
              onChange={e => setBanDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && banDraft.trim()) {
                  e.preventDefault();
                  if (!config.bannedWords.includes(banDraft.trim())) patch({ bannedWords: [...config.bannedWords, banDraft.trim()] });
                  setBanDraft("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!banDraft.trim()) return;
                if (!config.bannedWords.includes(banDraft.trim())) patch({ bannedWords: [...config.bannedWords, banDraft.trim()] });
                setBanDraft("");
              }}
              disabled={!banDraft.trim()}
              className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
            >
              <Icon name="Plus" size={12} /> 추가
            </button>
          </div>
        </FeatureCard>

        {/* 5. FAQ 자동 응답 */}
        <FeatureCard
          num={5}
          icon="ProductQA_icon"
          title="FAQ 자동 응답"
          desc="자주 묻는 질문을 등록하면 질문 문구가 감지될 때 답변을 자동 발송해요."
          on={config.faqEnabled}
          onToggle={() => patch({ faqEnabled: !config.faqEnabled })}
        >
          {config.faqs.length > 0 && (
            <div className="space-y-1.5">
              {config.faqs.map((f, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-amber-100 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-600 flex-shrink-0">Q</span>
                    <p className="flex-1 text-[12px] font-medium text-gray-800 truncate min-w-0">{f.question}</p>
                    <button type="button" onClick={() => patch({ faqs: config.faqs.filter((_, i) => i !== idx) })} className="p-1 text-red-400 hover:text-red-600 rounded flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex items-start gap-2 mt-1">
                    <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">A</span>
                    <input
                      type="text"
                      className="flex-1 text-[12px] text-gray-600 bg-transparent focus:outline-none min-w-0"
                      value={f.answer}
                      onChange={e => {
                        const next = [...config.faqs];
                        next[idx] = { ...next[idx], answer: e.target.value };
                        patch({ faqs: next });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <input
              type="text"
              className="w-full text-[12px] border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
              placeholder="질문 문구 (예: 상담 방식 언제)"
              value={faqDraft.question}
              onChange={e => setFaqDraft(d => ({ ...d, question: e.target.value }))}
            />
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 text-[12px] border border-amber-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 min-w-0"
                placeholder="자동 답변 (예: 결제 후 3~5일 이내 출고됩니다)"
                value={faqDraft.answer}
                onChange={e => setFaqDraft(d => ({ ...d, answer: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => {
                  if (!faqDraft.question.trim() || !faqDraft.answer.trim()) return;
                  patch({ faqs: [...config.faqs, { question: faqDraft.question.trim(), answer: faqDraft.answer.trim() }] });
                  setFaqDraft({ question: "", answer: "" });
                }}
                disabled={!faqDraft.question.trim() || !faqDraft.answer.trim()}
                className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
              >
                <Icon name="Plus" size={12} /> 추가
              </button>
            </div>
          </div>
        </FeatureCard>

        {/* 6. 구매 유도 메시지 */}
        <FeatureCard
          num={6}
          icon="BuyNow_icon"
          title="예약 유도 메시지"
          desc="설정한 주기마다 예약 유도 메시지를 자동 발송해요."
          on={config.purchaseNudgeEnabled}
          onToggle={() => patch({ purchaseNudgeEnabled: !config.purchaseNudgeEnabled })}
        >
          <input
            type="text"
            className="input-field text-sm"
            placeholder="지금 예약하시면 라이브 할인 적용! (비워두면 기본 문구)"
            value={config.purchaseNudgeMessage}
            onChange={e => patch({ purchaseNudgeMessage: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">발송 주기</span>
            <input
              type="number"
              min={1}
              max={120}
              className="w-20 text-[12px] border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
              value={config.purchaseNudgeInterval}
              onChange={e => patch({ purchaseNudgeInterval: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })}
            />
            <span className="text-[11px] text-gray-500">분마다</span>
          </div>
        </FeatureCard>

        {/* 7. 라이브 통계 봇 */}
        <FeatureCard
          num={7}
          icon="StreamStats_icon"
          title="라이브 통계 공지"
          desc="현재 시청자 수와 좋아요 수를 주기적으로 자동 공지해요."
          on={config.statsEnabled}
          onToggle={() => patch({ statsEnabled: !config.statsEnabled })}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">공지 주기</span>
            <input
              type="number"
              min={1}
              max={120}
              className="w-20 text-[12px] border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
              value={config.statsInterval}
              onChange={e => patch({ statsInterval: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })}
            />
            <span className="text-[11px] text-gray-500">분마다</span>
          </div>
        </FeatureCard>

        {/* 8. 쿠폰 코드 자동 공지 */}
        <FeatureCard
          num={8}
          icon="Coupon_icon"
          title="쿠폰 코드 자동 공지"
          desc="라이브에 발급된 쿠폰 코드를 주기적으로 자동 공지해요. (쿠폰이 있는 라이브에서만 동작)"
          on={config.couponEnabled}
          onToggle={() => patch({ couponEnabled: !config.couponEnabled })}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">공지 주기</span>
            <input
              type="number"
              min={1}
              max={120}
              className="w-20 text-[12px] border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300"
              value={config.couponInterval}
              onChange={e => patch({ couponInterval: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })}
            />
            <span className="text-[11px] text-gray-500">분마다</span>
          </div>
        </FeatureCard>
      </div>

      {/* ── 저장 버튼 ── */}
      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="w-full py-3 text-sm font-bold text-white bg-amber-500 rounded-2xl hover:bg-amber-600 disabled:opacity-50 shadow-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Icon name="Check" size={15} />}
          {dirty ? "AI 봇 설정 저장" : "저장됨"}
        </button>
      </div>

      {/* ── 봇 활동 로그 ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
            <Icon name="LiveChat_icon" size={15} /> 봇 활동 로그 <span className="text-[11px] font-medium text-gray-400">(최근 발송 {logs.length}건)</span>
          </p>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={logsLoading}
            className="text-[11px] px-2.5 py-1.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={logsLoading ? "animate-spin" : ""} /> 새로고침
          </button>
        </div>
        {logs.length === 0 ? (
          <div className="text-center py-10 text-gray-300">
            <Bot size={32} className="mx-auto mb-2" />
            <p className="text-[12px]">아직 봇이 발송한 메시지가 없습니다.</p>
            <p className="text-[11px] mt-0.5">봇을 켜고 라이브를 시작하면 활동 내역이 여기에 표시돼요.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2.5 p-2.5 bg-amber-50/50 border border-amber-100/70 rounded-xl">
                <span className="text-sm flex-shrink-0">🤖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-700 leading-relaxed break-all">{log.message}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {log.liveTitle} · {new Date(log.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
