"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
import SafeImage from "@/components/shared/SafeImage";
import ImageUploader from "@/components/shared/ImageUploader";
import { useAppDialog } from "@/components/shared/AppDialog";
import SavedPopup from "@/components/shared/SavedPopup";
import { Image as ImageIcon, X, Check, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface BannerManagerProps {
  initialBanners: Banner[];
}

export default function BannerManager({ initialBanners }: BannerManagerProps) {
  const { appConfirm } = useAppDialog();
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSavedPopup, setShowSavedPopup] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    imageUrl: "",
    linkUrl: "",
    position: "hero",
    sortOrder: 0,
    isActive: true,
  });

  const resetForm = () => {
    setForm({ title: "", subtitle: "", imageUrl: "", linkUrl: "", position: "hero", sortOrder: 0, isActive: true });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (banner: Banner) => {
    setForm({
      title: banner.title,
      subtitle: banner.subtitle || "",
      imageUrl: banner.imageUrl,
      linkUrl: banner.linkUrl || "",
      position: banner.position,
      sortOrder: banner.sortOrder,
      isActive: banner.isActive,
    });
    setEditingId(banner.id);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById("banner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        const res = await fetch("/api/banners", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
        if (res.ok) {
          const updated = await res.json();
          setBanners((prev) => prev.map((b) => (b.id === editingId ? updated : b)));
          setPreviewBanner(updated);
          setShowSavedPopup(true);
        }
      } else {
        const res = await fetch("/api/banners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json();
          setBanners((prev) => [...prev, created]);
          setPreviewBanner(created);
          setShowSavedPopup(true);
        }
      }
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await appConfirm({ message: "정말 삭제하시겠습니까?", type: "warning", confirmText: "삭제" })) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/banners?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setBanners((prev) => prev.filter((b) => b.id !== id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      const res = await fetch("/api/banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: banner.id, isActive: !banner.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBanners((prev) => prev.map((b) => (b.id === banner.id ? updated : b)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const topBanners = banners.filter((b) => b.position === "top");
  const heroBanners = banners.filter((b) => b.position === "hero");
  const middleBanners = banners.filter((b) => b.position === "middle");
  const otherBanners = banners.filter((b) => b.position !== "hero" && b.position !== "top" && b.position !== "middle");

  return (
    <div>
      <SavedPopup show={showSavedPopup} onClose={() => setShowSavedPopup(false)} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">배너 관리</h1>
          <p className="text-sm text-gray-500">
            띠 배너 {topBanners.length}개 · 히어로 {heroBanners.length}개 · 중간 {middleBanners.length}개 · 기타 {otherBanners.length}개
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="btn-primary text-sm w-full sm:w-auto"
        >
          <Icon name="Plus" size={16} strokeWidth={1.5} className="mr-1" />
          배너 추가
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div id="banner-form" className="mb-6 bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">
              {editingId ? "배너 수정" : "새 배너 추가"}
            </h2>
            <button onClick={resetForm} className="p-1 text-gray-400 hover:text-gray-600">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">제목 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="배너 제목"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">부제목</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="부제목 (선택사항)"
                />
              </div>
            </div>

            {/* Image upload via ImageUploader (file + URL) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">배너 이미지 *</label>
              <ImageUploader
                images={form.imageUrl ? [form.imageUrl] : []}
                onChange={(urls) => setForm({ ...form, imageUrl: urls[0] || "" })}
                maxImages={1}
                label="배너 이미지"
                compact
              />
              {form.imageUrl && (
                <div className="mt-2 aspect-[16/9] max-w-[300px] rounded-lg overflow-hidden bg-gray-100">
                  <SafeImage src={form.imageUrl} alt="미리보기" width={300} height={169} fallbackText="Preview" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">링크 URL</label>
                <input
                  type="text"
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="/live 또는 외부 URL"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">위치</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="top">최상단 띠 배너</option>
                  <option value="hero">히어로 (메인 슬라이더)</option>
                  <option value="middle">중간 배너</option>
                  <option value="bottom">하단 배너</option>
                  <option value="popup">팝업</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">정렬 순서</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">활성화</label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                취소
              </button>
              <button type="submit" disabled={loading || !form.imageUrl} className="btn-primary text-sm">
                {loading ? "저장 중..." : editingId ? "수정 완료" : "배너 등록"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Top Strip Banner Section */}
      {topBanners.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-4 h-1 bg-black rounded-full" />
            최상단 띠 배너
            <span className="text-xs text-gray-400 font-normal">— 헤더 위 텍스트 배너</span>
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {topBanners.map((banner) => (
              <div key={banner.id} className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${banner.isActive ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{banner.title}</p>
                  {banner.linkUrl && <p className="text-xs text-gray-400 truncate mt-0.5">{banner.linkUrl}</p>}
                </div>
                <div className="flex items-center justify-end gap-1 w-full sm:w-auto sm:ml-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${banner.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>{banner.isActive ? '활성' : '비활성'}</span>
                  <button onClick={() => startEdit(banner)} className="p-1.5 text-gray-400 hover:text-gray-600"><Icon name="Edit" size={14} /></button>
                  <button onClick={() => toggleActive(banner)} className="p-1.5 text-gray-400 hover:text-blue-600">{banner.isActive ? <Icon name="Eye" size={14} /> : <Icon name="Eye" size={14} />}</button>
                  <button onClick={() => handleDelete(banner.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Icon name="Delete" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero Banners Section */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <ImageIcon size={16} strokeWidth={1.5} className="text-brand-500" />
          히어로 배너 (메인 슬라이더)
          <span className="text-xs text-gray-400 font-normal">— 메인 페이지 상단에 슬라이드 형태로 노출</span>
        </h3>
        {heroBanners.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
            <ImageIcon size={40} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">히어로 배너가 없습니다.</p>
            <p className="text-xs mt-1 text-gray-300">기본 슬라이드 이미지가 표시됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {heroBanners.map((banner) => (
              <BannerCard
                key={banner.id}
                banner={banner}
                onEdit={() => startEdit(banner)}
                onDelete={() => handleDelete(banner.id)}
                onToggle={() => toggleActive(banner)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Middle Banners Section */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
          <span className="w-4 h-1 bg-violet-500 rounded-full" />
          중간 배너
          <span className="text-xs text-gray-400 font-normal">— 메인 페이지 중간에 가로형 배너로 노출 (비율 21:9)</span>
        </h3>
        {middleBanners.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
            <ImageIcon size={32} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">중간 배너가 없습니다.</p>
            <p className="text-xs mt-1 text-gray-300">배너를 추가하고 위치를 &apos;중간 배너&apos;로 설정하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {middleBanners.map((banner) => (
              <BannerCard
                key={banner.id}
                banner={banner}
                onEdit={() => startEdit(banner)}
                onDelete={() => handleDelete(banner.id)}
                onToggle={() => toggleActive(banner)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Other Banners */}
      {otherBanners.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">기타 배너</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherBanners.map((banner) => (
              <BannerCard
                key={banner.id}
                banner={banner}
                onEdit={() => startEdit(banner)}
                onDelete={() => handleDelete(banner.id)}
                onToggle={() => toggleActive(banner)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 최근 저장 미리보기 */}
      {previewBanner && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Check size={16} className="text-green-500" strokeWidth={2} />
              최근 저장 미리보기
            </h3>
            <button
              onClick={() => setPreviewBanner(null)}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="미리보기 닫기"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-green-200 overflow-hidden shadow-sm">
            <div className="aspect-[16/9] max-w-2xl mx-auto bg-gray-100 overflow-hidden">
              <SafeImage
                src={previewBanner.imageUrl}
                alt={previewBanner.title}
                width={800}
                height={450}
                fallbackText="Preview"
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">{previewBanner.title}</span>
              {previewBanner.subtitle && (
                <span className="text-xs text-gray-400">{previewBanner.subtitle}</span>
              )}
              <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                {previewBanner.position} · #{previewBanner.sortOrder}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BannerCard({
  banner,
  onEdit,
  onDelete,
  onToggle,
}: {
  banner: Banner;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all ${banner.isActive ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
      <div className="aspect-[16/9] bg-gray-100 overflow-hidden relative">
        <SafeImage
          src={banner.imageUrl}
          alt={banner.title}
          width={640}
          height={360}
          fallbackText="Banner"
        />
        {!banner.isActive && (
          <div className="absolute inset-0 bg-gray-500/30 flex items-center justify-center">
            <span className="text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full">비활성</span>
          </div>
        )}
        <span className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
          #{banner.sortOrder}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0 mr-2">
            <p className="text-sm font-bold text-gray-900 truncate">{banner.title}</p>
            {banner.subtitle && <p className="text-xs text-gray-400 truncate">{banner.subtitle}</p>}
          </div>
          <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${banner.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
            {banner.isActive ? "활성" : "비활성"}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
          <span className="bg-gray-100 px-1.5 py-0.5 rounded">{banner.position}</span>
          <span>순서: {banner.sortOrder}</span>
          {banner.linkUrl && (
            <span className="flex items-center gap-0.5 truncate">
              <Icon name="ArrowRight" size={10} /> {banner.linkUrl}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
          <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
            <Icon name="Edit" size={13} strokeWidth={1.5} /> 수정
          </button>
          <button onClick={onToggle} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            {banner.isActive ? <><Icon name="Eye" size={13} strokeWidth={1.5} /> 숨기기</> : <><Icon name="Eye" size={13} strokeWidth={1.5} /> 활성화</>}
          </button>
          <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors ml-auto">
            <Icon name="Delete" size={13} strokeWidth={1.5} /> 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
