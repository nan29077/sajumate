"use client";

import { Icon } from '@/components/shared/Icon';
import { useRouter } from "next/navigation";
import { Hexagon } from 'lucide-react';
import { useState } from "react";

const FAQ_ITEMS = [
  { q: "상담은 어떻게 진행되나요?", a: "원하는 상담사의 페이지에서 상담상품과 시간을 선택해 예약·결제하면 됩니다. 예약이 확정되면 마이페이지 > 예약내역에서 일정과 진행 상태를 확인할 수 있으며, 예약한 시간에 상담사가 안내한 방식(라이브·전화 등)으로 상담이 진행됩니다. 상담 시작 전에 알림으로 다시 안내드려요." },
  { q: "예약 취소/환불은 어떻게 하나요?", a: "마이페이지 > 예약내역에서 해당 예약을 선택해 취소를 신청하거나 1대1 문의를 통해 접수해 주세요. 상담 시작 전 취소는 전액 환불되며, 상담 임박 시점이나 진행 이후에는 환불이 제한될 수 있습니다. 자세한 기준은 각 상담상품의 안내를 확인해 주세요. 환불은 접수 후 보통 3~5 영업일 이내에 결제 수단으로 처리됩니다." },
  { q: "상담사가 되려면 어떻게 하나요?", a: "회원가입 시 '상담사' 유형을 선택하거나, 일반 회원으로 가입한 뒤 마이페이지에서 상담사 신청을 하면 됩니다. 운영 중인 SNS 채널(인스타그램·유튜브·틱톡 등) 정보를 함께 제출해 주시면 심사에 도움이 됩니다. 관리자 검토 후 1~3 영업일 이내에 승인 결과가 안내되며, 승인되면 나만의 점집 개설과 라이브 방송 기능이 활성화됩니다." },
  { q: "결제 수단은 무엇이 있나요?", a: "신용카드, 체크카드, 계좌이체, 간편계좌이체, 네이버페이, 카카오페이 등을 지원합니다. 결제 단계에서 원하는 수단을 선택할 수 있으며, 간편계좌이체를 이용하면 계좌번호 입력 없이 빠르게 결제할 수 있습니다. 결제 과정에서 오류가 발생하면 잠시 후 다시 시도하거나 1대1 문의로 알려 주세요." },
  { q: "비밀번호를 잊어버렸어요.", a: "로그인 페이지의 '비밀번호 찾기'를 이용해 주세요. 가입 시 사용한 이메일로 재설정 링크가 발송되며, 링크는 발송 후 일정 시간 동안만 유효합니다. 메일이 보이지 않으면 스팸함을 확인하시고, 그래도 받지 못하셨다면 1대1 문의로 알려 주시면 도와드리겠습니다." },
  { q: "라이브 방송을 보려면 어떻게 하나요?", a: "상담사의 점집 페이지에서 LIVE 뱃지가 표시된 상담사를 클릭하면 진행 중인 실시간 방송을 바로 시청할 수 있습니다. 방송 중에는 채팅으로 상담사와 소통하거나 소개되는 상담상품을 그 자리에서 구매할 수 있습니다. 별도 앱 설치 없이 모바일 웹에서 시청 가능하며, 안정적인 시청을 위해 Wi-Fi 환경을 권장합니다." },
  { q: "상담 후기는 어디서 작성하나요?", a: "마이페이지 > 예약내역에서 완료된 예약을 선택해 후기를 작성할 수 있습니다. 상담 완료 후 일정 기간이 지나면 자동으로 확정 처리되며, 솔직한 후기를 남기면 다른 고객에게 큰 도움이 됩니다. 작성한 후기는 마이페이지에서 언제든 수정하거나 삭제할 수 있습니다." },
];

function HoneycombBg() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="honeycomb" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
          <polygon points="14,2 42,2 56,26 42,46 14,46 0,26" fill="none" stroke="#92400e" strokeWidth="1.2" />
          <polygon points="14,2 42,2 56,26 42,46 14,46 0,26" fill="none" stroke="#92400e" strokeWidth="1.2" transform="translate(28,24)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#honeycomb)" />
    </svg>
  );
}

function PageBanner({ title, subtitle, icon }: { title: string; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-5 py-8 text-center">
      <HoneycombBg />
      <div className="relative z-10">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-white/25 rounded-2xl mb-3 backdrop-blur-sm">
          <span className="text-white">{icon}</span>
        </div>
        <h2 className="text-lg font-extrabold text-white drop-shadow-sm">{title}</h2>
        <p className="text-amber-100 text-xs mt-1">{subtitle}</p>
      </div>
      <span className="absolute right-5 top-3 text-5xl opacity-30 select-none"></span>
      <span className="absolute left-5 bottom-3 text-2xl opacity-20 select-none">🍯</span>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-amber-100 p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-4 bg-amber-400 rounded-full" />
      {children}
    </h3>
  );
}

function FaqPage() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} className="border border-amber-100 rounded-xl overflow-hidden bg-white shadow-sm">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-amber-50 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="text-[13px] font-semibold text-gray-900 pr-4">{item.q}</span>
            {open === i
              ? <Icon name="ChevronDown" size={16} className="text-amber-500 flex-shrink-0 rotate-180" />
              : <Icon name="ChevronDown" size={16} className="text-amber-400 flex-shrink-0" />}
          </button>
          {open === i && (
            <div className="px-4 pb-4 pt-1 bg-amber-50 border-t border-amber-100">
              <p className="text-[13px] text-gray-600 leading-relaxed">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("문의가 접수되었습니다. 영업일 기준 1~2일 내에 답변드리겠습니다.");
    setForm({ name: "", email: "", message: "" });
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-amber-700 mb-1.5">이름</label>
        <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
          placeholder="이름을 입력하세요"
          className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-amber-50/50" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-amber-700 mb-1.5">이메일</label>
        <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})}
          placeholder="email@example.com"
          className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-amber-50/50" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-amber-700 mb-1.5">문의 내용</label>
        <textarea required value={form.message} onChange={e => setForm({...form, message: e.target.value})}
          placeholder="문의 내용을 입력하세요"
          rows={6}
          className="w-full border border-amber-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-amber-50/50 resize-none" />
      </div>
      <button type="submit"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-md shadow-amber-200">
        <Icon name="Message" size={15} strokeWidth={1.5} />
        문의 접수하기
      </button>
    </form>
  );
}

const PAGE_META: Record<string, { subtitle: string; icon: React.ReactNode }> = {
  contact:      { subtitle: "빠르게 답변드릴게요", icon: <Icon name="Message" size={24} strokeWidth={1.5} /> },
  faq:          { subtitle: "궁금한 점을 찾아보세요", icon: <Icon name="Help" size={24} strokeWidth={1.5} /> },
  shipping:     { subtitle: "예약·취소·환불 안내", icon: <Icon name="Calendar" size={24} strokeWidth={1.5} /> },
  terms:        { subtitle: "서비스 이용 약관", icon: <Icon name="File" size={24} strokeWidth={1.5} /> },
  privacy:      { subtitle: "개인정보 보호 정책", icon: <Icon name="Certified" size={24} strokeWidth={1.5} /> },
  "seller-guide": { subtitle: "상담사로 시작하는 방법", icon: <Icon name="Store" size={24} strokeWidth={1.5} /> },
};

const CONTENT: Record<string, { title: string; body: () => React.ReactNode }> = {
  contact: { title: "1대1 문의", body: () => <ContactPage /> },
  faq:     { title: "자주 묻는 질문", body: () => <FaqPage /> },
  shipping: {
    title: "예약·취소·환불 안내",
    body: () => (
      <div className="space-y-3">
        <Card>
          <SectionHeading>예약 확정</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">결제 완료 즉시 예약이 접수되며, 상담사가 확정하면 마이페이지 &gt; 예약내역에서 확인할 수 있습니다. 확정 알림은 앱/이메일로 발송됩니다.</p>
        </Card>
        <Card>
          <SectionHeading>예약 취소</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">마이페이지 &gt; 예약내역에서 직접 취소하거나 1대1 문의로 접수해 주세요. 상담 시작 전에는 전액 환불이 원칙이며, 상담 임박 시점(24시간 이내)에는 환불이 제한될 수 있습니다.</p>
        </Card>
        <Card>
          <SectionHeading>상담 예약 취소와 환불</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">상담 시작 전에는 상담사별 취소 가능 시간과 환불 정책을 확인해 주세요. 결제 취소가 승인되면 이용한 결제수단으로 환불됩니다.</p>
        </Card>
        <Card>
          <SectionHeading>환불 처리 기간</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">취소·환불 접수 후 보통 3~5 영업일 이내에 결제 수단으로 처리됩니다. 카드사 사정에 따라 다소 늦어질 수 있습니다.</p>
        </Card>
      </div>
    ),
  },
  terms: {
    title: "이용약관",
    body: () => (
      <div className="space-y-3">
        <Card>
          <SectionHeading>제1조 (목적)</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">이 약관은 사주메이트(이하 "회사")가 운영하는 마켓플레이스 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 회원 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
        </Card>
        <Card>
          <SectionHeading>제2조 (정의)</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">"회원"이란 회사의 서비스에 접속하여 이 약관에 따라 회사와 이용계약을 체결하고 회사가 제공하는 서비스를 이용하는 고객을 말합니다.</p>
        </Card>
        <Card>
          <SectionHeading>제3조 (서비스 이용)</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">서비스 이용은 회사의 업무상 또는 기술상 특별한 지장이 없는 한 연중무휴, 1일 24시간 운영을 원칙으로 합니다. 시스템 점검 등의 이유로 일시 중단될 수 있습니다.</p>
        </Card>
        <Card>
          <SectionHeading>제4조 (회원의 의무)</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">회원은 서비스 이용 시 관계 법령, 이 약관, 이용 안내 및 서비스와 관련하여 공지한 주의사항을 준수하여야 합니다.</p>
        </Card>
        <p className="text-amber-400 text-xs text-center pt-1">본 약관은 2025년 1월 1일부터 시행됩니다.</p>
      </div>
    ),
  },
  privacy: {
    title: "개인정보처리방침",
    body: () => (
      <div className="space-y-3">
        <Card>
          <SectionHeading>수집하는 개인정보 항목</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">회원가입 시: 이름, 이메일, 비밀번호. 서비스 이용 시: 예약·상담 내역, 결제정보. 자동 수집: IP주소, 쿠키, 방문 기록.</p>
        </Card>
        <Card>
          <SectionHeading>개인정보 수집 및 이용 목적</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">회원 관리, 서비스 제공, 예약 및 상담 진행, 고객 상담, 마케팅 및 광고에 활용합니다.</p>
        </Card>
        <Card>
          <SectionHeading>개인정보 보유 기간</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">회원 탈퇴 시까지 보유하며, 관련 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 동안 보관합니다.</p>
        </Card>
        <Card>
          <SectionHeading>개인정보 파기</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">보유 기간 만료 시 지체 없이 파기합니다. 전자적 파일은 복구 불가능한 방법으로 영구 삭제합니다.</p>
        </Card>
        <p className="text-amber-400 text-xs text-center pt-1">본 방침은 2025년 1월 1일부터 적용됩니다.</p>
      </div>
    ),
  },
  "seller-guide": {
    title: "상담사 신청 안내",
    body: () => (
      <div className="space-y-3">
        <Card>
          <SectionHeading>상담사란?</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">상담사는 사주·타로·운세 등 자신만의 상담 서비스를 나만의 점집에 등록하고 고객에게 제공하는 전문가입니다. 예약·결제·라이브 방송 기능을 모두 플랫폼에서 지원합니다.</p>
        </Card>
        <Card>
          <SectionHeading>신청 자격</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">사주·타로·운세·심리상담 등 역술·상담 분야에서 활동 중이거나 준비 중인 누구나 신청 가능합니다. SNS 채널이 있으면 심사에 도움이 됩니다.</p>
        </Card>
        <Card>
          <SectionHeading>신청 방법</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">회원가입 시 '상담사'를 선택하거나, 일반 회원으로 가입 후 마이페이지에서 상담사 신청을 할 수 있습니다. 관리자 검토 후 1~3 영업일 내 결과가 안내됩니다.</p>
        </Card>
        <Card>
          <SectionHeading>상담료 수익</SectionHeading>
          <p className="text-[13px] text-gray-600 leading-relaxed">고객이 상담을 예약·결제하면 상담료에서 플랫폼 수수료를 제한 금액이 수익으로 발생합니다. 상담 완료와 취소 가능 기간 확인 후 정산 가능 금액으로 전환됩니다.</p>
        </Card>
        <a href="/seller-apply"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-md shadow-amber-200 mt-2">
          <Icon name="Store" size={15} strokeWidth={1.5} />
          상담사 신청하기
        </a>
      </div>
    ),
  },
};

/** DB에 저장된 자유 형식(HTML/텍스트) 콘텐츠를 테마 카드로 렌더링 */
function parseSections(raw: string): { heading: string; body: string }[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.type === "sections" && Array.isArray(parsed.sections)) {
      return parsed.sections;
    }
  } catch {
    /* JSON이 아니면 무시 */
  }
  return null;
}

function DbContentBody({ content }: { content: string }) {
  const sections = parseSections(content);
  if (sections) {
    return (
      <div className="space-y-3">
        {sections.map((s, i) => (
          <Card key={i}>
            <SectionHeading>{s.heading}</SectionHeading>
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{s.body}</p>
          </Card>
        ))}
      </div>
    );
  }
  // HTML/일반 텍스트 fallback — 카드 안에 표시
  return (
    <Card>
      <div
        className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line prose-sm"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </Card>
  );
}

export interface DbContent {
  slug: string;
  title: string;
  content: string;
}

export default function SupportContent({
  slug,
  dbContent,
}: {
  slug: string;
  dbContent?: DbContent | null;
}) {
  const router = useRouter();
  const hardcoded = CONTENT[slug];
  const meta = PAGE_META[slug];

  // DB에 저장된 콘텐츠가 있으면 우선 사용 (관리자 편집/추가 내용 반영)
  const hasDb = !!(dbContent && dbContent.content && dbContent.content.trim().length > 0);

  if (!hardcoded && !hasDb) {
    return (
      <div className="max-w-[480px] mx-auto min-h-screen bg-amber-50 flex flex-col items-center justify-center px-4">
        <Hexagon size={48} strokeWidth={1} className="fill-amber-100 text-amber-400 mb-4" />
        <p className="text-amber-700 text-sm font-medium">페이지를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const title = dbContent?.title || hardcoded?.title || "고객센터";
  const subtitle = meta?.subtitle ?? "사주메이트 고객센터";
  const icon = meta?.icon ?? <Icon name="File" size={24} strokeWidth={1.5} />;

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-amber-50 pb-20">
      {/* 상단 네비게이션 바 */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-amber-100 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          className="p-1.5 text-amber-600 hover:text-amber-800 transition-colors"
          aria-label="뒤로가기"
        >
          <Icon name="ArrowRight" size={20} strokeWidth={1.5} className="rotate-180" />
        </button>
        <h1 className="text-[15px] font-bold text-gray-900">{title}</h1>
      </div>

      {/* 배너 */}
      <PageBanner title={title} subtitle={subtitle} icon={icon} />

      {/* 본문 */}
      <div className="px-4 pt-5">
        {hasDb ? (
          <DbContentBody content={dbContent!.content} />
        ) : slug === "faq" || slug === "contact" ? (
          <Card>{hardcoded.body()}</Card>
        ) : (
          hardcoded.body()
        )}
      </div>
    </div>
  );
}
