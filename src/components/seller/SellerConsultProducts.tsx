"use client";

// 상담사 "상담상품 관리" — DirectProduct 기반 상담 서비스 목록/등록/수정/삭제.
// 상담 유형·시간·가격은 스키마 변경 없이 DirectProduct.description 에 JSON 으로 저장한다.
//   신형: { "type": "VIDEO"|"PHONE"|"VISIT", "durations": [{"duration": 30, "price": 50000}, ...], "note": "설명" }
//   구형: { "type": "VIDEO", "duration": 60, "note": "..." }  ← 하위 호환 유지
// DirectProduct.price = durations 중 최소 가격(대표가)으로 저장한다.

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, Pencil, Trash2, Video, Phone, MapPin, Clock, BookOpenText } from "lucide-react";
import SafeImage from "@/components/shared/SafeImage";
import ImageUploader from "@/components/shared/ImageUploader";
import { DEFAULT_PRODUCT_IMAGE } from "@/lib/defaults";
import { useAppDialog } from "@/components/shared/AppDialog";

export type ConsultType = "VIDEO" | "PHONE" | "VISIT";

export const CONSULT_TYPES: { value: ConsultType; label: string; icon: typeof Video }[] = [
  { value: "VIDEO", label: "영상 상담", icon: Video },
  { value: "PHONE", label: "전화 상담", icon: Phone },
  { value: "VISIT", label: "방문 상담", icon: MapPin },
];

/** 30분 단위 시간 옵션 (30분 ~ 6시간) */
export const DURATION_OPTIONS: { minutes: number; label: string }[] = Array.from(
  { length: 12 },
  (_, i) => {
    const minutes = (i + 1) * 30;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const label = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
    return { minutes, label };
  }
);

/** 분 → 한국어 레이블 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export interface ConsultProduct {
  id: string;
  name: string;
  price: number;
  description: string | null;
  images: string[];
  isActive: boolean;
  createdAt: string;
}

export interface DurationOption {
  duration: number; // 분
  price: number;    // 원
}

interface ConsultMeta {
  type: ConsultType;
  durations: DurationOption[];
  note: string;
}

const DEFAULT_META: ConsultMeta = { type: "VIDEO", durations: [{ duration: 30, price: 0 }], note: "" };

/** description(JSON 또는 순수 텍스트) → 상담 메타
 *  @param fallbackPrice 구형 단일 가격 (DirectProduct.price) — 구형 포맷 마이그레이션 시 사용
 */
export function parseConsultMeta(description: string | null, fallbackPrice?: number): ConsultMeta {
  if (!description) return { ...DEFAULT_META };
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const type: ConsultType = CONSULT_TYPES.some((t) => t.value === parsed.type)
        ? (parsed.type as ConsultType)
        : DEFAULT_META.type;
      const note = typeof parsed.note === "string" ? parsed.note : "";

      // ── 신형: durations 배열 ──
      if (Array.isArray(parsed.durations) && parsed.durations.length > 0) {
        const durations: DurationOption[] = parsed.durations
          .filter(
            (d: unknown): d is { duration: number; price: number } =>
              typeof d === "object" &&
              d !== null &&
              Number.isFinite((d as any).duration) &&
              (d as any).duration > 0 &&
              Number.isFinite((d as any).price) &&
              (d as any).price >= 0
          )
          .map((d) => ({ duration: Math.floor(d.duration), price: d.price }));
        if (durations.length > 0) return { type, durations, note };
      }

      // ── 구형: 단일 duration + 가격은 DirectProduct.price ──
      const dur =
        Number.isFinite(Number(parsed.duration)) && Number(parsed.duration) > 0
          ? Math.floor(Number(parsed.duration))
          : 30;
      return { type, durations: [{ duration: dur, price: fallbackPrice ?? 0 }], note };
    }
  } catch {
    /* 레거시 텍스트 설명 */
  }
  return { ...DEFAULT_META, note: description };
}

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

// 폼용 duration 행 (price는 string — input value)
interface DurationRow {
  duration: number;
  price: string;
}

const defaultDurationRow = (): DurationRow => ({ duration: 30, price: "" });

const emptyForm = {
  name: "",
  type: "VIDEO" as ConsultType,
  durations: [defaultDurationRow()],
  note: "",
  images: [] as string[],
};

export default function SellerConsultProducts({ initialProducts }: { initialProducts: ConsultProduct[] }) {
  const { appAlert, appConfirm } = useAppDialog();
  const [products, setProducts] = useState<ConsultProduct[]>(initialProducts);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ConsultProduct | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // 바텀시트 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!showForm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showForm]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/seller/direct-products", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      /* 목록 갱신 실패는 조용히 무시 (로컬 상태 유지) */
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p: ConsultProduct) => {
    const meta = parseConsultMeta(p.description, p.price);
    setEditing(p);
    setForm({
      name: p.name,
      type: meta.type,
      durations: meta.durations.map((d) => ({ duration: d.duration, price: String(d.price) })),
      note: meta.note,
      images: p.images || [],
    });
    setShowForm(true);
  };

  // ─── 시간 행 조작 ───
  const addDurationRow = () => {
    setForm((f) => ({ ...f, durations: [...f.durations, defaultDurationRow()] }));
  };

  const removeDurationRow = (index: number) => {
    setForm((f) => ({ ...f, durations: f.durations.filter((_, i) => i !== index) }));
  };

  const updateDurationRow = (index: number, field: keyof DurationRow, value: string | number) => {
    setForm((f) => ({
      ...f,
      durations: f.durations.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { await appAlert("상담명을 입력해주세요."); return; }
    if (form.durations.length === 0) { await appAlert("시간 옵션을 최소 1개 이상 추가해주세요."); return; }

    // 각 행 검증
    for (let i = 0; i < form.durations.length; i++) {
      const row = form.durations[i];
      if (!Number.isFinite(row.duration) || row.duration <= 0) {
        await appAlert(`${i + 1}번째 행의 시간을 선택해주세요.`);
        return;
      }
      const price = Number(row.price);
      if (!row.price || !Number.isFinite(price) || price < 0) {
        await appAlert(`${i + 1}번째 행의 가격을 올바르게 입력해주세요.`);
        return;
      }
    }

    // 중복 시간 검증
    const durationSet = new Set(form.durations.map((d) => d.duration));
    if (durationSet.size !== form.durations.length) {
      await appAlert("동일한 시간 옵션이 중복되어 있습니다. 각 시간은 한 번만 등록할 수 있습니다.");
      return;
    }

    const durationsData: DurationOption[] = form.durations.map((row) => ({
      duration: row.duration,
      price: Number(row.price),
    }));

    // DirectProduct.price = 최소 가격 (대표가)
    const minPrice = Math.min(...durationsData.map((d) => d.price));

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        price: minPrice,
        description: JSON.stringify({
          type: form.type,
          durations: durationsData,
          note: form.note.trim(),
        }),
        images: form.images,
        isActive: editing ? editing.isActive : true,
      };
      const res = editing
        ? await fetch(`/api/seller/direct-products/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/seller/direct-products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (res.ok) {
        setShowForm(false);
        await reload();
      } else {
        const d = await res.json().catch(() => ({}));
        await appAlert(d.error || "저장에 실패했습니다.");
      }
    } catch {
      await appAlert("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: ConsultProduct) => {
    setToggling(p.id);
    try {
      const res = await fetch(`/api/seller/direct-products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
      } else {
        const d = await res.json().catch(() => ({}));
        await appAlert(d.error || "변경에 실패했습니다.");
      }
    } catch {
      await appAlert("오류가 발생했습니다.");
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (p: ConsultProduct) => {
    if (
      !(await appConfirm({
        message: `'${p.name}' 상담상품을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
        type: "warning",
        confirmText: "삭제",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/seller/direct-products/${p.id}`, { method: "DELETE" });
      if (res.ok) {
        setProducts((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        const d = await res.json().catch(() => ({}));
        await appAlert(d.error || "삭제에 실패했습니다.");
      }
    } catch {
      await appAlert("오류가 발생했습니다.");
    }
  };

  return (
    <div className="dashboard-page">
      {/* 상단 */}
      <div className="dashboard-page-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="dashboard-icon-tile">
            <BookOpenText size={18} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-brand-950">등록된 상담상품</h2>
            <p className="text-[10px] text-gray-400">총 {products.length}개</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary min-h-10 px-3 py-2 text-[12px] whitespace-nowrap">
          <Plus size={14} strokeWidth={1.8} /> 상담상품 등록
        </button>
      </div>

      {/* 목록 */}
      {products.length === 0 ? (
        <div className="dashboard-empty dashboard-panel">
          <BookOpenText size={40} strokeWidth={1.5} className="mx-auto mb-3 text-brand-200" />
          <p className="text-sm">등록된 상담상품이 없습니다</p>
          <p className="text-xs mt-1">영상·전화·방문 상담을 등록해 고객이 예약할 수 있게 해보세요.</p>
          <button onClick={openCreate} className="btn-primary mt-4 px-4 py-2 text-xs">
            <Plus size={14} strokeWidth={1.8} /> 상담상품 등록
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => {
            const meta = parseConsultMeta(p.description, p.price);
            const typeMeta = CONSULT_TYPES.find((t) => t.value === meta.type) || CONSULT_TYPES[0];
            const TypeIcon = typeMeta.icon;
            return (
              <div
                key={p.id}
                className={`dashboard-panel p-3 flex items-center gap-3 transition-all ${p.isActive ? "" : "opacity-60"}`}
              >
                <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden shrink-0">
                  <SafeImage
                    src={p.images[0] || null}
                    placeholder={DEFAULT_PRODUCT_IMAGE}
                    alt={p.name}
                    width={112}
                    height={112}
                    fallbackText=""
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500">
                    <TypeIcon size={12} strokeWidth={1.5} />
                    <span>{typeMeta.label}</span>
                  </div>
                  {/* 시간 옵션 목록 */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {meta.durations.slice(0, 4).map((d, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-0.5 text-[10px] bg-brand-50 text-brand-700 rounded px-1.5 py-0.5"
                      >
                        <Clock size={9} strokeWidth={1.5} />
                        {formatDuration(d.duration)} · {formatPrice(d.price)}
                      </span>
                    ))}
                    {meta.durations.length > 4 && (
                      <span className="text-[10px] text-gray-400">+{meta.durations.length - 4}개</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400">{p.isActive ? "판매중" : "중지"}</span>
                    <button
                      onClick={() => handleToggleActive(p)}
                      disabled={toggling === p.id}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-60 ${
                        p.isActive ? "bg-brand-500" : "bg-gray-300"
                      }`}
                      title={p.isActive ? "판매중지" : "판매시작"}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          p.isActive ? "translate-x-3.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-[11px] px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors inline-flex items-center gap-1"
                    >
                      <Pencil size={11} strokeWidth={1.5} /> 수정
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-[11px] px-2 py-1.5 bg-red-50 text-red-500 rounded-lg font-medium hover:bg-red-100 transition-colors"
                      title="삭제"
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 등록/수정 바텀시트 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && setShowForm(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-slide-up">
            {/* Header */}
            <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {editing ? "상담상품 수정" : "상담상품 등록"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
              {/* 상담명 */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  상담명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field text-sm"
                  placeholder="예: 신년 운세 종합 상담"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              {/* 상담 유형 */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  상담 유형 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CONSULT_TYPES.map((t) => {
                    const TIcon = t.icon;
                    const active = form.type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, type: t.value })}
                        className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                          active
                            ? "border-brand-400 bg-brand-50 text-brand-700"
                            : "border-gray-200 bg-white text-gray-500 hover:border-brand-200"
                        }`}
                      >
                        <TIcon size={18} strokeWidth={1.5} />
                        <span className="text-[11px] font-bold">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 시간 + 가격 옵션 */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  상담 시간 및 가격 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {form.durations.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {/* 시간 드롭다운 */}
                      <select
                        value={row.duration}
                        onChange={(e) => updateDurationRow(idx, "duration", Number(e.target.value))}
                        className="input-field text-sm flex-1 min-w-0 py-2.5"
                      >
                        {DURATION_OPTIONS.map((opt) => (
                          <option key={opt.minutes} value={opt.minutes}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      {/* 가격 입력 */}
                      <div className="relative flex-1 min-w-0">
                        <input
                          type="number"
                          min="0"
                          className="input-field text-sm pr-8 w-full"
                          placeholder="50000"
                          value={row.price}
                          onChange={(e) => updateDurationRow(idx, "price", e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                      </div>

                      {/* 삭제 버튼 (행이 2개 이상일 때만) */}
                      {form.durations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDurationRow(idx)}
                          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                          title="이 시간 옵션 삭제"
                        >
                          <X size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* 시간 추가 버튼 */}
                <button
                  type="button"
                  onClick={addDurationRow}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-brand-200 text-brand-500 text-xs font-semibold hover:bg-brand-50 transition-colors"
                >
                  <Plus size={13} strokeWidth={2} /> 시간 추가
                </button>
              </div>

              {/* 설명 */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">설명</label>
                <textarea
                  className="input-field h-24 resize-none text-sm"
                  placeholder="어떤 고민을 어떻게 봐드리는지 적어주세요"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {/* 이미지 */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  이미지 <span className="text-gray-400 font-normal">(선택, 최대 5장)</span>
                </label>
                <ImageUploader
                  images={form.images}
                  onChange={(imgs) => setForm({ ...form, images: imgs })}
                  maxImages={5}
                />
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                등록하면 별도 승인 없이 바로 점집에 노출됩니다.
              </p>
            </div>

            {/* Footer */}
            <div
              className="flex-shrink-0 px-5 pt-4 border-t border-gray-100 bg-white"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn-outline flex-1 py-2.5 text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? "저장 중..." : editing ? "수정 완료" : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
