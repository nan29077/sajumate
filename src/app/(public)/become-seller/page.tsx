import { Icon } from '@/components/shared/Icon';
import Link from "next/link";
import { getFeatureFlags } from "@/lib/settings";
import { TrendingUp, Radio, Star, ShieldCheck, Users, ArrowRight, Sparkles } from 'lucide-react';

export const dynamic = "force-dynamic";

export const metadata = {
  title: "상담사로 신청하기 | 사주메이트",
  description: "사주메이트 상담사가 되어 내 팬과 함께 나만의 점집을 운영하세요.",
};

// 별자리 패턴 — 검정 히어로 위에 은은한 별밭을 깔기 위한 인라인 SVG.
const STARFIELD =
  "url(\"data:image/svg+xml,%3Csvg width='120' height='120' viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c4b5fd' fill-opacity='0.22'%3E%3Ccircle cx='12' cy='18' r='1.4'/%3E%3Ccircle cx='46' cy='8' r='1'/%3E%3Ccircle cx='84' cy='24' r='1.6'/%3E%3Ccircle cx='108' cy='10' r='1'/%3E%3Ccircle cx='26' cy='52' r='1'/%3E%3Ccircle cx='64' cy='44' r='1.3'/%3E%3Ccircle cx='98' cy='58' r='1'/%3E%3Ccircle cx='8' cy='86' r='1.2'/%3E%3Ccircle cx='42' cy='78' r='1.5'/%3E%3Ccircle cx='76' cy='92' r='1'/%3E%3Ccircle cx='112' cy='84' r='1.3'/%3E%3Ccircle cx='58' cy='112' r='1.1'/%3E%3Ccircle cx='22' cy='108' r='1'/%3E%3Ccircle cx='94' cy='114' r='1.4'/%3E%3C/g%3E%3C/svg%3E\")";

const BOTTOM_BANNER = "/banners/sajumate/consultant-cta-v2.jpg";

const BENEFITS = [
  { icon: Star, title: "준비물은 실력뿐", desc: "상담 상품과 가능한 시간만 등록하면 끝. 예약 접수·결제·알림은 사주메이트가 대신해요." },
  { icon: TrendingUp, title: "예약 수익", desc: "내 점집에서 예약이 확정될 때마다 수익이 쌓여요. 방송이 곧 매출이 돼요." },
  { icon: Radio, title: "라이브 상담", desc: "실시간 라이브 방송으로 팬과 소통하며 그 자리에서 예약을 받을 수 있어요." },
  { icon: Users, title: "단골 팬 관리", desc: "단골로 등록한 팬이, 라이브·새 소식 알림으로 다시 찾아와요." },
  { icon: ShieldCheck, title: "안심 정산", desc: "투명한 정산 체계로 수익을 정해진 주기에 안전하게 지급받아요." },
];

const STEPS = [
  { title: "상담사 신청", desc: "아래 버튼으로 상담사 회원가입을 진행해요." },
  { title: "관리자 승인", desc: "보통 1~2 영업일 내 심사 후 승인돼요." },
  { title: "점집 개설 & 상담 상품 등록", desc: "내 점집을 꾸미고 상담 상품과 가능한 시간을 등록해요." },
  { title: "예약 & 정산", desc: "점집·라이브로 예약을 받고 수익을 정산받아요." },
];

const FAQ = [
  { q: "상담사가 되려면 비용이 드나요?", a: "입점/가입 비용은 없습니다. 예약이 발생하면 약정된 수수료 구조로 정산됩니다." },
  { q: "상담 상품은 어떻게 등록하나요?", a: "사주·신점·타로 등 내가 진행하는 상담을 상품으로 직접 등록하고, 가능한 상담 시간을 함께 설정하면 됩니다." },
  { q: "승인까지 얼마나 걸리나요?", a: "일반적으로 1~2 영업일 이내에 관리자 검토 후 승인됩니다." },
  { q: "팔로워(팬)가 적어도 신청할 수 있나요?", a: "네, 누구나 신청할 수 있어요. 사주메이트의 단골·라이브 기능으로 팬을 키워갈 수 있습니다." },
];

export default async function BecomeSellerPage() {
  const { beeDecoration: SHOW_BEES } = await getFeatureFlags();
  return (
    <div className="bg-white min-h-screen pb-40">
      {/* ───── 히어로 (사주메이트 밤하늘 + 별밭) ───── */}
      <section className="relative overflow-hidden bg-brand-950">
        <div className="absolute inset-0" style={{ backgroundImage: STARFIELD }} />
        <div className="absolute -top-16 -right-12 w-56 h-56 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative px-6 pt-12 pb-11 text-white">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-moon-100 ring-1 ring-inset ring-white/10 px-3 py-1 mb-4">
            <Icon name="Store" size={12} strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold tracking-wide">CONSULTANT PROGRAM</span>
          </div>
          <div className="flex items-start gap-3">
            <h1 className="text-[28px] font-extrabold leading-tight">
              내 팬과 함께,
              <br />나만의 <span className="text-moon-500">점집</span>을 열다
            </h1>
            {SHOW_BEES && <Sparkles size={48} strokeWidth={1.3}
              className="w-12 h-12 text-moon-500 mt-1 pointer-events-none select-none flex-shrink-0 opacity-80" aria-hidden="true" />}
          </div>
          <p className="mt-3.5 text-[13px] text-gray-300 leading-relaxed">
            상담 상품과 가능한 시간만 등록하면,
            <br />라이브와 단골 관리로 나만의 점집이 열려요.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white px-3 py-1.5"><Icon name="Wallet" size={12} className="text-moon-500" /> 예약 수익</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white px-3 py-1.5"><Icon name="Live" size={12} className="text-red-400" /> 라이브 예약</span>
          </div>
        </div>
      </section>

      {/* ───── 상담사 혜택 ───── */}
      <section className="px-5 pt-9">
        <div className="flex items-center gap-2">
          <h2 className="text-[19px] font-extrabold text-gray-900">상담사 혜택</h2>
          {SHOW_BEES && <Sparkles size={36} strokeWidth={1.3}
            className="w-9 h-9 text-brand-500 pointer-events-none select-none opacity-75" aria-hidden="true" />}
        </div>
        <p className="mt-1 text-[12px] text-gray-400">사주메이트가 상담사에게 드리는 것들</p>
        <div className="mt-4 space-y-2">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="flex items-start gap-3 rounded-2xl border border-gray-100 p-4">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-gray-900">{b.title}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── 진행 절차 ───── */}
      <section className="px-5 pt-9">
        <h2 className="text-[19px] font-extrabold text-gray-900">신청 절차</h2>
        <div className="mt-4 space-y-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-gray-100 px-4 py-3.5">
              <div className="w-7 h-7 rounded-full bg-brand-600 text-white text-[12px] font-extrabold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[13px] font-bold text-gray-900">{s.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 지금 상담사가 되면 (체크리스트, 검정+노랑) ───── */}
      <section className="px-5 pt-9">
        <div className="relative overflow-hidden rounded-3xl bg-gray-900 p-6 text-white">
          <div className="absolute inset-0" style={{ backgroundImage: STARFIELD }} />
          <div className="relative">
            <h3 className="text-[16px] font-extrabold flex items-center gap-1.5">
              <Icon name="Store" size={16} className="text-brand-500" /> 지금 상담사가 되면
            </h3>
            <ul className="mt-3.5 space-y-2.5">
              {["가입·입점 비용 0원", "상담 상품·시간 자유 등록", "라이브·영상 상담 예약 채널 제공", "투명한 수익 정산"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13px] text-gray-100">
                  <span className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                    <Icon name="Check" size={13} strokeWidth={3} className="text-black" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───── 자주 묻는 질문 ───── */}
      <section className="px-5 pt-9">
        <h2 className="text-[19px] font-extrabold text-gray-900">자주 묻는 질문</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border border-gray-100 p-4">
              <p className="text-[13px] font-bold text-gray-900 flex items-start gap-1.5">
                <span className="text-brand-600">Q.</span> {f.q}
              </p>
              <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed pl-5">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── 하단 배너 (사주메이트 상담사 CTA) + 카피 ───── */}
      <section className="px-4 pt-9">
        <div className="relative rounded-3xl overflow-hidden">
          <div
            className="aspect-[16/10] bg-cover bg-center"
            style={{ backgroundImage: `url(${BOTTOM_BANNER})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/85 via-gray-900/35 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <p className="text-[16px] font-extrabold leading-snug">상담이 아니라, 당신을 찾아오는 팬</p>
            <p className="text-[12px] text-gray-200 mt-1 leading-relaxed">
              사주메이트에서는 상담사의 실력과 신뢰가 곧 브랜드가 됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* ───── 하단 고정 CTA — 하단 탭바(약 3.5rem) 위에 항상 노출 ───── */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[55] px-4 pt-3 pb-3 bg-gradient-to-t from-white via-white to-white/0"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
           href="/auth/register?role=CONSULTANT"
          className="block w-full py-3.5 bg-gray-900 text-white font-bold text-sm text-center rounded-xl hover:bg-gray-800 transition-colors"
        >
          상담사 신청하기
        </Link>
      </div>
    </div>
  );
}
