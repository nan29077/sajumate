"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Radio, Sparkles, X } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useAppDialog } from "@/components/shared/AppDialog";

type Category = { id: string; name: string };

// 기존 호출부와의 호환성을 위해 props 모양은 유지한다. 브랜드·공동구매 값은 사용하지 않는다.
export default function ProductRegisterForm({
  buttonLabel = "상담상품 등록",
}: {
  brands?: unknown[];
  mode?: "admin" | "seller" | "brand";
  hideGroupBuy?: boolean;
  buttonLabel?: string;
}) {
  const { appAlert } = useAppDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: "",
    basePrice: "",
    comparePrice: "",
    categoryId: "",
    description: "",
    thumbnail: "",
    consultingMethod: "영상통화",
    durationMinutes: "30",
    maxDailySlots: "5",
    allowLiveCommerce: false,
  });

  useEffect(() => {
    if (!open) return;
    fetch("/api/products/register")
      .then((response) => response.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [open]);

  const reset = () => {
    setForm({
      name: "",
      basePrice: "",
      comparePrice: "",
      categoryId: "",
      description: "",
      thumbnail: "",
      consultingMethod: "영상통화",
      durationMinutes: "30",
      maxDailySlots: "5",
      allowLiveCommerce: false,
    });
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("files", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || !data.urls?.[0]) throw new Error(data.error || "이미지 업로드 실패");
      setForm((current) => ({ ...current, thumbnail: data.urls[0] }));
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "이미지를 업로드하지 못했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.basePrice) {
      await appAlert("상담상품명과 가격을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/products/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          basePrice: Number(form.basePrice),
          comparePrice: form.comparePrice ? Number(form.comparePrice) : null,
          categoryId: form.categoryId || null,
          description: form.description.trim() || null,
          thumbnail: form.thumbnail || null,
          consultingType: "사주",
          consultingMethod: form.consultingMethod,
          durationMinutes: Number(form.durationMinutes) || 30,
          maxDailySlots: Number(form.maxDailySlots) || 5,
          isGroupBuy: false,
          allowLiveCommerce: form.allowLiveCommerce,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "상담상품 등록에 실패했습니다.");
      setOpen(false);
      reset();
      window.location.reload();
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : "상담상품 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
        <Plus size={16} /> {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/45 sm:items-center sm:p-4">
          <form onSubmit={submit} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div><h2 className="text-lg font-bold text-brand-950">상담상품 등록</h2><p className="text-xs text-gray-400">사주메이트 상담에 필요한 정보만 입력합니다.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-brand-50"><X size={19} /></button>
            </header>

            <div className="space-y-5 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">상담상품명 *</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-field" placeholder="예: 30분 신년운세 상담" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">상담 가격 *</label><input type="number" min="0" value={form.basePrice} onChange={(event) => setForm({ ...form, basePrice: event.target.value })} className="input-field" placeholder="30000" /></div>
                <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">정상가 <span className="text-gray-400">(선택)</span></label><input type="number" min="0" value={form.comparePrice} onChange={(event) => setForm({ ...form, comparePrice: event.target.value })} className="input-field" placeholder="40000" /></div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">상담 분야</label>
                <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="input-field">
                  <option value="">분야 선택</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>

              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="mb-3 flex items-center gap-2"><Sparkles size={16} className="text-brand-600" /><h3 className="text-sm font-bold text-brand-950">상담 진행 설정</h3></div>
                <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
                  <div><label className="mb-1 block text-[11px] text-gray-500">상담 방식</label><select value={form.consultingMethod} onChange={(event) => setForm({ ...form, consultingMethod: event.target.value })} className="input-field"><option>영상통화</option><option>전화</option><option>채팅</option><option>대면</option></select></div>
                  <div><label className="mb-1 block text-[11px] text-gray-500">상담 시간(분)</label><input type="number" min="5" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} className="input-field" /></div>
                  <div><label className="mb-1 block text-[11px] text-gray-500">하루 예약 수</label><input type="number" min="1" value={form.maxDailySlots} onChange={(event) => setForm({ ...form, maxDailySlots: event.target.value })} className="input-field" /></div>
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={form.allowLiveCommerce} onChange={(event) => setForm({ ...form, allowLiveCommerce: event.target.checked })} className="h-4 w-4 accent-brand-600" /><Radio size={14} className="text-brand-600" />라이브 방송에서 소개</label>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">대표 이미지</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} className="hidden" />
                {form.thumbnail ? (
                  <div className="relative h-40 overflow-hidden rounded-2xl border border-brand-100"><img src={form.thumbnail} alt="상담상품 미리보기" className="h-full w-full object-cover" /><button type="button" onClick={() => setForm({ ...form, thumbnail: "" })} className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white"><X size={14} /></button></div>
                ) : (
                  <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/30 text-xs text-brand-600">
                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={22} />} 이미지 업로드
                  </button>
                )}
              </div>

              <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">상담 안내</label><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-field min-h-28 resize-y" placeholder="상담 대상, 준비할 내용, 진행 방식을 안내해 주세요." /></div>
            </div>

            <footer className="sticky bottom-0 flex gap-2 border-t border-brand-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setOpen(false)} className="dashboard-action flex-1">취소</button>
              <button type="submit" disabled={saving || uploading} className="btn-primary flex flex-[2] items-center justify-center gap-2">{saving ? <Loader2 size={16} className="animate-spin" /> : <Icon name="Check" size={16} />} 등록하기</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
