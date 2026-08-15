"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, Mail, Bot, User, Coffee, Loader2 } from 'lucide-react';

const DETAIL_PATHS = [/^\/products\/[^/]+$/, /^\/cart$/];

const DEFAULT_FAQ_DATA = [
  { q: "상담 방식은 얼마나 걸리나요?", a: "일반 상담 방식은 결제 완료 후 2~5일 이내에 진행됩니다." },
  { q: "교환/반품은 어떻게 하나요?", a: "상담상품 수령 후 7일 이내 마이페이지 > 예약내역에서 교환/반품 신청이 가능합니다." },
  { q: "상담사가 되려면 어떻게 하나요?", a: "회원가입 후 상담사 신청 페이지에서 사업자 정보를 입력하시면 관리자 승인 후 상담사 활동이 가능합니다." },
  { q: "결제 수단은 무엇이 있나요?", a: "신용카드, 체크카드, 네이버페이, 카카오페이, 토스페이 등 다양한 결제 수단을 지원합니다." },
  { q: "할인 코드는 어떻게 사용하나요?", a: "결제 시 할인 코드 입력란에 코드를 입력하면 자동으로 할인이 적용됩니다." },
];

interface ChatMessage { role: "user" | "bot"; text: string; }

interface ContactSettings {
  phone: string;
  email: string;
  operatingHours: string;
  lunchBreak: string;
  offHoursNotice: string;
  chatTerminationNotice: string;
  faqs: { id: string; question: string; answer: string; isActive: boolean; sortOrder: number }[];
}

export default function FloatingButtons() {
  const [showContact, setShowContact] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showInquiry, setShowInquiry] = useState(false); // 1:1 문의 폼
  const [isDesktop, setIsDesktop] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "";
  const { data: authSession } = useSession();

  // 챗봇 활성화 여부 (관리자 ON/OFF). null=로딩중
  const [chatbotEnabled, setChatbotEnabled] = useState<boolean | null>(null);

  // 1:1 문의 폼 상태
  const [inquiryForm, setInquiryForm] = useState({ name: "", email: "", message: "" });
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySubmitted, setInquirySubmitted] = useState(false);
  const [inquiryError, setInquiryError] = useState("");

  // 챗봇 활성화 여부 조회 (OFF면 렌더링 안 함)
  useEffect(() => {
    fetch("/api/public/chatbot-status")
      .then((r) => r.json())
      .then((d) => setChatbotEnabled(Boolean(d?.enabled)))
      .catch(() => setChatbotEnabled(true)); // 오류 시 노출 유지
  }, []);

  // 로그인 사용자 정보로 문의 폼 자동 채움
  useEffect(() => {
    if (authSession?.user) {
      setInquiryForm((prev) => ({
        ...prev,
        name: prev.name || authSession.user?.name || "",
        email: prev.email || authSession.user?.email || "",
      }));
    }
  }, [authSession]);

  // Contact settings from admin
  const [contactSettings, setContactSettings] = useState<ContactSettings | null>(null);
  const [faqData, setFaqData] = useState<{ q: string; a: string }[]>(DEFAULT_FAQ_DATA);

  useEffect(() => {
    fetch("/api/admin/contact-settings")
      .then((r) => r.json())
      .then((data: ContactSettings) => {
        setContactSettings(data);
        if (data.faqs && data.faqs.length > 0) {
          const activeFaqs = data.faqs
            .filter((f) => f.isActive)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((f) => ({ q: f.question, a: f.answer }));
          if (activeFaqs.length > 0) setFaqData(activeFaqs);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize chat message
  useEffect(() => {
    if (showChat && chatMessages.length === 0) {
      const greeting = contactSettings
        ? `안녕하세요! 사주메이트 고객센터입니다.
${contactSettings.operatingHours} | ${contactSettings.lunchBreak}
궁금한 점이 있으시면 아래 질문을 선택하거나 직접 입력해주세요.`
        : "안녕하세요! 사주메이트 고객센터입니다. 궁금한 점이 있으시면 아래 자주 묻는 질문을 선택하거나, 직접 입력해주세요.";
      setChatMessages([{ role: "bot", text: greeting }]);
    }
  }, [showChat]);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth > 640);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  // PC 사이드바의 "문의하기" 버튼에서 발생하는 이벤트 처리
  useEffect(() => {
    const handler = () => { setShowContact(true); setShowChat(false); };
    window.addEventListener("open-contact", handler);
    return () => window.removeEventListener("open-contact", handler);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const isDetailPage = DETAIL_PATHS.some((p) => p.test(pathname));
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  // 상담상품/캠페인 상세 페이지: 구매 바(bottom-14=56px + 높이~72px = ~128px)보다 위에 위치
  // 일반 페이지: 하단 탭바(56px) + 여백
  const scrollTopBottom = isDetailPage
    ? "calc(140px + env(safe-area-inset-bottom, 0px))"
    : "calc(76px + env(safe-area-inset-bottom, 0px))";
  // 문의 버튼은 위로가기 버튼(40px 높이) 바로 위
  const bottomOffset = isDetailPage
    ? "calc(140px + 50px + env(safe-area-inset-bottom, 0px))"
    : "calc(76px + 50px + env(safe-area-inset-bottom, 0px))";

  // PC: 사이드바(left: calc(50% + 248px)) 왼쪽에 겹치지 않게 배치
  // 버튼/팝업 오른쪽 edge = calc(50% + 240px) < 사이드바 왼쪽 calc(50% + 248px)
  const pcRightPosition = "calc(50% - 240px)";
  const mobileRightPosition = "max(1rem, calc((100vw - 480px) / 2 + 1rem))";
  const rightPosition = isDesktop ? pcRightPosition : mobileRightPosition;
  const pcBottomOffset = "2rem";

  const phoneNumber = contactSettings?.phone || "02-1234-5678";

  const handleFaqClick = (faq: { q: string; a: string }) => {
    setChatMessages(prev => [...prev, { role: "user", text: faq.q }, { role: "bot", text: faq.a }]);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const input = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: input }]);
    
    const match = faqData.find(f => {
      const keywords = f.q.replace(/[?은를이가는의에서도]/g, " ").split(/\s+/);
      return keywords.some(kw => kw.length > 1 && input.includes(kw));
    });

    setTimeout(() => {
      if (match) {
        setChatMessages(prev => [...prev, { role: "bot", text: match.a }]);
      } else {
        const fallback = `해당 문의는 상담원 연결이 필요합니다. 1:1 문의를 남겨주시면 빠르게 답변드리겠습니다.
고객센터: ${phoneNumber}`;
        setChatMessages(prev => [...prev, { role: "bot", text: fallback }]);
      }
    }, 500);
  };

  const handleEndChat = () => {
    const notice = contactSettings?.chatTerminationNotice || "상담이 종료되었습니다. 추가 문의사항이 있으시면 다시 문의해 주세요.";
    setChatMessages(prev => [...prev, { role: "bot", text: notice }]);
  };

  // 1:1 문의 전송
  const handleSubmitInquiry = async () => {
    setInquiryError("");
    const name = inquiryForm.name.trim();
    const email = inquiryForm.email.trim();
    const message = inquiryForm.message.trim();
    if (!name || !email || !message) {
      setInquiryError("이름, 이메일, 문의 내용을 모두 입력해 주세요.");
      return;
    }
    setInquirySubmitting(true);
    try {
      const res = await fetch("/api/public/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, category: "1:1 채팅" }),
      });
      if (res.ok) {
        setInquirySubmitted(true);
        setInquiryForm((prev) => ({ ...prev, message: "" }));
      } else {
        const data = await res.json().catch(() => ({}));
        setInquiryError(data?.error || "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setInquiryError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setInquirySubmitting(false);
    }
  };

  const openInquiry = () => {
    setShowInquiry(true);
    setShowContact(false);
    setInquirySubmitted(false);
    setInquiryError("");
  };

  // 챗봇이 비활성화된 경우 아무것도 렌더링하지 않음
  if (chatbotEnabled === false) return null;

  return (
    <>
      {/* Chat Window */}
      {showChat && (
        <div className="fixed z-[60] animate-fade-in" style={{
          bottom: isDesktop ? "1rem" : "4.5rem",
          right: isDesktop ? pcRightPosition : "1rem",
          width: isDesktop ? "340px" : "calc(100vw - 2rem)",
          maxWidth: "380px",
        }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: isDesktop ? "520px" : "70vh" }}>
            {/* Header */}
            <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bot size={18} /> <span className="text-sm font-bold">사주메이트 FAQ</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleEndChat} className="p-1 hover:bg-white/20 rounded-lg text-[10px] px-2 py-1 bg-white/10">종료</button>
                <button onClick={() => setShowChat(false)} className="p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
              </div>
            </div>

            {/* Operating hours notice */}
            {contactSettings && (
              <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex-shrink-0">
                <p className="text-[10px] text-blue-600 flex items-center gap-1">
                  <Icon name="Clock" size={10} />
                  {contactSettings.operatingHours} · {contactSettings.lunchBreak}
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${
                    msg.role === "user" ? "bg-brand-600 text-white rounded-br-md" : "bg-white text-gray-800 border border-gray-100 rounded-bl-md"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* FAQ Buttons */}
            {chatMessages.length <= 2 && (
              <div className="px-3 py-2 border-t border-gray-100 bg-white flex-shrink-0">
                <p className="text-[10px] text-gray-400 mb-1.5">자주 묻는 질문</p>
                <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto">
                  {faqData.slice(0, 6).map((faq, idx) => (
                    <button key={idx} onClick={() => handleFaqClick(faq)}
                      className="text-[11px] px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-full hover:bg-brand-50 hover:text-brand-600 transition-colors">
                      {faq.q.length > 15 ? faq.q.slice(0, 15) + "..." : faq.q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="질문을 입력하세요..."
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={handleSendMessage} disabled={!chatInput.trim()}
                  className="p-2 bg-brand-600 text-white rounded-full hover:bg-brand-700 transition-colors disabled:opacity-40">
                  <Icon name="Share" size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1:1 문의 폼 */}
      {showInquiry && (
        <div className="fixed z-[60] animate-fade-in" style={{
          bottom: isDesktop ? "1rem" : "4.5rem",
          right: isDesktop ? pcRightPosition : "1rem",
          width: isDesktop ? "340px" : "calc(100vw - 2rem)",
          maxWidth: "380px",
        }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ maxHeight: isDesktop ? "520px" : "70vh" }}>
            {/* Header */}
            <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="Message" size={18} strokeWidth={1.5} /> <span className="text-sm font-bold">1:1 문의하기</span>
              </div>
              <button onClick={() => setShowInquiry(false)} className="p-1 hover:bg-white/20 rounded-lg"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {inquirySubmitted ? (
                <div className="flex flex-col items-center justify-center text-center py-8 px-2">
                  <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-3">
                    <Icon name="Check" size={28} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">문의가 접수되었습니다</p>
                  <p className="text-xs text-gray-500 leading-relaxed">24시간 내 답변 드리겠습니다</p>
                  <button onClick={() => { setInquirySubmitted(false); }}
                    className="mt-4 text-xs px-4 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors font-medium">
                    추가 문의하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    남겨주신 내용은 고객센터에서 확인 후 이메일로 답변드립니다.
                  </p>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 mb-1 block">이름</label>
                    <input type="text" value={inquiryForm.name}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="이름을 입력하세요"
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 mb-1 block">이메일</label>
                    <input type="email" value={inquiryForm.email}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="답변받을 이메일"
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 mb-1 block">문의 내용</label>
                    <textarea value={inquiryForm.message}
                      onChange={(e) => setInquiryForm((p) => ({ ...p, message: e.target.value }))}
                      placeholder="문의하실 내용을 입력하세요"
                      rows={4}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  {inquiryError && (
                    <p className="text-[11px] text-red-500">{inquiryError}</p>
                  )}
                  <button onClick={handleSubmitInquiry} disabled={inquirySubmitting}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50">
                    {inquirySubmitting ? <><Loader2 size={14} className="animate-spin" /> 전송 중...</> : <><Icon name="Share" size={14} /> 문의 전송</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Panel */}
      {showContact && !showChat && (
        <div className="fixed z-[55] w-56 animate-fade-in pointer-events-auto" style={{
          bottom: isDesktop ? `calc(${pcBottomOffset} + 6rem)` : `calc(${bottomOffset} + 6rem)`,
          right: rightPosition,
        }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">문의하기</h3>
              <button onClick={() => setShowContact(false)} className="text-gray-400 hover:text-gray-600"><X size={16} strokeWidth={1.5} /></button>
            </div>
            <div className="space-y-2">
              <button onClick={() => { setShowChat(true); setShowContact(false); }}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors w-full text-left">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600"><Bot size={16} strokeWidth={1.5} /></div>
                <div><p className="text-xs font-medium text-gray-800">챗봇 FAQ</p><p className="text-[10px] text-gray-400">자주 묻는 질문</p></div>
              </button>
              <button onClick={openInquiry}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors w-full text-left">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600"><Icon name="Message" size={16} strokeWidth={1.5} /></div>
                <div><p className="text-xs font-medium text-gray-800">1:1 채팅 상담</p><p className="text-[10px] text-gray-400">문의 남기기</p></div>
              </button>
              {/* 전화 상담 숨김 처리 (요청에 따라 CSS로 비노출, 코드는 보존) */}
              <a href={`tel:${phoneNumber}`} className="hidden items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600"><Icon name="Phone" size={16} strokeWidth={1.5} /></div>
                <div><p className="text-xs font-medium text-gray-800">전화 상담</p><p className="text-[10px] text-gray-400">{phoneNumber}</p></div>
              </a>
            </div>
            {contactSettings && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Icon name="Clock" size={9} /> {contactSettings.operatingHours}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll to top — PC: 사이드바 왼쪽에 위치 */}
      <button onClick={scrollToTop}
        className="fixed z-[55] w-10 h-10 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:shadow-xl transition-all"
        style={{ bottom: isDesktop ? `calc(${pcBottomOffset} + 3rem)` : scrollTopBottom, right: rightPosition }} aria-label="맨 위로">
        <Icon name="ArrowRight" size={18} strokeWidth={1.5} className="-rotate-90" />
      </button>

      {/* Contact/Chat toggle */}
      <button
        onClick={() => {
          if (showChat) { setShowChat(false); }
          else if (showInquiry) { setShowInquiry(false); }
          else { setShowContact(!showContact); }
        }}
        className={`fixed z-[55] w-10 h-10 lg:hidden rounded-full shadow-lg flex items-center justify-center transition-all ${
          showContact || showChat || showInquiry ? "bg-gray-900 text-white" : "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-xl"
        }`}
        style={{ bottom: isDesktop ? pcBottomOffset : bottomOffset, right: rightPosition }} aria-label="문의하기">
        {showContact || showChat || showInquiry ? <X size={18} strokeWidth={1.5} /> : <Icon name="CustomerService" size={18} strokeWidth={1.5} />}
      </button>
    </>
  );
}
