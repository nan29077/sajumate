"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { X, Loader2 } from 'lucide-react';

const CHANNEL_PLATFORMS = [
  { value: "YouTube", label: "유튜브", placeholder: "유튜브 아이디" },
  { value: "Instagram", label: "인스타그램", placeholder: "인스타그램 아이디" },
  { value: "TikTok", label: "틱톡", placeholder: "틱톡 아이디" },
  { value: "KakaoTalk", label: "카카오", placeholder: "카카오 대화명" },
  { value: "NaverBand", label: "네이버밴드", placeholder: "네이버밴드 닉네임" },
  { value: "기타", label: "기타", placeholder: "채널 아이디 또는 대화명" },
] as const;
const DEFAULT_CHANNEL_PLACEHOLDER = "채널 아이디 또는 대화명";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
  sellerId: string;
  productName?: string;
  productPrice?: number;
}

export default function SocialOrderModal({ open, onClose, productId, sellerId, productName, productPrice }: Props) {
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [address, setAddress] = useState("");
  const [zonecode, setZonecode] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [phone, setPhone] = useState("");
  const [channelPlatform, setChannelPlatform] = useState("");
  const [channelHandle, setChannelHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [bank, setBank] = useState<{ bankName: string | null; bankAccount: string | null; bankHolder: string | null } | null>(null);

  const channelPlaceholder =
    CHANNEL_PLATFORMS.find((p) => p.value === channelPlatform)?.placeholder || DEFAULT_CHANNEL_PLACEHOLDER;

  useEffect(() => {
    if (!open) return;
    const u = session?.user as { name?: string | null; email?: string | null } | undefined;
    const fallback = (u?.name || "").trim() || (u?.email ? u.email.split("@")[0] : "");
    if (fallback) setDepositorName((prev) => prev || fallback);
  }, [open, session]);

  useEffect(() => {
    if (!open || !sellerId) return;
    fetch(`/api/seller/bank-account?sellerId=${encodeURIComponent(sellerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && (data.bankName || data.bankAccount || data.bankHolder)) setBank(data);
        else setBank(null);
      })
      .catch(() => setBank(null));
  }, [open, sellerId]);

  useEffect(() => {
    if (!open) return;
    if (document.getElementById("daum-postcode-script")) return;
    const script = document.createElement("script");
    script.id = "daum-postcode-script";
    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    document.head.appendChild(script);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setName("");
    setDepositorName("");
    setAddress("");
    setZonecode("");
    setAddressDetail("");
    setPhone("");
    setChannelPlatform("");
    setChannelHandle("");
    setError(null);
    setDone(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const openPostcode = () => {
    const win = window as any;
    if (!win.daum?.Postcode) {
      alert("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    new win.daum.Postcode({
      oncomplete: (data: any) => {
        const fullAddress = data.roadAddress || data.jibunAddress;
        setAddress(fullAddress);
        setZonecode(data.zonecode);
        setAddressDetail("");
      },
    }).open();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim() || !address.trim() || !phone.trim()) {
      setError("예약자명, 상담 요청사항, 연락처를 모두 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/social-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          sellerId,
          name: name.trim(),
          depositorName: depositorName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          snsPlatform: channelPlatform.trim(),
          snsHandle: channelHandle.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "제출에 실패했습니다.");
      }
      setDone(true);
    } catch (e: any) {
      setError(e.message || "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-[480px] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-sheet-up">
        <div className="sticky top-0 bg-amber-50 z-10 border-b-2 border-amber-300">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-[15px] font-bold text-gray-900">계좌 입금 예약서 작성</h2>
            <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <Icon name="Check" size={34} className="text-amber-500" />
            </div>
            <p className="text-[15px] font-bold text-gray-900">계좌 입금 예약서가 제출되었습니다</p>
            <p className="text-[13px] text-gray-500 mt-1.5">상담사가 확인 후 연락드릴 예정입니다.</p>
            <button
              onClick={handleClose}
              className="mt-6 w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <div className="bg-amber-500 px-5 py-3">
              <p className="text-sm font-bold text-white text-center leading-relaxed">
                아래 내용을 모두 기입하신 후
                <br />
                고객님께서 직접 입금계좌에 입금액을 입금해 주세요
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
                  <p className="text-[12px] font-bold text-amber-800">예약 정보 (자동 입력)</p>
                </div>
                <div className="px-4 py-3 space-y-3">
                  {productName && (
                    <div>
                      <p className="text-[11px] text-amber-600 font-semibold mb-1 flex items-center gap-1"><Icon name="ProductName_icon" size={13} /> 예약 상담상품</p>
                      <p className="text-[13px] font-bold text-gray-800 truncate">{productName}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] text-amber-600 font-semibold mb-1 flex items-center gap-1"><Icon name="CreditCard_icon" size={13} /> 입금 계좌</p>
                    <p className="text-[13px] text-gray-800">
                      {bank?.bankName && bank?.bankAccount
                        ? `${bank.bankName} ${bank.bankAccount}`
                        : "계좌 정보 없음"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-amber-600 font-semibold mb-1 flex items-center gap-1"><Icon name="MyPage_icon" size={13} /> 예금주</p>
                    <p className="text-[13px] text-gray-800">{bank?.bankHolder || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-amber-600 font-semibold mb-1 flex items-center gap-1"><Icon name="PriceTag_icon" size={13} /> 입금액 (상담상품금액)</p>
                    <p className="text-[15px] font-bold text-amber-700">
                      {productPrice ? productPrice.toLocaleString("ko-KR") + "원" : "-"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5">
                  <Icon name="Wallet_icon" size={15} /> 입금자명 <span className="text-[11px] text-gray-400 font-normal">(선택)</span>
                </label>
                <p className="text-[11px] text-amber-600 mb-1.5">
                  예약자와 입금자명이 다를 시 정확하게 입금자명을 입력하여 주세요
                </p>
                <input
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  placeholder="입금자명"
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5">
                  <Icon name="MyPage_icon" size={15} /> 예약자명 <span className="text-amber-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예약자명"
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5">
                  <Icon name="Message" size={15} /> 상담 요청사항 <span className="text-amber-500">*</span>
                </label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="궁금한 내용이나 상담 전에 전달할 정보를 적어 주세요." className="min-h-24 w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200" />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5">
                  <Icon name="Phone_icon" size={15} /> 연락처 <span className="text-amber-500">*</span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  inputMode="tel"
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5"><Icon name="SnsFeed_icon" size={15} /> 구매 채널 정보</label>
                <p className="text-[11px] text-amber-600 mb-2">
                  채널 아이디 또는 대화명을 정확하게 기입해야 입금 시 입금확인을 할 수 있습니다
                </p>
                <div className="space-y-2">
                  <select
                    value={channelPlatform}
                    onChange={(e) => setChannelPlatform(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                  >
                    <option value="">채널 플랫폼 선택</option>
                    {CHANNEL_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <input
                    value={channelHandle}
                    onChange={(e) => setChannelHandle(e.target.value)}
                    placeholder={channelPlaceholder}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                  />
                </div>
              </div>

              {error && <p className="text-[13px] text-red-500">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full h-12 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-[15px] rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-amber-200"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 제출 중...
                  </>
                ) : (
                  <>
                    <Icon name="Share" size={16} /> 계좌 입금 예약서 제출하기
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes sheet-up {
          0% {
            opacity: 0;
            transform: translateY(24px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-sheet-up {
          animation: sheet-up 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}
