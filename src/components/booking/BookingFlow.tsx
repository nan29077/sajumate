"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Clock, User, Calendar, CheckCircle } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { parseVariantName, slotsForWindow } from "@/lib/consultOptions";

interface Product {
  id: string;
  name: string;
  basePrice: number;
  // 상담 속성 컬럼이 아직 운영 DB 에 없으면 null 로 온다 — null 이면 뱃지를 숨긴다
  consultingType: string | null;
  consultingMethod: string | null;
  durationMinutes: number | null;
  thumbnail: string | null;
  description: string | null;
  sellerPrice: number | null;
  variants?: { id: string; name: string; price: number }[];
}

interface Seller {
  id: string;
  slug: string;
  shopName: string;
  shopLogo: string | null;
  shopDescription: string | null;
  consultantUserId: string;
  consultantName: string;
  consultantAvatar: string | null;
}

type Step = "product" | "option" | "date" | "time" | "info" | "confirm" | "pay" | "done";

interface PayProvider {
  key: string;
  label: string;
  checkoutUrl?: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function BookingFlow({
  seller,
  products,
  currentUserId,
  initialProductId,
  liveStreamId,
}: {
  seller: Seller;
  products: Product[];
  currentUserId: string;
  /** 라이브 등에서 특정 상품으로 진입 시 자동 선택 */
  initialProductId?: string | null;
  /** 라이브 방송 유래 예약이면 해당 방송 ID (예약에 기록) */
  liveStreamId?: string | null;
}) {
  const [step, setStep] = useState<Step>("product");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ id: string; name: string; price: number; method: string; durationLabel: string; minutes: number } | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Record<string, number>>({}); // date -> available count
  const [selectedSlot, setSelectedSlot] = useState<{ id: string; startTime: string; endTime: string } | null>(null);
  const [daySlots, setDaySlots] = useState<{ id: string; startTime: string; endTime: string }[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    birthDate: "",
    birthTime: "",
    gender: "",
    consultingContent: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [doneReservationId, setDoneReservationId] = useState<string | null>(null);
  const [payProviders, setPayProviders] = useState<PayProvider[]>([]);
  const [payAmount, setPayAmount] = useState(0);
  const [payLaunching, setPayLaunching] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // 방식×시간 옵션 파생값
  const parsedVariants = (selectedProduct?.variants ?? []).map((v) => ({ ...v, ...parseVariantName(v.name) }));
  const methods: string[] = Array.from(new Set(parsedVariants.map((v) => v.method)));
  const durationsForMethod = selectedMethod ? parsedVariants.filter((v) => v.method === selectedMethod) : [];
  const effectiveMinutes = selectedVariant?.minutes ?? (selectedProduct?.durationMinutes ?? 0);
  const effectivePrice = selectedVariant?.price ?? (selectedProduct ? (selectedProduct.sellerPrice ?? selectedProduct.basePrice) : 0);
  const timeSlots = effectiveMinutes > 0 ? daySlots.filter((s) => slotsForWindow(daySlots, s.startTime, effectiveMinutes) !== null) : daySlots;

  // 월 슬롯 현황 로드
  const loadMonthSlots = async (year: number, month: number) => {
    setMonthLoading(true);
    const res = await fetch(
      `/api/timeslots?consultantId=${seller.consultantUserId}&month=${year}-${String(month).padStart(2, "0")}`
    );
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const [date, info] of Object.entries(data.dateMap as Record<string, { total: number; available: number }>)) {
        if (info.available > 0) map[date] = info.available;
      }
      setAvailableDates(map);
    }
    setMonthLoading(false);
  };

  // 날짜 선택 → 슬롯 로드
  const handleSelectDate = async (dateStr: string) => {
    if (!availableDates[dateStr]) return;
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setSlotsLoading(true);
    const res = await fetch(`/api/timeslots?consultantId=${seller.consultantUserId}&date=${dateStr}`);
    if (res.ok) {
      const data = await res.json();
      setDaySlots(data.slots || []);
    }
    setSlotsLoading(false);
    setStep("time");
  };

  const handleProductSelect = (p: Product) => {
    setSelectedProduct(p);
    setSelectedMethod(null);
    setSelectedVariant(null);
    if ((p.variants?.length ?? 0) > 0) {
      setStep("option");
    } else {
      loadMonthSlots(currentYear, currentMonth);
      setStep("date");
    }
  };

  // 방식×시간 옵션(변형) 선택 → 날짜 단계로
  const handleVariantSelect = (v: { id: string; name: string; price: number; method: string; durationLabel: string; minutes: number }) => {
    setSelectedVariant(v);
    loadMonthSlots(currentYear, currentMonth);
    setStep("date");
  };

  // 라이브 등에서 특정 상품으로 진입 시 자동 선택 (최초 1회)
  useEffect(() => {
    if (!initialProductId) return;
    const preset = products.find((p) => p.id === initialProductId);
    if (preset) handleProductSelect(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrevMonth = () => {
    const nm = currentMonth === 1 ? 12 : currentMonth - 1;
    const ny = currentMonth === 1 ? currentYear - 1 : currentYear;
    setCurrentYear(ny);
    setCurrentMonth(nm);
    setSelectedDate(null);
    loadMonthSlots(ny, nm);
  };

  const handleNextMonth = () => {
    const nm = currentMonth === 12 ? 1 : currentMonth + 1;
    const ny = currentMonth === 12 ? currentYear + 1 : currentYear;
    setCurrentYear(ny);
    setCurrentMonth(nm);
    setSelectedDate(null);
    loadMonthSlots(ny, nm);
  };

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedSlot || !selectedDate) return;
    setSubmitting(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerId: seller.id,
        productId: selectedProduct.id,
        variantId: selectedVariant?.id ?? null,
        timeSlotId: selectedSlot.id,
        reservationDate: selectedDate,
        reservationTime: selectedSlot.startTime,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        birthDate: form.birthDate || null,
        birthTime: form.birthTime || null,
        gender: form.gender || null,
        consultingContent: form.consultingContent || null,
        liveStreamId: liveStreamId || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const reservationId: string = data.reservation.id;
      setDoneReservationId(reservationId);
      // 예약 생성 직후 결제 초기화 — 사용 가능한 PG가 있으면 결제 단계로 이어간다
      try {
        const prepRes = await fetch("/api/payments/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId }),
        });
        if (prepRes.ok) {
          const prep = await prepRes.json();
          if (Array.isArray(prep.providers) && prep.providers.length > 0) {
            setPayProviders(prep.providers);
            setPayAmount(prep.amount);
            setSubmitting(false);
            setStep("pay");
            return;
          }
        }
      } catch {
        // 결제 초기화 실패 시 기존 흐름(신청 완료 → 상담사 확정 대기)으로 폴백
      }
      setSubmitting(false);
      setStep("done");
    } else {
      const data = await res.json();
      setSubmitting(false);
      alert(data.error || "예약에 실패했습니다.");
    }
  };

  // 결제 수단 선택 → PG 결제창으로 이동
  const handlePay = async (provider: PayProvider) => {
    if (!doneReservationId) return;
    setPayLaunching(provider.key);
    try {
      if (provider.key === "ongi") {
        // ONGI 는 prepare 호출로 checkoutUrl 을 받아 이동
        const res = await fetch("/api/payments/ongi/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: doneReservationId }),
        });
        const data = await res.json();
        if (!res.ok || !data.checkoutUrl) {
          alert(data.error || "결제창 호출에 실패했습니다.");
          return;
        }
        window.location.href = data.checkoutUrl;
        return;
      }
      if (provider.checkoutUrl) {
        window.location.href = provider.checkoutUrl;
        return;
      }
      alert("사용할 수 없는 결제 수단입니다.");
    } finally {
      setPayLaunching(null);
    }
  };

  // 달력 계산
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  if (step === "pay") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="text-center">
            <CheckCircle size={40} className="text-green-500 mx-auto mb-2" />
            <h1 className="text-lg font-bold text-gray-900">예약이 접수되었습니다</h1>
            <p className="text-xs text-gray-400 mt-1">
              결제를 완료하면 예약이 확정됩니다.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">결제 금액</span>
            <span className="text-lg font-bold text-indigo-600">{formatPrice(payAmount)}</span>
          </div>
          <div className="space-y-2">
            {payProviders.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePay(p)}
                disabled={payLaunching !== null}
                className={`w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                  p.key === "mock"
                    ? "border border-dashed border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                    : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {payLaunching === p.key ? "결제창 여는 중..." : p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep("done")}
            className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600"
          >
            나중에 결제하기 (상담사 확정 대기)
          </button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <CheckCircle size={64} className="text-green-500 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">예약이 신청되었습니다!</h1>
        <p className="text-gray-500 text-sm mb-6">상담사 확인 후 예약이 확정됩니다.</p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Link href="/my/reservations" className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium text-center">
            예약 내역 보기
          </Link>
          <Link href={`/shop/${seller.slug}`} className="w-full py-3 border border-gray-200 text-gray-700 rounded-xl text-sm text-center">
            상담사 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        {step !== "product" && (
          <button
            onClick={() => {
              if (step === "option") setStep("product");
              else if (step === "date") setStep(selectedProduct?.variants?.length ? "option" : "product");
              else if (step === "time") setStep("date");
              else if (step === "info") setStep("time");
              else if (step === "confirm") setStep("info");
            }}
            className="text-gray-500"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <div>
          <h1 className="text-base font-bold text-gray-900">{seller.shopName}</h1>
          <p className="text-xs text-gray-400">
            {step === "product" && "상담 상품 선택"}
            {step === "option" && "상담 방식·시간 선택"}
            {step === "date" && "날짜 선택"}
            {step === "time" && "시간 선택"}
            {step === "info" && "신청자 정보"}
            {step === "confirm" && "예약 확인"}
          </p>
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto">

        {/* Step 1: 상품 선택 */}
        {step === "product" && (
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">등록된 상담 상품이 없습니다.</div>
            ) : (
              products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProductSelect(p)}
                  className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-indigo-400 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {p.thumbnail && (
                      <img src={p.thumbnail} alt={p.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                      <div className="flex gap-1.5 mt-1">
                        {p.consultingType && (
                          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{p.consultingType}</span>
                        )}
                        {p.consultingMethod && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{p.consultingMethod}</span>
                        )}
                        {p.durationMinutes != null && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full flex items-center gap-0.5">
                            <Clock size={10} />{p.durationMinutes}분
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>
                      )}
                      <p className="text-sm font-bold text-gray-900 mt-1.5">
                        {formatPrice(p.sellerPrice ?? p.basePrice)}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 1.5: 방식·시간 선택 */}
        {step === "option" && selectedProduct && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">{selectedProduct.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">상담 방식과 시간을 선택하세요.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">상담 방식</p>
              <div className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setSelectedMethod(m); setSelectedVariant(null); }}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${selectedMethod === m ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-200 text-gray-700 hover:border-indigo-400"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {selectedMethod && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">상담 시간</p>
                <div className="space-y-2">
                  {durationsForMethod.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleVariantSelect(v)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-indigo-400 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <Clock size={14} className="text-indigo-500" /> {v.durationLabel}
                      </span>
                      <span className="text-sm font-bold text-indigo-600">{formatPrice(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: 날짜 선택 */}
        {step === "date" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <button onClick={handlePrevMonth} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={20} /></button>
              <span className="font-semibold text-gray-800">{currentYear}년 {currentMonth}월</span>
              <button onClick={handleNextMonth} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={20} /></button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className={`text-center text-xs py-2 font-medium ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>{d}</div>
                ))}
              </div>
              {monthLoading ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>
              ) : (
                <div className="grid grid-cols-7">
                  {Array(firstDay).fill(null).map((_, i) => (
                    <div key={`e-${i}`} className="h-12 border-r border-b border-gray-100 last:border-r-0" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const available = availableDates[dateStr] || 0;
                    const isPast = dateStr < today;
                    const dow = (firstDay + day - 1) % 7;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleSelectDate(dateStr)}
                        disabled={!available || isPast}
                        className={`h-12 border-r border-b border-gray-100 last:border-r-0 flex flex-col items-center justify-center text-xs
                          ${available && !isPast ? "hover:bg-indigo-50 cursor-pointer" : "opacity-30 cursor-not-allowed"}
                          ${dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-gray-700"}
                        `}
                      >
                        <span>{day}</span>
                        {available > 0 && !isPast && (
                          <span className="text-[9px] text-indigo-500">{available}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">숫자는 선택 가능한 시간 수입니다.</p>
          </div>
        )}

        {/* Step 3: 시간 선택 */}
        {step === "time" && selectedDate && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">{selectedDate} 가능한 시간</p>
            {slotsLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">로딩 중...</div>
            ) : timeSlots.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">가용한 시간이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {timeSlots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setStep("info");
                    }}
                    className={`py-2.5 rounded-xl border text-sm font-medium transition-colors
                      ${selectedSlot?.id === slot.id
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-gray-200 text-gray-700 hover:border-indigo-400"
                      }`}
                  >
                    {slot.startTime}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: 신청자 정보 */}
        {step === "info" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="예약자 이름"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처 <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={form.customerPhone}
                onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                placeholder="010-0000-0000"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">생년월일</label>
              <input
                type="date"
                value={form.birthDate}
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">태어난 시각 (선택)</label>
              <input
                type="time"
                value={form.birthTime}
                onChange={e => setForm(f => ({ ...f, birthTime: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성별 (선택)</label>
              <div className="flex gap-2">
                {[{ value: "M", label: "남성" }, { value: "F", label: "여성" }].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, gender: f.gender === value ? "" : value }))}
                    className={`flex-1 py-2.5 rounded-xl border text-sm transition-colors ${form.gender === value ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-700"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">상담 내용 (선택)</label>
              <textarea
                value={form.consultingContent}
                onChange={e => setForm(f => ({ ...f, consultingContent: e.target.value }))}
                placeholder="궁금한 점이나 상담 내용을 미리 적어주세요."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none"
              />
            </div>
            <button
              onClick={() => {
                if (!form.customerName || !form.customerPhone) {
                  alert("이름과 연락처는 필수입니다.");
                  return;
                }
                setStep("confirm");
              }}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-2"
            >
              다음 — 예약 확인
            </button>
          </div>
        )}

        {/* Step 5: 예약 확인 */}
        {step === "confirm" && selectedProduct && selectedSlot && selectedDate && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
              <p className="font-semibold text-gray-900">예약 정보 확인</p>
              <Row label="상담사" value={seller.shopName} />
              <Row label="상담 상품" value={selectedProduct.name} />
              {(selectedProduct.consultingType || selectedVariant?.method || selectedProduct.consultingMethod) && (
                <Row
                  label="상담 방식"
                  value={[selectedProduct.consultingType, selectedVariant?.method || selectedProduct.consultingMethod].filter(Boolean).join(" · ")}
                />
              )}
              {(selectedVariant?.durationLabel || selectedProduct.durationMinutes != null) && (
                <Row label="상담 시간" value={selectedVariant?.durationLabel || `${selectedProduct.durationMinutes}분`} />
              )}
              <Row label="예약 날짜" value={selectedDate} />
              <Row label="예약 시간" value={selectedVariant ? `${selectedSlot.startTime} 부터 · ${effectiveMinutes}분` : `${selectedSlot.startTime} ~ ${selectedSlot.endTime}`} />
              <div className="border-t border-gray-100 pt-2">
                <p className="font-semibold text-gray-900">신청자 정보</p>
              </div>
              <Row label="이름" value={form.customerName} />
              <Row label="연락처" value={form.customerPhone} />
              {form.birthDate && <Row label="생년월일" value={form.birthDate} />}
              {form.birthTime && <Row label="태어난 시각" value={form.birthTime} />}
              {form.gender && <Row label="성별" value={form.gender === "M" ? "남성" : "여성"} />}
              {form.consultingContent && <Row label="상담 내용" value={form.consultingContent} />}
              <div className="border-t border-gray-100 pt-2 flex justify-between">
                <span className="font-semibold text-gray-700">결제 금액</span>
                <span className="font-bold text-indigo-600 text-base">
                  {formatPrice(effectivePrice)}
                </span>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? "예약 신청 중..." : "예약 신청하기"}
            </button>
            <p className="text-xs text-gray-400 text-center">예약 신청 후 상담사 확인 시 최종 확정됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
