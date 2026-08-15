// 주요 기능 토글.
//
// - 아래 상수는 "코드 기본값"입니다. (DB Setting 값이 없을 때 사용)
// - 실제 런타임 값은 최고관리자 "권한 설정"에서 DB(Setting)로 켜고 끌 수 있으며,
//   DB 값이 있으면 코드 상수보다 DB가 우선합니다. (lib/settings.ts 의 getFeatureFlags 참고)
// - 서버 컴포넌트/route 는 getFeatureFlags() (lib/settings.ts) 를 직접 await 하고,
//   클라이언트 컴포넌트는 useFeatureFlags() (FeatureFlagsProvider) 로 값을 받습니다.
//
// 이 파일은 클라이언트 번들에도 포함되므로 prisma 등 서버 전용 모듈을 import 하지 않습니다.

// 셀러브릭스의 공동구매 기능은 사주메이트에서 사용하지 않는다.
// 타입과 설정 키는 기존 설정/데이터 호환을 위해 유지하되 런타임에서는 항상 비활성화한다.
export const FEATURE_GROUP_BUY = false;
export const FEATURE_LIVE_COMMERCE = true; // 라이브 상담
export const FEATURE_SELLER = true; // 상담사(인플루언서) 탐색 기능
export const FEATURE_BRIX = true; // 브릭스 = 콘텐츠 피드(/content)
// 상담상품 등록 탭 노출 — 기본값은 "숨김"(false). 최고관리자가 켜야 노출된다.
export const FEATURE_REG_NORMAL = false; // 상담상품등록: 일반상담상품 탭
export const FEATURE_REG_GROUP_BUY = false; // 상담상품등록: 단체 상담 탭
// 상담사 상담상품관리 '상담상품신청' 메뉴 — 기본 노출(true).
export const FEATURE_PRODUCT_REQUEST = true;
// 추천인(레퍼럴) 제도 — 기본 비활성(false). 최고관리자가 켜야 추천인 코드 입력 등 관련 UI가 노출된다.
export const FEATURE_REFERRAL = false;
// 장식 — 기본 활성(true). 최고관리자가 끄면 전체 이모지 장식이 숨겨진다.
export const FEATURE_BEE_DECORATION = true;

export type FeatureFlags = {
  groupBuy: boolean;
  liveCommerce: boolean;
  seller: boolean;
  brix: boolean;
  regNormal: boolean;
  regGroupBuy: boolean;
  productRequest: boolean;
  referral: boolean;
  beeDecoration: boolean;
  themSnow: boolean;
  themCherry: boolean;
  themHalloween: boolean;
  themChristmas: boolean;
  themValentine: boolean;
  themRainy: boolean;
  themSummer: boolean;
  themAutumn: boolean;
  game: boolean;
};

// 코드 기본값 (DB 값이 없을 때 사용)
export const FEATURE_DEFAULTS: FeatureFlags = {
  groupBuy: FEATURE_GROUP_BUY,
  liveCommerce: FEATURE_LIVE_COMMERCE,
  seller: FEATURE_SELLER,
  brix: FEATURE_BRIX,
  regNormal: FEATURE_REG_NORMAL,
  regGroupBuy: FEATURE_REG_GROUP_BUY,
  productRequest: FEATURE_PRODUCT_REQUEST,
  referral: FEATURE_REFERRAL,
  beeDecoration: FEATURE_BEE_DECORATION,
  themSnow: false,
  themCherry: false,
  themHalloween: false,
  themChristmas: false,
  themValentine: false,
  themRainy: false,
  themSummer: false,
  themAutumn: false,
  // 게임 관리 — 커머스 라이브 이벤트용 기능이라 사주메이트에서는 기본 비활성.
  // 최고관리자가 운영 설정에서 켜면 상담사 사이드바에 다시 노출된다.
  game: false,
};

// Setting 테이블에 저장되는 key
export const FEATURE_SETTING_KEYS: Record<keyof FeatureFlags, string> = {
  groupBuy: "feature.groupBuy",
  liveCommerce: "feature.liveCommerce",
  seller: "feature.seller",
  brix: "feature.brix",
  regNormal: "feature.regNormal",
  regGroupBuy: "feature.regGroupBuy",
  productRequest: "feature.productRequest",
  referral: "feature.referral",
  beeDecoration: "feature.beeDecoration",
  themSnow: "themSnow",
  themCherry: "themCherry",
  themHalloween: "themHalloween",
  themChristmas: "themChristmas",
  themValentine: "themValentine",
  themRainy: "themRainy",
  themSummer: "themSummer",
  themAutumn: "themAutumn",
  game: "feature.game",
};

// 소셜 링크 타입 (클라이언트/서버 공용)
export type SocialLinks = {
  instagramEnabled: boolean;
  instagramUrl: string;
  youtubeEnabled: boolean;
  youtubeUrl: string;
  emailEnabled: boolean;
  emailUrl: string;
};

// 권한 설정 화면의 기능 스위치 그룹 (성격별)
export type FeatureGroupKey = "transaction" | "content" | "member" | "appearance" | "theme";

export const FEATURE_GROUPS: { key: FeatureGroupKey; label: string; desc: string }[] = [
  { key: "transaction", label: "거래·판매", desc: "단체 상담·상담상품 등록/신청 등 거래 관련 기능" },
  { key: "content", label: "콘텐츠·라이브", desc: "라이브 방송과 콘텐츠 피드 기능" },
  { key: "member", label: "회원·가입", desc: "상담사 탐색·추천인 등 회원 관련 기능" },
  { key: "appearance", label: "꾸미기", desc: "앱 시각적 장식 옵션" },
  { key: "theme", label: "테마", desc: "계절·이벤트 테마 효과 (하나만 켜주세요)" },
];

// 권한 설정 화면에서 보여줄 메타 정보 (group = 성격별 분류)
// - desc   : 스위치 한 줄 요약
// - detail : 스위치 아래 회색 소형 텍스트로 노출되는 상세 안내
//            (무엇인지 / 켰을 때 / 껐을 때 / 주의사항)
export const FEATURE_META: {
  key: keyof FeatureFlags;
  label: string;
  desc: string;
  detail: string;
  group: FeatureGroupKey;
}[] = [
  {
    key: "groupBuy",
    label: "단체 상담",
    desc: "단체 상담 캠페인. 끄면 메인/푸터/하단탭/라이브 점집의 공구 섹션과 /campaigns 경로가 비활성화됩니다.",
    detail:
      "상담사가 시간·수량 한정 할인 판매 캠페인(SCHEDULED→ACTIVE→SUCCESS/FAILED)을 만들어 판매하는 단체 상담 기능입니다. 켜면 상담사 대시보드에 '단체 상담 관리' 메뉴가 활성화되어 캠페인을 생성할 수 있고, 고객은 메인·푸터·하단탭·라이브 점집의 공구 섹션과 /campaigns 경로에서 진행 중인 캠페인에 참여해 할인가로 구매할 수 있습니다. 끄면 이미 진행 중인 캠페인 데이터는 보존되지만 관련 섹션·경로가 화면에서 숨겨지고 신규 캠페인 노출과 참여가 중단됩니다. 정산이 얽힌 캠페인이 진행 중일 때는 종료 후 변경을 권장합니다.",
    group: "transaction",
  },
  {
    key: "regNormal",
    label: "상담상품등록 · 일반상담상품",
    desc: "상담상품 등록 시 '일반상담상품' 탭 노출. 기본은 숨김이며, 켜면 상담사·브랜드·중간관리자 등록 화면에 일반상담상품 탭이 나타납니다.",
    detail:
      "상담상품 등록 화면에서 '일반상담상품' 탭의 노출 여부를 제어합니다. 일반상담상품은 단체 상담이 아닌 상시 판매 상담상품을 의미합니다. 켜면 상담사·브랜드사·중간관리자의 상담상품 등록 화면에 일반상담상품 탭이 나타나 상시 판매 상담상품을 새로 등록할 수 있습니다. 기본값은 숨김이며, 끄면 해당 탭이 사라져 신규 일반상담상품 등록 경로만 막히고 이미 등록·판매 중인 상담상품에는 영향을 주지 않습니다.",
    group: "transaction",
  },
  {
    key: "regGroupBuy",
    label: "상담상품등록 · 단체 상담",
    desc: "상담상품 등록 시 '단체 상담' 탭 노출. 기본은 숨김이며, 켜면 상담사·브랜드·중간관리자 등록 화면에 단체 상담 탭이 나타납니다.",
    detail:
      "상담상품 등록 화면에서 '단체 상담' 탭의 노출 여부를 제어합니다. 켜면 상담사·브랜드사·중간관리자의 상담상품 등록 화면에 단체 상담용 상담상품을 만드는 탭이 나타납니다. 기본값은 숨김이며, 끄면 등록 화면에서 단체 상담 탭이 사라집니다. 위 '단체 상담' 스위치가 기능 전체(고객 참여·노출)를 제어한다면, 이 항목은 '등록 화면의 탭 노출'만 별도로 제어합니다.",
    group: "transaction",
  },
  {
    key: "productRequest",
    label: "상담상품신청 메뉴",
    desc: "상담사 상담상품관리의 '상담상품신청'(브랜드 상담상품을 내 점집에 추가) 메뉴 노출. 끄면 상담사 상담상품관리에서 상담상품신청 항목이 사라집니다.",
    detail:
      "상담사가 브랜드사의 승인 상담상품을 골라 자신의 점집에 추가 요청하는 '상담상품신청' 메뉴입니다. 켜면 상담사 상담상품관리에 '상담상품신청' 항목이 나타나, 상담사가 브랜드 상담상품을 자기 점집에 등록 요청할 수 있습니다(브랜드 승인 후 노출). 끄면 상담사 상담상품관리에서 상담상품신청 항목이 사라져 신규 상담상품 추가 신청이 불가능해지며, 이미 승인되어 점집에 노출 중인 상담상품은 그대로 유지됩니다.",
    group: "transaction",
  },
  {
    key: "liveCommerce",
    label: "라이브 상담",
    desc: "라이브 방송. 끄면 하단탭 라이브, 라이브 점집 라이브 섹션, /live 경로, 라이브 관리 메뉴가 비활성화됩니다.",
    detail:
      "상담사가 실시간 방송으로 상담상품을 판매하는 라이브 상담 기능입니다. 켜면 하단탭 라이브, 라이브 점집의 라이브 섹션, /live 뷰어 경로, 상담사 대시보드의 라이브 관리 메뉴가 활성화되어 상담사가 방송을 개설·진행하고 고객이 시청하며 구매할 수 있습니다. 끄면 이 모든 진입점이 화면에서 숨겨지고 신규 라이브 개설·시청이 중단됩니다. 방송 예정·진행 중인 라이브가 있을 때는 종료 후 변경하는 것을 권장합니다.",
    group: "content",
  },
  {
    key: "brix",
    label: "콘텐츠",
    desc: "콘텐츠(브릭스). 끄면 하단탭 콘텐츠, 메인 콘텐츠 섹션, /content 경로, 콘텐츠 관리 메뉴가 비활성화됩니다.",
    detail:
      "상담사가 사진·해시태그·상담상품 태그로 게시물을 올리는 콘텐츠 피드(브릭스)입니다. 켜면 하단탭 콘텐츠, 메인 콘텐츠 섹션, /content 경로, 상담사 대시보드의 콘텐츠 관리 메뉴가 활성화되어 상담사가 게시물을 발행하고 고객이 피드를 탐색하며 태그된 상담상품으로 이동할 수 있습니다. 끄면 관련 진입점이 모두 숨겨지고 신규 콘텐츠 발행이 중단됩니다. 기존 게시물 데이터는 보존되어 다시 켜면 그대로 노출됩니다.",
    group: "content",
  },
  {
    key: "game",
    label: "게임 관리",
    desc: "상담사 게임 관리 기능. 끄면 상담사 사이드바의 게임관리 메뉴가 숨겨집니다.",
    detail:
      "상담사가 시청자 참여를 유도하는 미니게임·이벤트를 운영하는 기능입니다. 켜면 상담사 사이드바에 '게임관리' 메뉴가 나타나 게임을 설정하고 방송 중 진행할 수 있습니다. 끄면 상담사 사이드바에서 게임관리 메뉴가 숨겨지고 신규 게임 운영이 중단되며, 설정해 둔 게임 데이터는 보존됩니다.",
    group: "content",
  },
  {
    key: "seller",
    label: "상담사 탐색",
    desc: "상담사(인플루언서) 둘러보기. 끄면 하단탭 상담사, 메인 인기/추천 상담사 섹션, 푸터 링크, /sellers 경로, 관리자 상담사 관리 메뉴가 비활성화됩니다.",
    detail:
      "고객이 상담사(인플루언서)를 둘러보고 팔로우하는 탐색 기능입니다. 켜면 하단탭 상담사, 메인의 인기·추천 상담사 섹션, 푸터 링크, /sellers 경로, 관리자의 상담사 관리 메뉴가 활성화됩니다. 끄면 이 진입점들이 모두 숨겨져 고객이 상담사 목록을 탐색·팔로우할 수 없게 되며, 개별 상담사 점집의 직접 링크(/shop/...)를 통한 접근에만 의존하게 됩니다.",
    group: "member",
  },
  {
    key: "referral",
    label: "추천인 제도",
    desc: "추천인(레퍼럴) 시스템. 끄면 추천인 코드 입력, 추천인 링크 관리, 추천인 할인/혜택 배너 등 추천인 관련 UI가 모든 곳에서 숨겨집니다.",
    detail:
      "상담사의 추천 코드를 통해 고객에게 할인을, 상담사에게 커미션을 제공하는 레퍼럴 시스템입니다. 켜면 구매·가입 흐름에 추천인 코드 입력란, 추천인 링크 관리, 추천 할인·혜택 배너 등 관련 UI가 노출됩니다. 기본값은 비활성이며, 끄면 추천인 관련 UI가 전 화면에서 숨겨지고 신규 추천 할인이 적용되지 않습니다. 커미션 정산과 직결되므로, 추천이 걸린 예약·캠페인이 진행 중일 때는 변경에 특히 유의하세요.",
    group: "member",
  },
  {
    key: "beeDecoration",
    label: "장식",
    desc: "앱 전반의 이모지 장식 노출. 끄면 PC 여백, 로그인, 대시보드, 각 페이지의 이미지가 모두 숨겨집니다.",
    detail:
      "사주메이트 브랜드 정체성을 담은 이모지·이미지 장식의 전역 노출 여부입니다. 켜면 PC 여백, 로그인, 대시보드, 각 페이지 곳곳에 장식이 표시됩니다. 끄면 앱 전반의 장식이 모두 숨겨져 담백한 화면이 됩니다. 판매·정산 등 기능 동작에는 전혀 영향을 주지 않는 순수 시각 옵션입니다.",
    group: "appearance",
  },
  {
    key: "themSnow",
    group: "theme",
    label: "눈내리기",
    desc: "흰 눈송이 떨어지는 겨울 효과",
    detail:
      "화면 전체에 흰 눈송이가 떨어지는 겨울 시즌 효과입니다. 켜면 모든 방문자의 화면 위에 눈 내리는 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 서로 겹치지 않도록 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themCherry",
    group: "theme",
    label: "벚꽃",
    desc: "분홍 꽃잎 흩날리는 봄 효과",
    detail:
      "분홍 벚꽃 잎이 흩날리는 봄 시즌 효과입니다. 켜면 모든 방문자의 화면에 꽃잎 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themHalloween",
    group: "theme",
    label: "할로윈",
    desc: "호박과 박쥐 떠오르는 할로윈 효과",
    detail:
      "호박과 박쥐가 떠오르는 할로윈 시즌 효과입니다. 켜면 모든 방문자의 화면에 할로윈 장식 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themChristmas",
    group: "theme",
    label: "크리스마스",
    desc: "눈송이와 별이 내리는 크리스마스 효과",
    detail:
      "눈송이와 별이 내리는 크리스마스 시즌 효과입니다. 켜면 모든 방문자의 화면에 크리스마스 장식 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themValentine",
    group: "theme",
    label: "발렌타인",
    desc: "하트가 떠오르는 발렌타인 효과",
    detail:
      "하트가 떠오르는 발렌타인 시즌 효과입니다. 켜면 모든 방문자의 화면에 하트 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themRainy",
    group: "theme",
    label: "빗속 산책",
    desc: "빗줄기 내리는 빗속 산책 효과",
    detail:
      "빗줄기가 내리는 빗속 산책 분위기 효과입니다. 켜면 모든 방문자의 화면에 비 내리는 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themSummer",
    group: "theme",
    label: "여름 해변",
    desc: "버블과 별이 흩날리는 여름 효과",
    detail:
      "버블과 별이 흩날리는 여름 해변 시즌 효과입니다. 켜면 모든 방문자의 화면에 여름 장식 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
  {
    key: "themAutumn",
    group: "theme",
    label: "가을 낙엽",
    desc: "낙엽 떨어지는 가을 효과",
    detail:
      "낙엽이 떨어지는 가을 시즌 효과입니다. 켜면 모든 방문자의 화면에 낙엽 애니메이션이 오버레이되고, 끄면 즉시 사라집니다. 테마 효과는 한 번에 하나만 켜는 것을 권장하며, 기능 동작에는 영향을 주지 않는 시각 효과입니다.",
  },
];
