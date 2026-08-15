"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Minus, Plus } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";
import { isLegacyBundledAvatar, pickSajuAvatar, shouldUseAvatar } from "@/lib/defaults";
import ApproveSellerButton from "@/components/shared/ApproveSellerButton";
import RejectSellerButton from "@/components/shared/RejectSellerButton";
import RecommendSellerButton from "@/components/shared/RecommendSellerButton";
import { useAppDialog } from "@/components/shared/AppDialog";
import { withVatRate } from "@/lib/utils";
import Pagination, { usePagination } from "@/components/shared/Pagination";

export interface Seller {
  id: string; userId: string; shopName: string; shopLogo: string | null;
  userName: string; userEmail: string; userImage: string | null;
  userPhone?: string | null; userCreatedAt?: string;
  isApproved: boolean; isRecommended: boolean; totalFans: number;
  followersCount: number; shopProductsCount: number; ordersCount: number;
  commissionRate: number | null;
  createdAt: string;
  settlementAvailable: number;
  settlementScheduled: number;
}

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";

// 상담사 목록 아바타: 직접 올린 프로필/점집 로고 우선, 없거나 레거시 꿀벌 캐릭터면 사주 동물 캐릭터.
function sellerAvatarSrc(s: Pick<Seller, "userId" | "userImage" | "shopLogo" | "userName" | "shopName">): string | undefined {
  const uploaded = (!isLegacyBundledAvatar(s.userImage) ? s.userImage : null) || s.shopLogo;
  if (uploaded) return uploaded;
  return shouldUseAvatar(s.userName, s.shopName) ? pickSajuAvatar(s.userId) : undefined;
}

function ImpersonateButton({ userId, shopName }: { userId: string; shopName: string }) {
  const { appConfirm, appAlert } = useAppDialog();
  const [loading, setLoading] = useState(false);

  const handleImpersonate = async () => {
    const ok = await appConfirm({
      message: `"${shopName}" 계정으로 임시 로그인합니다. 새 탭이 열립니다.\n계속하시겠습니까?`,
      type: "warning",
      confirmText: "임시 로그인",
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        await appAlert({ message: d.error || "임시 로그인 실패", type: "warning" });
        return;
      }
      const { token } = await res.json();
      window.open(`/api/auth/impersonate?token=${encodeURIComponent(token)}`, "_blank");
    } catch {
      await appAlert({ message: "임시 로그인 오류", type: "warning" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleImpersonate}
      disabled={loading}
      title="임시 로그인"
      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon name="Login" size={12} />}
      임시 로그인
    </button>
  );
}

export default function AdminSellersClient({
  sellers,
}: {
  sellers: Seller[];
}) {
  const router = useRouter();
  const { appConfirm, appAlert } = useAppDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);
  const [detailSeller, setDetailSeller] = useState<Seller | null>(null);

  // +/- 조정 모달 상태
  const [adjustTarget, setAdjustTarget] = useState<{ seller: Seller; mode: "add" | "sub" } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMemo, setAdjustMemo] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sellers;
    const q = searchQuery.toLowerCase();
    return sellers.filter(
      (s) => s.shopName.toLowerCase().includes(q) || s.userName.toLowerCase().includes(q) || s.userEmail.toLowerCase().includes(q)
    );
  }, [sellers, searchQuery]);

  const pending = useMemo(() => sellers.filter((s) => !s.isApproved), [sellers]);
  const { pageItems, page, setPage, totalPages } = usePagination(filtered, 20);

  const openAdjust = (seller: Seller, mode: "add" | "sub") => {
    setAdjustTarget({ seller, mode });
    setAdjustAmount("");
    setAdjustMemo("");
  };
  const closeAdjust = () => {
    setAdjustTarget(null);
    setAdjustAmount("");
    setAdjustMemo("");
  };

  const handleAdjustSubmit = async () => {
    if (!adjustTarget) return;
    const num = parseInt(adjustAmount.replace(/,/g, ""), 10);
    if (!Number.isFinite(num) || num <= 0) {
      appAlert({ message: "올바른 금액을 입력해주세요.", type: "warning" });
      return;
    }
    const finalAmount = adjustTarget.mode === "sub" ? -num : num;
    const label = adjustTarget.mode === "add" ? "추가" : "차감";

    const ok = await appConfirm({
      message: `${adjustTarget.seller.shopName}의 정산 가능 금액에서\n${won(Math.abs(finalAmount))}을 ${label}합니다.\n계속하시겠습니까?`,
    });
    if (!ok) return;

    setAdjustLoading(true);
    try {
      const res = await fetch("/api/admin/balance-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: "CONSULTANT",
          userId: adjustTarget.seller.userId,
          amount: finalAmount,
          memo: adjustMemo || null,
        }),
      });
      if (res.ok) {
        closeAdjust();
        appAlert({ message: `정산 가능 금액이 ${label}되었습니다.`, type: "success" });
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        appAlert({ message: data.error || "조정에 실패했습니다.", type: "warning" });
      }
    } catch {
      appAlert({ message: "조정 중 오류가 발생했습니다.", type: "warning" });
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header flex items-center gap-3">
        <span className="dashboard-icon-tile"><Icon name="Store" size={19} /></span>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-brand-950">상담사 관리</h1>
          <p className="text-xs sm:text-sm text-gray-500">상담사 프로필과 승인 상태를 관리합니다 · 총 {sellers.length}명 · 승인 대기 {pending.length}명</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl border border-moon-500/30 bg-moon-50/70 p-3 sm:p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Icon name="Clock" size={15} className="text-moon-700" />
            <h2 className="text-sm font-bold text-brand-950">상담사 입점 신청</h2>
            <span className="text-[10px] font-bold bg-moon-500 text-brand-950 px-1.5 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2">
            {pending.map((seller) => (
              <div key={seller.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 bg-white rounded-xl border border-moon-500/20 p-2.5 sm:p-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-50 ring-2 ring-white overflow-hidden flex-shrink-0">
                  <SafeImage src={sellerAvatarSrc(seller)} alt={seller.shopName} width={40} height={40} fallbackText={seller.shopName.charAt(0)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{seller.shopName}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 truncate">{seller.userName} · {seller.userEmail}</p>
                </div>
                <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto flex-shrink-0">
                  <ApproveSellerButton sellerId={seller.id} />
                  <RejectSellerButton sellerId={seller.id} sellerName={seller.shopName} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="상담사명, 이름, 이메일 검색..."
            className="input-field pl-9 pr-8 py-2 text-sm" />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="dashboard-empty dashboard-panel">
            <Icon name="Store" size={30} className="mb-2 text-brand-200" />
            <p className="text-sm">{searchQuery ? "검색 결과가 없습니다." : "등록된 상담사가 없습니다."}</p>
          </div>
        ) : pageItems.map((seller) => (
          <div key={seller.id} className="dashboard-panel p-3 sm:p-4 transition-colors hover:border-brand-200">
            <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2.5 sm:gap-3 mb-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-50 ring-2 ring-brand-100 overflow-hidden flex-shrink-0">
                <SafeImage src={sellerAvatarSrc(seller)} alt={seller.shopName} width={48} height={48} fallbackText={seller.shopName.charAt(0)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[13px] sm:text-sm font-bold text-gray-900 truncate">{seller.shopName}</p>
                  <span className={`text-[9px] sm:text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 ${seller.isApproved ? "bg-green-50 text-green-600" : "bg-moon-50 text-moon-700"}`}>
                    {seller.isApproved ? "승인됨" : "대기중"}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-brand-50 text-brand-700 flex items-center gap-0.5">
                    <Icon name="Discount" size={9} />
                    {withVatRate(seller.commissionRate ?? 5)}% (부가세 포함)
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 truncate">{seller.userName} · {seller.userEmail}</p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto flex-shrink-0 flex-wrap justify-end">
                <button
                  onClick={() => setDetailSeller(seller)}
                  className="dashboard-action min-h-8 px-2 py-1.5"
                >
                  <Icon name="Info" size={12} /> 상세보기
                </button>
                <ImpersonateButton userId={seller.userId} shopName={seller.shopName} />
                <RecommendSellerButton sellerId={seller.id} initialRecommended={seller.isRecommended} />
                {!seller.isApproved && <ApproveSellerButton sellerId={seller.id} />}
                {!seller.isApproved && <RejectSellerButton sellerId={seller.id} sellerName={seller.shopName} />}
                <button
                  onClick={() => setExpandedSeller(expandedSeller === seller.id ? null : seller.id)}
                  className="dashboard-action min-h-8 px-2.5 py-1.5"
                >
                  {expandedSeller === seller.id ? "접기" : "마진 설정"}
                </button>
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
              {[
                { label: "팔로워", value: seller.followersCount },
                { label: "팬", value: seller.totalFans },
                { label: "상담상품", value: seller.shopProductsCount },
                { label: "예약", value: seller.ordersCount },
              ].map((stat) => (
                <div key={stat.label} className="text-center py-1.5 sm:py-2 px-1 bg-brand-50/60 rounded-xl">
                  <p className="text-[13px] sm:text-sm font-bold text-brand-950">{stat.value}</p>
                  <p className="text-[8px] sm:text-[9px] text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* 정산 금액 요약 */}
            <div className="mt-2.5 pt-2.5 border-t border-gray-50">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-emerald-50 rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[10px] text-emerald-600 mb-0.5">정산 가능</p>
                  <p className="text-[11px] font-bold text-emerald-700">{won(seller.settlementAvailable)}</p>
                </div>
                <div className="bg-moon-50 rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[10px] text-moon-700 mb-0.5">정산 예정</p>
                  <p className="text-[11px] font-bold text-moon-700">{won(seller.settlementScheduled)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-gray-500 mb-0.5">합계</p>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-bold text-gray-800">{won(seller.settlementAvailable + seller.settlementScheduled)}</p>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => openAdjust(seller, "add")}
                        className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                        title="정산 가능 금액 추가"
                      >
                        <Plus size={10} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => openAdjust(seller, "sub")}
                        className="w-5 h-5 flex items-center justify-center rounded bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                        title="정산 가능 금액 차감"
                      >
                        <Minus size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {expandedSeller === seller.id && (
              <SellerMarginPanel seller={seller} />
            )}
          </div>
        ))}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {/* 상세보기 모달 */}
      {detailSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-4" onClick={() => setDetailSeller(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Icon name="Info" size={15} className="text-gray-500" /> 상담사 상세
              </h3>
              <button onClick={() => setDetailSeller(null)} className="text-gray-400 hover:text-gray-600"><X size={17} /></button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                <SafeImage src={sellerAvatarSrc(detailSeller)} alt={detailSeller.shopName} width={48} height={48} fallbackText={detailSeller.shopName.charAt(0)} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{detailSeller.shopName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${detailSeller.isApproved ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"}`}>
                    {detailSeller.isApproved ? "승인됨" : "대기중"}
                  </span>
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    수수료 {withVatRate(detailSeller.commissionRate ?? 5)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-[12px] bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-2 text-gray-600"><Icon name="Users" size={13} className="text-gray-400" /> {detailSeller.userName}</div>
              <div className="flex items-center gap-2 text-gray-600"><Icon name="Mail" size={13} className="text-gray-400" /> {detailSeller.userEmail}</div>
              <div className="flex items-center gap-2 text-gray-600"><Icon name="Phone" size={13} className="text-gray-400" /> {detailSeller.userPhone || "연락처 미등록"}</div>
              <div className="flex items-center gap-2 text-gray-600"><Icon name="Calendar" size={13} className="text-gray-400" /> 가입일 {detailSeller.userCreatedAt ? new Date(detailSeller.userCreatedAt).toLocaleDateString("ko-KR") : "-"}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[
                { label: "팔로워", value: detailSeller.followersCount },
                { label: "팬", value: detailSeller.totalFans },
              ].map((s) => (
                <div key={s.label} className="text-center py-2 bg-gray-50 rounded-lg">
                  <p className="text-sm font-bold text-gray-900">{s.value}</p>
                  <p className="text-[9px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="bg-emerald-50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-emerald-600">정산 가능</p>
                <p className="text-xs font-bold text-emerald-700">{won(detailSeller.settlementAvailable)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-orange-500">정산 예정</p>
                <p className="text-xs font-bold text-orange-600">{won(detailSeller.settlementScheduled)}</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <p className="text-[9px] text-gray-500">합계</p>
                <p className="text-xs font-bold text-gray-800">{won(detailSeller.settlementAvailable + detailSeller.settlementScheduled)}</p>
              </div>
            </div>

            <button onClick={() => setDetailSeller(null)} className="mt-4 w-full py-2.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 금액 조정 모달 */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={closeAdjust}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${adjustTarget.mode === "add" ? "bg-emerald-50" : "bg-red-50"}`}>
                {adjustTarget.mode === "add"
                  ? <Plus size={18} className="text-emerald-600" />
                  : <Minus size={18} className="text-red-600" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  정산 가능 금액 {adjustTarget.mode === "add" ? "추가" : "차감"}
                </h3>
                <p className="text-[11px] text-gray-400">{adjustTarget.seller.shopName}</p>
              </div>
            </div>

            <div className={`rounded-lg p-2.5 my-3 text-[11px] leading-relaxed ${adjustTarget.mode === "add" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              현재 정산 가능 금액: {won(adjustTarget.seller.settlementAvailable)}
            </div>

            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {adjustTarget.mode === "add" ? "추가" : "차감"} 금액 (원)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className="input-field text-sm"
              placeholder="예: 10000"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              autoFocus
            />

            <label className="block text-xs font-semibold text-gray-600 mb-1.5 mt-3">메모 (선택)</label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="조정 사유를 입력하세요"
              value={adjustMemo}
              onChange={(e) => setAdjustMemo(e.target.value)}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeAdjust} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjustLoading}
                className={`px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-40 ${adjustTarget.mode === "add" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"}`}
              >
                {adjustLoading ? "처리 중..." : adjustTarget.mode === "add" ? "추가" : "차감"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SellerMarginPanel({
  seller,
}: {
  seller: Seller;
}) {
  const router = useRouter();
  const { appAlert } = useAppDialog();

  const [commSaving, setCommSaving] = useState(false);
  const [commRate, setCommRate] = useState<string>(String(seller.commissionRate ?? 5));

  const handleCommSave = async () => {
    const numRate = Number(commRate);
    if (!Number.isFinite(numRate) || numRate < 0 || numRate > 100) {
      await appAlert({ message: "수수료율은 0~100 사이 숫자여야 합니다.", type: "honeybee" });
      return;
    }
    setCommSaving(true);
    try {
      const res = await fetch(`/api/admin/sellers/${seller.id}/commission`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: numRate }),
      });
      if (res.ok) {
        await appAlert({ message: `수수료율이 ${numRate}%로 저장되었습니다.`, type: "success" });
        router.refresh();
      } else {
        const data = await res.json();
        await appAlert({ message: data.error || "수수료율 저장 실패", type: "warning" });
      }
    } catch {
      await appAlert({ message: "수수료율 저장 오류", type: "warning" });
    } finally {
      setCommSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2.5">
          <Icon name="Discount" size={13} className="text-indigo-500" />
          상담사 판매 수수료율
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-gray-600 mb-1">
              수수료율 (%) <span className="text-gray-400">· 현재 {seller.commissionRate ?? 5}% (부가세 포함 {withVatRate(seller.commissionRate ?? 5)}%)</span>
            </label>
            <input
              type="number" min={0} max={100} step="0.01"
              className="input-field text-sm" placeholder="5"
              value={commRate} onChange={(e) => setCommRate(e.target.value)}
            />
          </div>
          <button onClick={handleCommSave} disabled={commSaving} className="btn-primary text-sm px-4 py-2 flex-shrink-0">
            {commSaving ? "저장 중..." : "수수료율 저장"}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">정산 시 판매액에서 이 수수료율(%)만큼 차감됩니다. 기본값 5%.</p>
      </div>

    </div>
  );
}
