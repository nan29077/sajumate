"use client";

import BrandWordmark from "@/components/shared/BrandWordmark";
import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Sparkles, Moon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getProviders } from "next-auth/react";
;
import { useAppDialog } from "@/components/shared/AppDialog";
import { useFeatureFlags } from "@/components/shared/FeatureFlagsProvider";
import BusinessInfoFooter from "@/components/shared/BusinessInfoFooter";
import {
  REGISTER_FIELD_DEFAULTS,
  normalizeRegisterFieldSettings,
  type RegisterFieldSettings,
  type RegisterFieldKey,
} from "@/lib/registerFields";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { appAlert } = useAppDialog();
  const flags = useFeatureFlags();
  const sellerRefFromUrl = searchParams?.get("ref") ?? null;
  const typeParam = searchParams?.get("type") ?? "";
  // 상담사 소개 페이지(/become-seller)에서 "상담사 신청하기"로 들어오면 ?role=CONSULTANT 로 상담사 가입을 미리 선택.
  const roleFromUrl = (searchParams?.get("role") ?? "").toUpperCase() === "CONSULTANT" ? "CONSULTANT" : null;
  // 상담사 귀속은 URL ?ref= 로 들어온 경우에만 (쿠키 fallback 제거)
  const sellerRef = sellerRefFromUrl;
  const [autoFilledShopName, setAutoFilledShopName] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    gender: "",
    birthday: "",
    phone: "",
    zipCode: "",
    address1: "",
    address2: "",
    role: roleFromUrl || ("CUSTOMER" as string),
  });
  // 관리자가 설정한 회원가입 항목 권한(필수/선택/숨김). 로드 전에는 코드 기본값 사용.
  const [fieldSettings, setFieldSettings] = useState<RegisterFieldSettings>(REGISTER_FIELD_DEFAULTS);
  const isHidden = (key: RegisterFieldKey) => fieldSettings[key] === "hidden";
  const isRequired = (key: RegisterFieldKey) => fieldSettings[key] === "required";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<{
    success: boolean;
    role: string;
    message: string;
    needsApproval: boolean;
  } | null>(null);

  // 상담사 초대는 URL의 ?ref=<slug> 로 들어온 경우에만 적용한다.
  // (이전엔 sb_ref 쿠키 fallback 으로 자동 탐지했으나, 상담사 점집 방문 후 남은
  //  쿠키 때문에 일반 가입도 상담사 초대로 표시되는 문제가 있어 제거함)
  // URL slug 가 있을 때만 점집명을 조회해 배너에 표시.
  useEffect(() => {
    if (!sellerRefFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/seller/lookup?slug=${encodeURIComponent(sellerRefFromUrl)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAutoFilledShopName(data.shopName ?? null);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [sellerRefFromUrl]);

  // 관리자가 설정한 회원가입 항목 권한(필수/선택/숨김)을 로드해 폼에 반영
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/register-fields", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFieldSettings(normalizeRegisterFieldSettings(data.fields));
      } catch {
        // 실패 시 코드 기본값 유지
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 다음(카카오) 우편번호 검색 팝업 — 스크립트를 필요 시 동적 로드
  const openPostcode = () => {
    const w = window as any;
    const run = () => {
      new w.daum.Postcode({
        oncomplete: (data: any) => {
          setForm((f) => ({
            ...f,
            zipCode: data.zonecode || "",
            address1: data.roadAddress || data.jibunAddress || "",
          }));
        },
      }).open();
    };
    if (w.daum && w.daum.Postcode) {
      run();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    script.onload = run;
    script.onerror = () => appAlert("우편번호 검색을 불러오지 못했습니다. 주소를 직접 입력해주세요.");
    document.body.appendChild(script);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // 이름·이메일·비밀번호·비밀번호확인은 항상 필수(잠금)
    if (!form.name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!form.email.trim()) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (!form.password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    // 관리자 설정에 따라 필수인 항목만 검증 (숨김 항목은 검증하지 않음)
    if (isRequired("phone") && !form.phone.trim()) {
      setError("휴대전화번호를 입력해주세요.");
      return;
    }
    if (isRequired("gender") && !form.gender) {
      setError("성별을 선택해주세요.");
      return;
    }
    if (isRequired("birthday") && !form.birthday) {
      setError("생년월일을 입력해주세요.");
      return;
    }
    if (isRequired("address") && !form.address1.trim()) {
      setError("주소를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          gender: isHidden("gender") ? "" : form.gender,
          birthday: isHidden("birthday") ? "" : form.birthday,
          phone: isHidden("phone") ? "" : form.phone.replace(/[^0-9]/g, ""),
          zipCode: isHidden("address") ? "" : form.zipCode,
          address1: isHidden("address") ? "" : form.address1,
          address2: isHidden("address") ? "" : form.address2,
          role: form.role,
          sellerRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "회원가입에 실패했습니다.");
      } else {
        if (data.needsApproval) {
          setRegistrationResult({
            success: true,
            role: data.role,
            message: data.message,
            needsApproval: true,
          });
        } else {
          // 분양몰(상담사 점집) 경유 가입이면 로그인 후 해당 점집으로 복귀하도록 callbackUrl 전달.
          const shopCallback = sellerRef ? `/shop/${encodeURIComponent(sellerRef)}` : null;
          router.push(
            shopCallback
              ? `/auth/login?registered=true&callbackUrl=${encodeURIComponent(shopCallback)}`
              : "/auth/login?registered=true",
          );
        }
      }
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 활성화된 OAuth provider
  const [enabledOAuth, setEnabledOAuth] = useState<Set<string>>(new Set());
  useEffect(() => {
    getProviders()
      .then((p) => {
        if (!p) return;
        const s = new Set<string>();
        for (const id of Object.keys(p)) {
          if (id !== "credentials") s.add(id);
        }
        setEnabledOAuth(s);
      })
      .catch(() => {});
  }, []);

  const handleSocialSignup = (provider: "kakao" | "naver" | "google") => {
    if (!enabledOAuth.has(provider)) {
      appAlert(`${provider} 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.`);
      return;
    }
    // 분양몰(상담사 점집) 경유 가입이면 가입 후 해당 점집으로 복귀. (ref = 상담사 slug)
    const callbackUrl = sellerRef ? `/shop/${encodeURIComponent(sellerRef)}` : "/";
    signIn(provider, { callbackUrl });
  };

  const hasReferral = !!sellerRef;

  if (registrationResult?.needsApproval) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 px-4 py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block mb-4">
              <BrandWordmark size="lg" />
            </Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-50 flex items-center justify-center">
              <Icon name="Clock" size={32} className="text-yellow-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">상담사 가입 완료!</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              {registrationResult.message}
            </p>
            <div className="bg-yellow-50 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <Icon name="Certified" size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">승인 절차 안내</p>
                  <ul className="text-[11px] text-yellow-700 space-y-1">
                    <li>• 관리자가 회원 정보를 검토합니다</li>
                    <li>• 승인 완료 시 로그인하여 서비스를 이용할 수 있습니다</li>
                    <li>• 일반적으로 1~2 영업일 이내 처리됩니다</li>
                  </ul>
                </div>
              </div>
            </div>
            <Link
              href="/auth/login"
              className="btn-primary w-full py-3 text-sm inline-block text-center"
            >
              로그인 페이지로 이동
            </Link>
          </div>
          <BusinessInfoFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6 relative">
          {flags.beeDecoration && <>
            <Sparkles size={44} strokeWidth={1.3}
              className="hidden lg:block absolute top-1 left-2 w-11 h-11 text-[#2d1b69] opacity-65 pointer-events-none select-none" aria-hidden="true" />
            <Moon size={36} strokeWidth={1.3}
              className="hidden lg:block absolute top-3 right-4 w-9 h-9 text-[#2d1b69] opacity-60 pointer-events-none select-none" aria-hidden="true" />
          </>}
          <Link href="/" className="inline-block mb-4">
            <BrandWordmark size="lg" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">회원가입</h1>
          {hasReferral && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-brand-50 text-brand-600 text-sm rounded-full">
              <Icon name="Gift" size={14} />
              <span className="font-medium">
                {autoFilledShopName
                  ? `${autoFilledShopName} 상담사 초대로 가입합니다`
                  : "상담사 전용 공간의 회원으로 가입합니다"}
              </span>
            </div>
          )}
          {typeParam === "seller" && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-full">
              <span className="font-medium">상담사로 시작하기 — 아래에서 가입 유형을 선택하세요</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          <button
            type="button"
            onClick={() => handleSocialSignup("kakao")}
            disabled={!enabledOAuth.has("kakao")}
            title={enabledOAuth.has("kakao") ? "카카오로 가입" : "카카오 로그인 설정 미완료"}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[#FEE500] hover:bg-[#FDD835] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.592 1.677 4.877 4.2 6.2-.13.47-.84 3.03-.87 3.23 0 0-.017.14.074.193.091.053.199.025.199.025.263-.037 3.047-1.987 3.53-2.313.59.083 1.2.165 1.867.165 5.523 0 10-3.477 10-7.5S17.523 3 12 3z" fill="#3C1E1E"/>
            </svg>
            <span className="text-[10px] font-medium text-gray-800">카카오</span>
          </button>
          <button
            type="button"
            onClick={() => handleSocialSignup("naver")}
            disabled={!enabledOAuth.has("naver")}
            title={enabledOAuth.has("naver") ? "네이버로 가입" : "네이버 로그인 설정 미완료"}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-[#03C75A] hover:bg-[#02B550] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14.5 12.65L9.3 5H5v14h4.5v-7.65L14.7 19H19V5h-4.5v7.65z" fill="white"/>
            </svg>
            <span className="text-[10px] font-medium text-white">네이버</span>
          </button>
          <button
            type="button"
            onClick={() => handleSocialSignup("google")}
            disabled={!enabledOAuth.has("google")}
            title={enabledOAuth.has("google") ? "Google로 가입" : "Google 로그인 설정 미완료"}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-[10px] font-medium text-gray-600">Google</span>
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[11px] text-gray-400 font-medium">이메일로 가입</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input-field text-sm py-2.5"
                placeholder="이름을 입력하세요"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                이메일 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                className="input-field text-sm py-2.5"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                비밀번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className="input-field text-sm py-2.5"
                placeholder="8자 이상 입력하세요"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                비밀번호 확인 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className="input-field text-sm py-2.5"
                placeholder="비밀번호를 다시 입력하세요"
                value={form.passwordConfirm}
                onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
                autoComplete="new-password"
                required
              />
            </div>

            {!isHidden("gender") && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                성별{" "}
                {isRequired("gender")
                  ? <span className="text-red-500">*</span>
                  : <span className="text-gray-400 font-normal">(선택)</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "male", label: "남성" },
                  { value: "female", label: "여성" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, gender: opt.value })}
                    className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.gender === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            )}

            {!isHidden("birthday") && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                생년월일{" "}
                {isRequired("birthday")
                  ? <span className="text-red-500">*</span>
                  : <span className="text-gray-400 font-normal">(선택)</span>}
              </label>
              <input
                type="date"
                className="input-field text-sm py-2.5"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                max="9999-12-31"
              />
            </div>
            )}

            {!isHidden("phone") && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                휴대전화번호{" "}
                {isRequired("phone")
                  ? <span className="text-red-500">*</span>
                  : <span className="text-gray-400 font-normal">(선택)</span>}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                className="input-field text-sm py-2.5"
                placeholder="01012345678"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                autoComplete="off"
                required={isRequired("phone")}
              />
            </div>
            )}

            {!isHidden("address") && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                주소{" "}
                {isRequired("address")
                  ? <span className="text-red-500">*</span>
                  : <span className="text-gray-400 font-normal">(선택)</span>}
              </label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field text-sm py-2.5 flex-1"
                    placeholder="우편번호"
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={openPostcode}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <Icon name="Search" size={14} />
                    주소 검색
                  </button>
                </div>
                <input
                  type="text"
                  className="input-field text-sm py-2.5"
                  placeholder="도로명 주소"
                  value={form.address1}
                  onChange={(e) => setForm({ ...form, address1: e.target.value })}
                  autoComplete="off"
                />
                <input
                  type="text"
                  className="input-field text-sm py-2.5"
                  placeholder="상세주소 (동·호수 등)"
                  value={form.address2}
                  onChange={(e) => setForm({ ...form, address2: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </div>
            )}

            {!sellerRef && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">가입 유형</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "CUSTOMER", label: "시청자 회원", desc: "상담 예약 & 라이브 상담", badge: "즉시 이용 가능" },
                    { value: "CONSULTANT", label: "상담사", desc: "점집 운영 & 판매", badge: "관리자 승인 필요" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.role === opt.value
                          ? "border-brand-500 bg-brand-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setForm({ ...form, role: opt.value })}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[10px] text-gray-400">{opt.desc}</p>
                      <span className={`inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                        opt.value === "CUSTOMER"
                          ? "bg-green-50 text-green-600"
                          : "bg-yellow-50 text-yellow-600"
                      }`}>
                        {opt.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.role === "CONSULTANT" && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Icon name="Clock" size={14} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-yellow-700 leading-relaxed">
                    상담사 계정은 가입 후 <strong>관리자 승인</strong>이 필요합니다.
                    승인 전까지 상담사 기능을 이용할 수 없습니다.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? "처리 중..." : "회원가입"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          이미 계정이 있으신가요?{" "}
          <Link href="/auth/login" className="font-bold text-brand-600 hover:underline">
            로그인
          </Link>
        </p>
        <BusinessInfoFooter />
      </div>
    </div>
  );
}
