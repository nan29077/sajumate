"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from "@/components/shared/SnsIcons";
import ImageUploader from "@/components/shared/ImageUploader";
import SavedPopup from "@/components/shared/SavedPopup";
import Link from "next/link";
import {
  SHOP_TAGLINE_MAX,
  SHOP_INTRO_MAX,
  SHOP_TAGS_MAX,
  type ShopCustomization,
} from "@/lib/shopCustomization";

interface ShopData {
  slug: string;
  shopName: string;
  category: string | null;
  mood: string | null;
  shopDescription: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  youtubeChannelId?: string | null;
  shopLogo?: string | null;
  shopBanner?: string | null;
}

const CATEGORY_OPTIONS = [
  "사주", "신점", "타로", "작명", "궁합", "관상",
  "택일", "풍수", "점성술", "꿈해몽", "부적", "굿/의식",
  "심리상담", "기타",
];

const MOOD_OPTIONS = [
  "따뜻한", "직설적인", "차분한", "유쾌한", "섬세한", "단호한",
  "공감형", "현실조언형", "영적인", "논리적인", "친근한", "기타",
];

/** 상담 분야 태그 추천 목록 — 클릭으로 추가/제거, 직접 입력도 가능 */
const TAG_SUGGESTIONS = [
  "연애운", "결혼운", "재물운", "취업운", "이직운", "사업운",
  "건강운", "학업운", "가족관계", "인간관계", "이별/재회", "속마음",
  "올해운세", "신년운세", "택일", "작명",
];

export default function ShopEditForm({
  initial,
  initialCustomization,
  defaultBanner,
}: {
  initial: ShopData;
  initialCustomization: ShopCustomization;
  defaultBanner: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    shopName: initial.shopName || "",
    category: initial.category || "",
    mood: initial.mood || "",
    shopDescription: initial.shopDescription || "",
    instagramUrl: initial.instagramUrl || "",
    youtubeUrl: initial.youtubeUrl || "",
    tiktokUrl: initial.tiktokUrl || "",
    facebookUrl: initial.facebookUrl || "",
    twitterUrl: initial.twitterUrl || "",
    youtubeChannelId: initial.youtubeChannelId || "",
    shopLogo: initial.shopLogo || "",
    shopBanner: initial.shopBanner || "",
    tagline: initialCustomization.tagline || "",
    intro: initialCustomization.intro || "",
  });
  const [tags, setTags] = useState<string[]>(initialCustomization.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showSavedPopup, setShowSavedPopup] = useState(false);

  const handleChange = useCallback((field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length >= SHOP_TAGS_MAX ? prev : [...prev, tag]));
    setSaved(false);
  }, []);

  const addTagInput = useCallback(() => {
    const t = tagInput.trim();
    if (!t) return;
    setTags(prev => (prev.includes(t) || prev.length >= SHOP_TAGS_MAX ? prev : [...prev, t]));
    setTagInput("");
    setSaved(false);
  }, [tagInput]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/seller/shop", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setShowSavedPopup(true);
      // 사이드바 점집이름 즉시 반영 (서버 컴포넌트 재렌더)
      router.refresh();
    } catch (e: any) {
      setError(e.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [form, tags, router]);

  return (
    <>
      <SavedPopup show={showSavedPopup} onClose={() => setShowSavedPopup(false)} />
      {/* Header with Save button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-gray-900">점집 기본 정보</h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/shop/${initial.slug}`}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1.5"
          >
            <Icon name="ArrowRight" size={13} strokeWidth={1.5} />
            점집 바로가기
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${
              saved
                ? "bg-green-500 text-white"
                : saving
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-black text-white hover:bg-gray-800 active:scale-95"
            }`}
          >
            {saved ? (
              <>
                <Icon name="Check" size={16} strokeWidth={2} />
                저장됨
              </>
            ) : saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Save size={16} strokeWidth={1.5} />
                저장
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success/Error Notification */}
      {saved && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2 animate-fade-in">
          <Icon name="Check" size={16} className="text-green-500" />
          저장 되었습니다.
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 animate-fade-in">
          {error}
        </div>
      )}

      {/* Form Fields */}
      <div className="space-y-4">
        {/* 점집 이미지 */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
          <h3 className="text-sm font-bold text-gray-900">점집 이미지</h3>

          {/* 점집 로고 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">점집 로고 (프로필 이미지)</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                {form.shopLogo ? (
                  <img src={form.shopLogo} alt="점집 로고" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Icon name="Camera" size={20} />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <ImageUploader
                  images={form.shopLogo ? [form.shopLogo] : []}
                  onChange={(urls) => setForm((p) => ({ ...p, shopLogo: urls[0] || "" }))}
                  maxImages={1}
                  compact
                />
                {form.shopLogo && (
                  <button
                    onClick={() => setForm((p) => ({ ...p, shopLogo: "" }))}
                    className="mt-1 text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-0.5"
                  >
                    <X size={10} /> 이미지 제거
                  </button>
                )}
                <p className="text-[10px] text-gray-400 mt-1">권장: 200x200px, JPG/PNG</p>
                <p className="text-[10px] text-blue-500 mt-0.5">점집 상단 헤더 및 프로필 원형 이미지로 표시됩니다.</p>
              </div>
            </div>
          </div>

          {/* 점집 배너 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">점집 배너 이미지</label>
            {form.shopBanner ? (
              <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 mb-2">
                <img src={form.shopBanner} alt="배너" className="w-full h-full object-cover" />
                <button
                  onClick={() => setForm((p) => ({ ...p, shopBanner: "" }))}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-100 border border-brand-100 mb-2">
                <img src={defaultBanner} alt="자동 적용 기본 배너" className="w-full h-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                  자동 배너 · 5종 중 적용
                </span>
              </div>
            )}
            <ImageUploader
              images={form.shopBanner ? [form.shopBanner] : []}
              onChange={(urls) => setForm((p) => ({ ...p, shopBanner: urls[0] || "" }))}
              maxImages={1}
              compact
            />
            <p className="text-[10px] text-gray-400 mt-1">권장: 1200x400px, JPG/PNG</p>
            <p className="text-[10px] text-brand-600 mt-0.5">직접 업로드하기 전에는 사주메이트 기본 배너 5종 중 하나가 자동 적용됩니다.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">점집 이름</label>
            <input
              type="text"
              className="input-field"
              value={form.shopName}
              onChange={e => handleChange("shopName", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">점집 ID</label>
            <input type="text" className="input-field bg-gray-50 text-gray-500" defaultValue={initial.slug} readOnly />
            <p className="text-[10px] text-gray-400 mt-1">점집 주소: /shop/{initial.slug}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">점집 한줄 소개</label>
            <input
              type="text"
              className="input-field"
              value={form.tagline}
              maxLength={SHOP_TAGLINE_MAX}
              onChange={e => handleChange("tagline", e.target.value)}
              placeholder="예: 30년 경력, 사주로 풀어내는 인생의 방향"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              점집 페이지에서 점집 이름 바로 아래에 표시됩니다. ({form.tagline.length}/{SHOP_TAGLINE_MAX})
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">대표 상담 분야</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleChange("category", form.category === cat ? "" : cat)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    form.category === cat
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">상담 스타일</label>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_OPTIONS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleChange("mood", form.mood === m ? "" : m)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    form.mood === m
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">점집 설명 (요약)</label>
            <textarea
              className="input-field h-24 resize-none"
              value={form.shopDescription}
              onChange={e => handleChange("shopDescription", e.target.value)}
              placeholder="점집에 대한 소개를 작성해주세요"
            />
            <p className="text-[10px] text-gray-400 mt-1">프로필 카드와 검색 결과에 요약으로 노출됩니다.</p>
          </div>
        </div>

        {/* 상담 분야 태그 */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">상담 분야 태그</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              점집 페이지 프로필 카드에 표시됩니다. 최대 {SHOP_TAGS_MAX}개 ({tags.length}/{SHOP_TAGS_MAX})
            </p>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-600 text-white border border-brand-600"
                >
                  #{tag}
                  <X size={11} />
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {TAG_SUGGESTIONS.filter(t => !tags.includes(t)).map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                disabled={tags.length >= SHOP_TAGS_MAX}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + {tag}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input-field flex-1"
              value={tagInput}
              maxLength={12}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTagInput();
                }
              }}
              placeholder="직접 입력 후 Enter (예: 사업궁합)"
            />
            <button
              type="button"
              onClick={addTagInput}
              disabled={tags.length >= SHOP_TAGS_MAX}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              추가
            </button>
          </div>
        </div>

        {/* 상세 소개 */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <label className="block text-sm font-bold text-gray-900 mb-1">점집 상세 소개</label>
          <p className="text-[10px] text-gray-400 mb-2">
            점집 페이지 하단 &ldquo;소개&rdquo; 섹션에 전체 내용이 표시됩니다. 줄바꿈이 그대로 반영됩니다.
          </p>
          <textarea
            className="input-field h-48 resize-y leading-relaxed"
            value={form.intro}
            maxLength={SHOP_INTRO_MAX}
            onChange={e => handleChange("intro", e.target.value)}
            placeholder={"상담 경력, 상담 방식, 예약 전 안내사항 등을 자유롭게 적어주세요.\n\n예)\n· 사주명리 20년, 누적 상담 1만 건\n· 연애·재물·직업 상담을 주로 봅니다\n· 상담 전 생년월일시를 준비해주세요"}
          />
          <p className="text-[10px] text-gray-400 mt-1 text-right">
            {form.intro.length}/{SHOP_INTRO_MAX}
          </p>
        </div>

        {/* Social Media */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-900">소셜 미디어</h3>
          <div className="flex items-center gap-3">
            <InstagramIcon size={20} className="flex-shrink-0" />
            <input
              type="text" className="input-field flex-1"
              value={form.instagramUrl}
              onChange={e => handleChange("instagramUrl", e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </div>
          <div className="flex items-center gap-3">
            <YoutubeIcon size={20} className="flex-shrink-0" />
            <input
              type="text" className="input-field flex-1"
              value={form.youtubeUrl}
              onChange={e => handleChange("youtubeUrl", e.target.value)}
              placeholder="https://youtube.com/..."
            />
          </div>
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 flex-shrink-0 mt-2.5 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <div className="flex-1 space-y-1">
              <input
                type="text" className="input-field w-full"
                value={(form as any).youtubeChannelId || ""}
                onChange={e => handleChange("youtubeChannelId", e.target.value)}
                placeholder="YouTube 채널 ID (예: UCxxxxxxxx 또는 @채널핸들) — 자동 감지 방식 B용"
              />
              <p className="text-[10px] text-gray-400">채널 ID를 저장하면 라이브 생성 시 방식 B 자동 감지 기본값으로 사용됩니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15.2a6.34 6.34 0 0 0 6.33 6.34 6.34 6.34 0 0 0 6.33-6.34V8.96a8.27 8.27 0 0 0 4.77 1.52V7.03a4.84 4.84 0 0 1-1-.34Z" />
            </svg>
            <input
              type="text" className="input-field flex-1"
              value={form.tiktokUrl}
              onChange={e => handleChange("tiktokUrl", e.target.value)}
              placeholder="https://tiktok.com/@..."
            />
          </div>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <input
              type="text" className="input-field flex-1"
              value={form.facebookUrl}
              onChange={e => handleChange("facebookUrl", e.target.value)}
              placeholder="https://facebook.com/..."
            />
          </div>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <input
              type="text" className="input-field flex-1"
              value={form.twitterUrl}
              onChange={e => handleChange("twitterUrl", e.target.value)}
              placeholder="https://x.com/..."
            />
          </div>
        </div>
      </div>
    </>
  );
}
