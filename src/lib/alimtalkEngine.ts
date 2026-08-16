import { prisma } from "@/lib/prisma";
import {
  sendAlimtalk,
  fetchAligoTemplates,
  isAligoConfigured,
  type AligoTemplate,
  type AligoButton,
  type AligoRecipient,
} from "@/lib/aligo";
import { logAligoSend } from "@/lib/aligoLog";

// ─────────────────────────────────────────────────────────────
// 용도(purpose) 레지스트리
// 각 용도에서 코드가 공급하는 변수 목록. 관리자가 템플릿을 매핑할 때
// 템플릿의 #{변수}가 이 목록 안에 있어야 발송 가능하다.
// ─────────────────────────────────────────────────────────────
export interface AlimtalkPurposeDef {
  label: string;
  description: string;
  variables: string[]; // 코드가 공급하는 변수명 (#{} 제외)
  sampleVariables: Record<string, string>; // 테스트 발송용 예시 값
}

export const ALIMTALK_PURPOSES: Record<string, AlimtalkPurposeDef> = {
  // ⚠️ variables / sampleVariables 의 한글 키는 카카오 승인 템플릿의 #{변수}와 1:1로 매칭된다.
  //    리브랜딩 대상이 아니며 변경하면 알림톡 발송이 차단된다. (label·description만 문구 변경)
  LIVE_START: {
    label: "라이브 방송시작 알림",
    description: "상담사가 방송을 시작하면 알림 수신에 동의한 팔로워에게 발송",
    variables: ["셀러명", "방송제목", "shopid", "livecode"],
    sampleVariables: { "셀러명": "테스트점집", "방송제목": "테스트 방송", shopid: "test", livecode: "test1234" },
  },
  ORDER_PLACED: {
    label: "예약접수 알림 (상담사에게)",
    description: "고객 결제가 완료되면 해당 점집 상담사에게 예약 접수를 통보",
    variables: ["셀러샵명", "주문자명", "예약번호", "예약일", "예약시간", "결제금액"],
    sampleVariables: { "셀러샵명": "테스트점집", "주문자명": "홍길동", "예약번호": "RSV-TEST-0001", "예약일": "2026-08-20", "예약시간": "14:00", "결제금액": "10,000" },
  },
  RESERVATION_CONFIRMED: {
    label: "예약 확정 안내 (고객에게)",
    description: "상담사가 예약을 확정하면 고객에게 상담 일정을 안내",
    variables: ["고객명", "셀러샵명", "예약일", "예약시간"],
    sampleVariables: { "고객명": "홍길동", "셀러샵명": "테스트점집", "예약일": "2026-08-20", "예약시간": "14:00" },
  },
  SIGNUP_WELCOME: {
    label: "회원가입 환영 (고객에게)",
    description: "고객 회원가입 직후 환영 메시지 발송 (카카오 승인 조건: 가입 즉시 발송)",
    variables: ["고객명", "셀러샵명"],
    sampleVariables: { "고객명": "홍길동", "셀러샵명": "사주메이트" },
  },
  RESERVATION_CANCELLED: {
    label: "예약 취소 안내 (고객에게)",
    description: "결제취소 승인 완료 시 고객에게 취소·환불 처리 결과를 안내",
    variables: ["고객명", "셀러샵명", "예약번호", "예약일"],
    sampleVariables: { "고객명": "홍길동", "셀러샵명": "테스트점집", "예약번호": "RSV-TEST-0001", "예약일": "2026-08-20" },
  },
};

// 템플릿 미매핑 시 env로 대체할 용도 (기존 동작 호환)
const ENV_FALLBACK_TPL: Record<string, string | undefined> = {
  LIVE_START: process.env.ALIGO_LIVE_START_TPL_CODE,
};

// ─────────────────────────────────────────────────────────────
// 알리고 템플릿 캐시 (10분) — 발송 시 원문을 그대로 사용해
// 코드-템플릿 본문 불일치를 원천 차단한다.
// ─────────────────────────────────────────────────────────────
let templateCache: { at: number; list: AligoTemplate[] } | null = null;
const TEMPLATE_CACHE_MS = 10 * 60 * 1000;

export async function getAligoTemplates(force = false): Promise<AligoTemplate[]> {
  if (!force && templateCache && Date.now() - templateCache.at < TEMPLATE_CACHE_MS) {
    return templateCache.list;
  }
  const list = await fetchAligoTemplates();
  if (list.length > 0) templateCache = { at: Date.now(), list };
  return list;
}

/** 본문/버튼 URL의 #{변수}를 치환한다. 못 채운 변수 목록을 함께 반환. */
export function substituteTemplateVars(
  text: string,
  variables: Record<string, string>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(/#\{([^}]+)\}/g, (raw, name: string) => {
    const key = name.trim();
    if (variables[key] !== undefined) return variables[key];
    missing.push(key);
    return raw;
  });
  return { text: out, missing };
}

export interface TemplatedSendResult {
  notified: boolean;
  reason?: string;
  attempted?: number;
  successCount?: number;
  failCount?: number;
  mids?: number[];
  tplCode?: string;
}

/**
 * 용도(purpose) 기반 알림톡 발송.
 * DB 매핑 설정 → 알리고 템플릿 원문 조회 → 변수 치환 → 발송 → aligo_send_logs 기록.
 * 설정/승인/변수 문제는 에러가 아니라 "건너뜀"으로 처리해 호출측 흐름을 막지 않는다.
 */
export async function sendTemplatedAlimtalk(opts: {
  purpose: keyof typeof ALIMTALK_PURPOSES | string;
  variables: Record<string, string>;
  recipients: AligoRecipient[];
  sellerId?: string | null;
  liveStreamId?: string | null;
}): Promise<TemplatedSendResult> {
  const { purpose, variables, recipients } = opts;

  if (!isAligoConfigured()) return { notified: false, reason: "알리고 미설정" };
  if (recipients.length === 0) return { notified: false, reason: "발송 대상 없음" };

  // 1) 용도 → 템플릿 매핑 조회 (없으면 env fallback)
  const setting = await prisma.alimtalkTemplateSetting.findUnique({ where: { purpose } });
  if (setting && !setting.enabled) return { notified: false, reason: "관리자 설정에서 비활성화됨" };
  const tplCode = setting?.tplCode || ENV_FALLBACK_TPL[purpose] || "";
  if (!tplCode) return { notified: false, reason: "템플릿이 매핑되지 않음 (관리자 → 알림톡 관리)" };

  // 2) 알리고에서 템플릿 원문 조회
  const templates = await getAligoTemplates();
  const tpl = templates.find((t) => t.templtCode === tplCode);
  if (!tpl) return { notified: false, reason: `알리고에 템플릿 없음 (${tplCode})`, tplCode };
  if (tpl.inspStatus !== "APR") {
    return { notified: false, reason: `템플릿 미승인 상태 (${tplCode}, ${tpl.inspStatus === "REQ" || tpl.inspStatus === "REG" ? "검수중/등록" : "반려"})`, tplCode };
  }

  // 3) 변수 치환 (본문 + 버튼 URL) — 못 채운 변수가 있으면 발송하지 않는다
  const body = substituteTemplateVars(tpl.templtContent, variables);
  const missing = new Set(body.missing);
  const buttons: AligoButton[] = (tpl.buttons || []).map((b) => {
    const out: AligoButton = {
      name: b.name,
      linkType: b.linkType as AligoButton["linkType"],
      linkTypeName: b.linkTypeName,
    };
    if (b.linkMo) {
      const sub = substituteTemplateVars(b.linkMo, variables);
      sub.missing.forEach((m) => missing.add(m));
      out.linkMo = sub.text;
    }
    if (b.linkPc) {
      const sub = substituteTemplateVars(b.linkPc, variables);
      sub.missing.forEach((m) => missing.add(m));
      out.linkPc = sub.text;
    }
    return out;
  });
  if (missing.size > 0) {
    const reason = `템플릿 변수 누락: ${Array.from(missing).join(", ")}`;
    await logAligoSend({
      sellerId: opts.sellerId, kind: "ALIMTALK", purpose, templateCode: tplCode,
      recipientCount: recipients.length, acceptedCount: 0, failCount: recipients.length,
      errorMessage: reason, liveStreamId: opts.liveStreamId,
    });
    return { notified: false, reason, tplCode };
  }

  // 4) 발송 + 기록
  const label = ALIMTALK_PURPOSES[purpose]?.label || purpose;
  const sendResult = await sendAlimtalk({
    tplCode,
    subject: label.slice(0, 40),
    message: body.text,
    buttons,
    recipients,
  });

  await logAligoSend({
    sellerId: opts.sellerId,
    kind: "ALIMTALK",
    purpose,
    templateCode: tplCode,
    recipientCount: sendResult.attempted,
    acceptedCount: sendResult.successCount,
    failCount: sendResult.failCount,
    cost: sendResult.cost,
    mids: sendResult.mids,
    errorMessage: sendResult.errors.join("; ") || null,
    liveStreamId: opts.liveStreamId,
  });

  return {
    notified: sendResult.successCount > 0,
    reason: sendResult.ok ? undefined : sendResult.errors.join("; "),
    attempted: sendResult.attempted,
    successCount: sendResult.successCount,
    failCount: sendResult.failCount,
    mids: sendResult.mids,
    tplCode,
  };
}

/**
 * 용도에 매핑된 템플릿이 코드가 공급하는 변수만 요구하는지 검증한다.
 * 관리자 화면에서 매핑 저장 전 경고용.
 */
export function checkTemplateCompatibility(
  purpose: string,
  tpl: AligoTemplate,
): { ok: boolean; unknownVariables: string[] } {
  const def = ALIMTALK_PURPOSES[purpose];
  if (!def) return { ok: false, unknownVariables: [] };
  const provided = new Set(def.variables);
  const found = new Set<string>();
  const collect = (text?: string) => {
    for (const m of (text || "").matchAll(/#\{([^}]+)\}/g)) found.add(m[1].trim());
  };
  collect(tpl.templtContent);
  for (const b of tpl.buttons || []) {
    collect(b.linkMo);
    collect(b.linkPc);
  }
  const unknown = Array.from(found).filter((v) => !provided.has(v));
  return { ok: unknown.length === 0, unknownVariables: unknown };
}
