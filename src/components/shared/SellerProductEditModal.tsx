"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2 } from "lucide-react";
import ImageUploader from "@/components/shared/ImageUploader";
import { useAppDialog } from "@/components/shared/AppDialog";

interface Props {
  productId: string;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = {
  name: "",
  basePrice: "",
  comparePrice: "",
  shippingFee: "",
  stock: "",
  description: "",
  images: [] as string[],
};

// 상담사 본인이 직접 등록한 정식 상담상품(Product) 수정 모달
export default function SellerProductEditModal({ productId, onClose, onSaved }: Props) {
  const { appAlert } = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/seller/products/${productId}`);
      if (res.ok) {
        const { product } = await res.json();
        setForm({
          name: product.name ?? "",
          basePrice: product.basePrice != null ? String(product.basePrice) : "",
          comparePrice: product.comparePrice != null ? String(product.comparePrice) : "",
          shippingFee: product.shippingFee != null ? String(product.shippingFee) : "",
          stock: product.totalStock != null ? String(product.totalStock) : "",
          description: product.description ?? "",
          // 썸네일이 갤러리에 없으면 맨 앞에 포함시켜 대표 이미지 유지
          images: (() => {
            const imgs: string[] = Array.isArray(product.images) ? product.images : [];
            if (product.thumbnail && !imgs.includes(product.thumbnail)) return [product.thumbnail, ...imgs];
            return imgs;
          })(),
        });
      } else {
        const d = await res.json().catch(() => ({}));
        await appAlert(d.error || "상담상품 정보를 불러오지 못했습니다.");
        onClose();
      }
    } catch {
      await appAlert("오류가 발생했습니다. 다시 시도해주세요.");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [productId, appAlert, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      await appAlert("상담상품명을 입력해주세요.");
      return;
    }
    if (!form.basePrice || Number(form.basePrice) < 0) {
      await appAlert("올바른 판매가격을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        basePrice: Number(form.basePrice),
        comparePrice: form.comparePrice ? Number(form.comparePrice) : null,
        shippingFee: form.shippingFee ? Number(form.shippingFee) : 0,
        totalStock: form.stock ? Number(form.stock) : 0,
        description: form.description.trim() || null,
        images: form.images,
      };
      const res = await fetch(`/api/seller/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onSaved();
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl sm:shadow-2xl sm:my-6 min-h-screen sm:min-h-0 flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">상담상품 수정</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">상담상품명 <span className="text-red-500">*</span></label>
                <input type="text" className="input-field text-sm" placeholder="상담상품명을 입력하세요" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">판매가격 <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="number" min="0" className="input-field text-sm pr-8" placeholder="0" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">정가 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <div className="relative">
                    <input type="number" min="0" className="input-field text-sm pr-8" placeholder="0" value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">재고수량</label>
                  <div className="relative">
                    <input type="number" min="0" className="input-field text-sm pr-8" placeholder="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">개</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">상담상품설명</label>
                <textarea className="input-field h-24 resize-none text-sm" placeholder="상담상품에 대한 설명을 입력하세요" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">상담상품 이미지 <span className="text-gray-400 font-normal">(첫 번째 이미지가 대표 이미지, 최대 8장)</span></label>
                <ImageUploader images={form.images} onChange={(imgs) => setForm({ ...form, images: imgs })} maxImages={8} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-t border-gray-100">
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-outline flex-1 py-2.5 text-sm">취소</button>
                <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? "저장 중..." : "수정 완료"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
