"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Radio, Sparkles, X } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useAppDialog } from "@/components/shared/AppDialog";

type Category = { id: string; name: string };

// 상담 방식(1차) × 상담 시간(2차) × 조합별 가격.
// 방식/시간은 중복 선택, 조합마다 가격을 따로 설정한다.
// 저장은 기존 옵션(optionGroups) + 변형(ProductVariant.price) 구조를 재사용한다(스키마 변경 없음).
const METHODS = ["영상 상담", "전화 상담", "방문 상담"] as const;
const DURATIONS: { label: string; min: number }[] = [
  { label: "30분", min: 30 },
  { label: "1시간", min: 60 },
  { label: "1시간 30분", min: 90 },
  { label: "2시간", min: 120 },
  { label: "2시간 30분", min: 150 },
  { label: "3시간", min: 180 },
];
const cellKey = (method: string, label: string) => `${method}__${label}`;

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
    categoryId: "",
    description: "",
    thumbnail: "",
    maxDailySlots: "5",
    allowLiveCommerce: false,
  });
  // 선택된 상담 방식들
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  // 조합별 가격 — key: `${method}__${durationLabel}`, 값 존재 = 해당 시간 활성
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/products/register")
      .then((response) => response.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, [open]);

  const reset = () => {
    setForm({ name: "", categoryId: "", description: "", thumbnail: "", maxDailySlots: "5", allowLiveCommerce: false });
    setSelectedMethods([]);
    setPrices({});
  };

  const toggleMethod = (method: string) => {
    setSelectedMethods((cur) => {
      if (cur.includes(method)) {
        // 방식 해제 시 해당 방식의 가격 셀도 모두 제거
        setPrices((p) => {
          const next: Record<string, string> = {};
          for (const k of Object.keys(p)) if (!k.startsWith(`${method}__`)) next[k] = p[k];
          return next;
        });
        return cur.filter((m) => m !== method);
      }
      return [...cur, method];
    });
  };

  const toggleDuration = (method: string, label: string) => {
    const key = cellKey(method, label);
    setPrices((p) => {
      const next = { ...p };
      if (key in next) delete next[key];
      else next[key] = "";
      return next;
    });
  };

  const setPrice = (key: string, value: string) => setPrices((p) => ({ ...p, [key]: value }));

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
    if (!form.name.trim()) {
      await appAlert("상담상품명을 입력해 주세요.");
      return;
    }

    // 방식 × 시간 × 가격 조합을 변형(variant)으로 조립
    const variants: { name: string; price: number }[] = [];
    const usedDurations = new Set<string>();
    for (const method of selectedMethods) {
      for (const d of DURATIONS) {
        const key = cellKey(method, d.label);
        if (!(key in prices)) continue;
        const price = Number(prices[key]);
        if (!price || price <= 0) {
          await appAlert(`'${method} · ${d.label}' 가격을 입력해 주세요.`);
          return;
        }
        variants.push({ name: `${method} · ${d.label}`, price });
        usedDurations.add(d.label);
      }
    }
    if (variants.length === 0) {
      await appAlert("상담 방식과 시간을 선택하고 가격을 입력해 주세요.");
      return;
    }

    const basePrice = Math.min(...variants.map((v) => v.price));
    const durationMinutes = Math.min(
      ...selectedMethods.flatMap((m) =>
        DURATIONS.filter((d) => cellKey(m, d.label) in prices).map((d) => d.min),
      ),
    );
    const optionGroups = [
      { groupName: "상담 방식", options: [...selectedMethods] },
      { groupName: "상담 시간", options: DURATIONS.filter((d) => usedDurations.has(d.label)).map((d) => d.label) },
    ];

    setSaving(true);
    try {
      const response = await fetch("/api/products/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          basePrice,
          comparePrice: null,
          categoryId: form.categoryId || null,
          description: form.description.trim() || null,
          thumbnail: form.thumbnail || null,
          consultingType: "사주",
          consultingMethod: selectedMethods[0] || "영상 상담",
          durationMinutes,
          maxDailySlots: Number(form.maxDailySlots) || 5,
          isGroupBuy: false,
          allowLiveCommerce: form.allowLiveCommerce,
          optionGroups,
          variants,
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
              <div><h2 className="text-lg font-bold text-brand-950">상담상품 등록</h2><p className="text-xs text-gray-400">상담 방식·시간별로 가격을 설정합니다.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-brand-50"><X size={19} /></button>
            </header>

            <div className="space-y-5 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">상담상품명 *</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-field" placeholder="예: 신년운세 종합 상담" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">상담 분야</label>
                <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="input-field">
                  <option value="">분야 선택</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>

              {/* 상담 방식 × 시간 × 가격 매트릭스 */}
              <div className="space-y-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="flex items-center gap-2"><Sparkles size={16} className="text-brand-600" /><h3 className="text-sm font-bold text-brand-950">상담 방식 · 시간 · 가격</h3></div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold text-gray-600">상담 방식 <span className="font-normal text-gray-400">(중복 선택)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {METHODS.map((m) => {
                      const on = selectedMethods.includes(m);
                      return (
                        <button type="button" key={m} onClick={() => toggleMethod(m)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-brand-200"}`}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedMethods.map((m) => {
                  const activeDurations = DURATIONS.filter((d) => cellKey(m, d.label) in prices);
                  return (
                    <div key={m} className="rounded-xl border border-brand-100 bg-white p-3">
                      <p className="mb-2 text-xs font-bold text-brand-800">{m}</p>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {DURATIONS.map((d) => {
                          const on = cellKey(m, d.label) in prices;
                          return (
                            <button type="button" key={d.label} onClick={() => toggleDuration(m, d.label)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${on ? "border-brand-300 bg-brand-100 text-brand-800" : "border-gray-200 bg-gray-50 text-gray-500 hover:border-brand-200"}`}>
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      {activeDurations.length > 0 ? (
                        <div className="space-y-1.5">
                          {activeDurations.map((d) => {
                            const key = cellKey(m, d.label);
                            return (
                              <div key={d.label} className="flex items-center gap-2">
                                <span className="w-24 flex-shrink-0 text-[11px] text-gray-600">{d.label}</span>
                                <input type="number" min="0" value={prices[key]} onChange={(e) => setPrice(key, e.target.value)} className="input-field flex-1 py-1.5 text-sm" placeholder="가격" />
                                <span className="flex-shrink-0 text-[11px] text-gray-400">원</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400">위에서 상담 시간을 선택하세요.</p>
                      )}
                    </div>
                  );
                })}
                {selectedMethods.length === 0 && <p className="text-[11px] text-gray-400">상담 방식을 하나 이상 선택하세요.</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
                <div><label className="mb-1 block text-[11px] text-gray-500">하루 예약 수</label><input type="number" min="1" value={form.maxDailySlots} onChange={(event) => setForm({ ...form, maxDailySlots: event.target.value })} className="input-field" /></div>
                <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs font-semibold text-gray-700"><input type="checkbox" checked={form.allowLiveCommerce} onChange={(event) => setForm({ ...form, allowLiveCommerce: event.target.checked })} className="h-4 w-4 accent-brand-600" /><Radio size={14} className="text-brand-600" />라이브 방송에서 소개</label>
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
