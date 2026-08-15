"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Bold, Italic, Heading, List, Plus, X, Save } from 'lucide-react';
import ImageUploader from "@/components/shared/ImageUploader";
import OptionGroupEditor, { type OptionGroup as OG } from "@/components/shared/OptionGroupEditor";

interface Category { id: string; name: string; slug: string; parentId: string | null; }
interface Variant { name: string; price: string; stock: string; }

interface Props {
  // 저장/취소 후 돌아갈 목록 경로 (브랜드: /brand/products, 관리자: /admin/products, 상담사: /seller/products)
  backHref: string;
  // 역할 모드: "brand"는 공급가만 입력·조회(판매가 비노출), "admin"은 판매가+공급가, "seller"는 판매가만
  mode?: "admin" | "brand" | "seller";
}

export default function ProductEditForm({ backHref, mode = "admin" }: Props) {
  const isBrand = mode === "brand";
  const isSeller = mode === "seller";
  const router = useRouter();
  const params = useParams();
  const productId = (params?.id as string) ?? "";

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<"basic" | "detail" | "options">("basic");
  const [showPreview, setShowPreview] = useState(false);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [shipping, setShipping] = useState({ fee: "", freeShipping: false, freeThreshold: "", remoteFee: "" });

  const [form, setForm] = useState({
    name: "", basePrice: "", comparePrice: "", supplyPrice: "", description: "", detailContent: "",
    categoryId: "", thumbnail: "", images: [] as string[],
    variants: [] as Variant[], isActive: true, stock: "",
    coupangLowestPrice: "", naverLowestPrice: "",
  });
  // 다차원 옵션 그룹
  const [optionMode, setOptionMode] = useState<"flat" | "group">("flat");
  const [optionGroups, setOptionGroups] = useState<OG[]>([]);

  // Fetch product data
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "상담상품을 불러올 수 없습니다");
          setPageLoading(false);
          return;
        }
        const data = await res.json();
        const p = data.product;
        setForm({
          name: p.name || "",
          basePrice: p.basePrice != null ? String(p.basePrice) : "",
          comparePrice: p.comparePrice ? String(p.comparePrice) : "",
          supplyPrice: p.supplyPrice != null ? String(p.supplyPrice) : "",
          description: p.description || "",
          detailContent: p.detailContent || "",
          categoryId: p.categoryId || "",
          thumbnail: p.thumbnail || "",
          images: p.images?.map((img: any) => img.url) || [],
          variants: p.variants?.map((v: any) => ({
            name: v.name,
            price: String(v.price),
            stock: String(v.stock),
          })) || [],
          isActive: p.isActive,
          stock: p.totalStock != null ? String(p.totalStock) : "",
          coupangLowestPrice: p.coupangLowestPrice ? String(p.coupangLowestPrice) : "",
          naverLowestPrice: p.naverLowestPrice ? String(p.naverLowestPrice) : "",
        });
        if (p.badges) {
          try { setBadges(JSON.parse(p.badges)); } catch {}
        }
        // 다차원 옵션 그룹 복원
        if (p.optionGroups) {
          try {
            const groups = JSON.parse(p.optionGroups);
            if (Array.isArray(groups) && groups.length > 0) {
              setOptionGroups(groups);
              setOptionMode("group");
            }
          } catch {}
        }
        setShipping({
          fee: p.shippingFee ? String(p.shippingFee) : "",
          freeShipping: !!p.freeShipping,
          freeThreshold: p.freeShippingThreshold ? String(p.freeShippingThreshold) : "",
          remoteFee: p.remoteAreaFee ? String(p.remoteAreaFee) : "",
        });
        setCategories(data.categories || []);
      } catch {
        setError("상담상품 데이터를 불러오는 중 오류가 발생했습니다");
      }
      setPageLoading(false);
    };
    fetchProduct();
  }, [productId]);

  const topCategories = categories.filter(c => !c.parentId);
  const subCategories = (pid: string) => categories.filter(c => c.parentId === pid);

  const addVariant = () => setForm({ ...form, variants: [...form.variants, { name: "", price: form.basePrice, stock: "0" }] });
  const removeVariant = (i: number) => setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) });
  const updateVariant = (i: number, k: string, v: string) => {
    const nv = [...form.variants]; (nv[i] as any)[k] = v; setForm({ ...form, variants: nv });
  };

  const insertHtmlTag = (tag: string) => {
    const ta = detailRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, sel = form.detailContent.substring(s, e);
    let ins = "";
    switch (tag) {
      case "bold": ins = `<strong>${sel || "굵은 텍스트"}</strong>`; break;
      case "italic": ins = `<em>${sel || "기울임"}</em>`; break;
      case "h3": ins = `<h3>${sel || "소제목"}</h3>`; break;
      case "list": ins = `<ul>\n  <li>${sel || "항목"}</li>\n</ul>`; break;
      default: return;
    }
    const nc = form.detailContent.substring(0, s) + ins + form.detailContent.substring(e);
    setForm({ ...form, detailContent: nc });
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; }, 0);
  };

  // 저장 가능 조건: 브랜드는 공급가, 관리자/상담사는 판매가가 필수
  const canSave = !!form.name && (isBrand ? !!form.supplyPrice : !!form.basePrice);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const body: any = {
        name: form.name,
        description: form.description || null,
        detailContent: form.detailContent || null,
        // 브랜드는 판매가(basePrice)·정가를 전송하지 않음 — 서버에서도 무시/차단
        ...(isBrand
          ? {}
          : {
              basePrice: parseFloat(form.basePrice),
              comparePrice: form.comparePrice ? parseFloat(form.comparePrice) : null,
            }),
        // 공급가: 브랜드/관리자만 입력 가능. 상담사는 전송하지 않음
        ...(!isSeller ? { supplyPrice: form.supplyPrice ? parseFloat(form.supplyPrice) : null } : {}),
        categoryId: form.categoryId || null,
        thumbnail: form.thumbnail || form.images[0] || null,
        images: form.images.filter(Boolean),
        variants: form.variants.filter(v => v.name),
        stock: form.stock === "" ? 0 : parseInt(form.stock),
        badges: badges.length > 0 ? badges : null,
        isActive: form.isActive,
        shippingFee: shipping.freeShipping ? 0 : (shipping.fee ? parseFloat(shipping.fee) : 0),
        freeShipping: shipping.freeShipping,
        freeShippingThreshold: !shipping.freeShipping && shipping.freeThreshold ? parseFloat(shipping.freeThreshold) : null,
        remoteAreaFee: shipping.remoteFee ? parseFloat(shipping.remoteFee) : 0,
        // 다차원 옵션 그룹 메타데이터
        optionGroups: optionMode === "group" && optionGroups.length > 0
          ? JSON.stringify(optionGroups)
          : null,
        // 외부 최저가 (브랜드·관리자만 입력 가능)
        ...(!isSeller ? {
          coupangLowestPrice: form.coupangLowestPrice ? parseFloat(form.coupangLowestPrice) : null,
          naverLowestPrice: form.naverLowestPrice ? parseFloat(form.naverLowestPrice) : null,
        } : {}),
      };
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push(backHref);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "수정 실패");
      }
    } catch {
      setError("오류가 발생했습니다");
    }
    setSaving(false);
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">상담상품 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error && !form.name) {
    return (
      <div className="animate-fade-in">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-gray-700">
          <Icon name="ChevronDown" size={16} className="rotate-90" /> 돌아가기
        </button>
        <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-gray-100">
          <Icon name="Warning" size={48} strokeWidth={1.5} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  const tabLabels: Record<string, string> = { basic: "기본 정보", detail: "상세 설명", options: "이미지/옵션" };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <Icon name="ChevronDown" size={20} className="rotate-90" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">상담상품 수정</h1>
            <p className="text-xs text-gray-400">{form.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="sr-only" />
              <div className={`w-8 h-4.5 rounded-full transition-colors ${form.isActive ? "bg-green-500" : "bg-gray-300"}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform mt-[2px] ${form.isActive ? "ml-[17px]" : "ml-[2px]"}`} />
              </div>
            </div>
            <span className={form.isActive ? "text-green-600" : "text-gray-400"}>{form.isActive ? "활성" : "비활성"}</span>
          </label>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            저장
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <Icon name="Warning" size={14} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {(["basic", "detail", "options"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>{tabLabels[tab]}</button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {activeTab === "basic" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">상담상품명 *</label>
              <input type="text" className="input-field mt-1 text-sm" placeholder="상담상품명" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            {isBrand ? (
              /* 브랜드: 공급가만 입력·조회 (판매가는 중간/최고관리자 전용, 비노출) */
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">공급가 <span className="text-red-500">*</span></label>
                  <span className="text-[10px] text-gray-400">판매가는 관리자가 설정 · 브랜드 비공개</span>
                </div>
                <div className="relative">
                  <input type="number" min="0" className="input-field text-sm pr-8 !bg-white" placeholder="0"
                    value={form.supplyPrice} onChange={e => setForm({ ...form, supplyPrice: e.target.value })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">공급가만 입력하세요. 판매가·마진은 중간관리자가 설정합니다.</p>
              </div>
            ) : isSeller ? (
              /* 상담사: 판매가와 정가만 입력 (공급가 비노출) */
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">판매가 *</label>
                  <input type="number" className="input-field mt-1 text-sm" placeholder="0" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">정가 (비교가)</label>
                  <input type="number" className="input-field mt-1 text-sm" placeholder="0" value={form.comparePrice} onChange={e => setForm({ ...form, comparePrice: e.target.value })} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">판매가 *</label>
                    <input type="number" className="input-field mt-1 text-sm" placeholder="0" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">정가 (비교가)</label>
                    <input type="number" className="input-field mt-1 text-sm" placeholder="0" value={form.comparePrice} onChange={e => setForm({ ...form, comparePrice: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">공급가 <span className="text-gray-400">(선택)</span></label>
                  <input type="number" className="input-field mt-1 text-sm" placeholder="0" value={form.supplyPrice} onChange={e => setForm({ ...form, supplyPrice: e.target.value })} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">카테고리</label>
              <select className="input-field mt-1 text-sm" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">선택</option>
                {topCategories.map(cat => (
                  <optgroup key={cat.id} label={cat.name}>
                    <option value={cat.id}>{cat.name} (전체)</option>
                    {subCategories(cat.id).map(sub => <option key={sub.id} value={sub.id}>&nbsp;&nbsp;{sub.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">설명</label>
              <textarea className="input-field mt-1 h-20 resize-none text-sm" placeholder="간단 설명" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">배지</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: "NEW", l: "신규", c: "bg-emerald-50 text-emerald-600" },
                  { v: "BEST", l: "베스트", c: "bg-orange-50 text-orange-600" },
                  { v: "HOT_DEAL", l: "특가", c: "bg-red-50 text-red-600" },
                  { v: "LIMITED", l: "한정", c: "bg-purple-50 text-purple-600" },
                  { v: "HANDMADE", l: "추천", c: "bg-amber-50 text-amber-600" },
                ].map(b => (
                  <button key={b.v} type="button" onClick={() => setBadges(p => p.includes(b.v) ? p.filter(x => x !== b.v) : [...p, b.v])}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${badges.includes(b.v) ? b.c + " border-current" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                    {badges.includes(b.v) && "✓ "}{b.l}
                  </button>
                ))}
              </div>
            </div>

            {/* 상담 방식 설정 */}
            {false && <div className="border border-gray-200 rounded-xl p-4 space-y-3.5">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <Icon name="Truck" size={13} /> 상담 방식 설정
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 rounded accent-brand-600"
                  checked={shipping.freeShipping}
                  onChange={e => setShipping(s => ({ ...s, freeShipping: e.target.checked }))} />
                <span className="text-xs font-medium text-gray-700">무료배송</span>
              </label>
              {!shipping.freeShipping && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 mb-1 block">배송료</label>
                    <input type="number" min="0" className="input-field text-sm" placeholder="0"
                      value={shipping.fee} onChange={e => setShipping(s => ({ ...s, fee: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 mb-1 block">무료배송 기준금액 (선택)</label>
                    <input type="number" min="0" className="input-field text-sm" placeholder="예: 50000"
                      value={shipping.freeThreshold} onChange={e => setShipping(s => ({ ...s, freeThreshold: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="max-w-[50%]">
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">도서산간 추가배송비 (선택)</label>
                <input type="number" min="0" className="input-field text-sm" placeholder="예: 3000"
                  value={shipping.remoteFee} onChange={e => setShipping(s => ({ ...s, remoteFee: e.target.value }))} />
              </div>
            </div>}

            {/* 외부 최저가 (브랜드·관리자만 입력) */}
            {false && !isSeller && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <label className="text-xs font-medium text-gray-600">외부 최저가 참고 <span className="text-gray-400">(선택)</span></label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 mb-1 block">쿠팡 최저가</label>
                    <div className="relative">
                      <input type="number" min="0" className="input-field text-sm pr-8" placeholder="0"
                        value={form.coupangLowestPrice} onChange={e => setForm({ ...form, coupangLowestPrice: e.target.value })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 mb-1 block">네이버 최저가</label>
                    <div className="relative">
                      <input type="number" min="0" className="input-field text-sm pr-8" placeholder="0"
                        value={form.naverLowestPrice} onChange={e => setForm({ ...form, naverLowestPrice: e.target.value })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">입력하면 상담사가 참고하여 판매를 시작합니다.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "detail" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">상세 콘텐츠 (HTML)</label>
              <button type="button" onClick={() => setShowPreview(!showPreview)} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <Icon name="Eye" size={12} />{showPreview ? "편집" : "미리보기"}
              </button>
            </div>
            <div className="flex items-center gap-0.5 mb-1 p-1.5 bg-gray-50 rounded-t-lg border border-b-0 border-gray-200">
              {[{ t: "bold", i: <Bold size={14} /> }, { t: "italic", i: <Italic size={14} /> }, { t: "h3", i: <Heading size={14} /> }, { t: "list", i: <List size={14} /> }].map(b => (
                <button key={b.t} type="button" onClick={() => insertHtmlTag(b.t)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">{b.i}</button>
              ))}
            </div>
            {showPreview ? (
              <div className="border border-gray-200 rounded-b-lg p-4 min-h-[200px] bg-white">
                {form.detailContent ? <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: form.detailContent }} /> : <p className="text-xs text-gray-400 text-center mt-10">미리보기 없음</p>}
              </div>
            ) : (
              <textarea ref={detailRef} className="input-field h-52 resize-y font-mono text-xs rounded-t-none" placeholder="HTML 상세 정보를 입력하세요..." value={form.detailContent} onChange={e => setForm({ ...form, detailContent: e.target.value })} />
            )}
          </div>
        )}

        {activeTab === "options" && (
          <div className="space-y-5">
            {/* Thumbnail */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">썸네일</label>
              <ImageUploader images={form.thumbnail ? [form.thumbnail] : []} onChange={urls => setForm(prev => ({ ...prev, thumbnail: urls[0] || "" }))} maxImages={1} compact />
            </div>
            {/* Images */}
            <ImageUploader images={form.images} onChange={imgs => setForm(prev => ({ ...prev, images: imgs }))} maxImages={10} label="상담상품 이미지" />
            {/* 재고 수량 (옵션 미사용 단일 상담상품) */}
            {form.variants.length === 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1"><Icon name="Package" size={13} /> 예약 가능 수량</label>
                <input type="number" min="0" className="input-field text-sm w-40" placeholder="0"
                  value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                <p className="text-[11px] text-gray-400 mt-1">옵션을 추가하면 옵션별 수량 합계로 계산됩니다.</p>
              </div>
            )}
            {/* 옵션 (다차원 그룹 or 단순) */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">옵션 (사이즈, 색상 등)</label>
              <OptionGroupEditor
                optionMode={optionMode}
                variants={form.variants}
                optionGroups={optionGroups}
                basePrice={form.basePrice || form.supplyPrice || "0"}
                onChange={(patch) => {
                  if (patch.optionMode !== undefined) setOptionMode(patch.optionMode);
                  if (patch.optionGroups !== undefined) setOptionGroups(patch.optionGroups);
                  if (patch.variants !== undefined) setForm(f => ({ ...f, variants: patch.variants! }));
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Save Button */}
      <div className="mt-5 sm:hidden">
        <button onClick={handleSave} disabled={saving || !canSave}
          className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={16} className="animate-spin" /> 저장 중...</> : <><Save size={16} /> 변경사항 저장</>}
        </button>
      </div>
    </div>
  );
}
