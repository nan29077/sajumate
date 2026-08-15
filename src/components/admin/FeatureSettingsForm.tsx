"use client";

import { Icon } from '@/components/shared/Icon';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, ToggleLeft, BookOpen, Radio, Users, Sparkles, Wand2 } from 'lucide-react';
import { FEATURE_META, FEATURE_GROUPS, type FeatureFlags, type FeatureGroupKey } from "@/lib/featureFlags";
import { useAppDialog } from "@/components/shared/AppDialog";
import SavedPopup from "@/components/shared/SavedPopup";

// 탭으로 노출할 기능 그룹 (스위치가 하나라도 있는 그룹만)
const REMOVED_FEATURE_KEYS = new Set<keyof FeatureFlags>(["groupBuy", "regGroupBuy", "referral", "productRequest"]);
const ACTIVE_FEATURE_META = FEATURE_META.filter((feature) => !REMOVED_FEATURE_KEYS.has(feature.key));
const FEATURE_TABS = FEATURE_GROUPS.filter((g) => ACTIVE_FEATURE_META.some((f) => f.group === g.key));

const GROUP_ICONS: Record<FeatureGroupKey, typeof BookOpen> = {
  transaction: BookOpen,
  content: Radio,
  member: Users,
  appearance: Sparkles,
  theme: Wand2,
};

export default function FeatureSettingsForm({
  initialFlags,
  initialSettlementDays,
  defaultSettlementDays,
}: {
  initialFlags: FeatureFlags;
  initialSettlementDays: number;
  defaultSettlementDays: number;
}) {
  const router = useRouter();
  const { appAlert } = useAppDialog();
  const [flags, setFlags] = useState<FeatureFlags>(initialFlags);
  const [settlementDays, setSettlementDays] = useState<number>(initialSettlementDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [featureTab, setFeatureTab] = useState<FeatureGroupKey>(FEATURE_TABS[0]?.key ?? "transaction");
  const [showSavedPopup, setShowSavedPopup] = useState(false);

  const toggle = (key: keyof FeatureFlags) => {
    setSaved(false);
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags, settlementBusinessDays: settlementDays }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        await appAlert(d.error || "저장에 실패했습니다");
        return;
      }
      const data = await res.json();
      setFlags(data.flags);
      setSettlementDays(data.settlementBusinessDays);
      setSaved(true);
      setShowSavedPopup(true);
      // 변경된 토글이 앱 전반(레이아웃/메뉴)에 반영되도록 서버 컴포넌트 갱신
      router.refresh();
    } catch {
      await appAlert("저장 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SavedPopup show={showSavedPopup} onClose={() => setShowSavedPopup(false)} />
      {/* 기능 토글 — 성격별 그룹 (탭) */}
      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <ToggleLeft size={16} className="text-gray-700" />
          <h2 className="text-sm font-bold text-gray-900">기능 설정</h2>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">기능을 성격별 탭으로 나눴습니다. 끄면 관련 메뉴/화면이 전반에서 숨겨집니다.</p>

        {/* 그룹 탭 바 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {FEATURE_TABS.map((g) => {
            const GroupIcon = GROUP_ICONS[g.key];
            const active = featureTab === g.key;
            const count = ACTIVE_FEATURE_META.filter((f) => f.group === g.key).length;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setFeatureTab(g.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                  active
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
                }`}
              >
                <GroupIcon size={13} strokeWidth={active ? 2 : 1.75} />
                {g.label}
                <span className={`text-[10px] font-medium ${active ? "text-brand-400" : "text-gray-300"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* 선택된 그룹 설명 */}
        {(() => {
          const g = FEATURE_TABS.find((t) => t.key === featureTab);
          return g ? <p className="text-[11px] text-gray-400 mb-2 mt-2">{g.desc}</p> : null;
        })()}

        {/* 선택된 그룹의 스위치 목록 */}
        <div className="divide-y divide-gray-100">
          {ACTIVE_FEATURE_META.filter((f) => f.group === featureTab).map((f) => (
            <div key={f.key} className="py-3.5">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-gray-900">{f.label}</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={flags[f.key]}
                  onClick={() => toggle(f.key)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    flags[f.key] ? "bg-brand-500" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      flags[f.key] ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              {/* 상세 안내 (회색 소형 텍스트) */}
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed pr-14">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 정산일 설정 — 역할별 정산 주기 */}
      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="Calendar" size={16} className="text-gray-700" />
          <h2 className="text-sm font-bold text-gray-900">정산 주기 설정 (영업일 기준)</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:max-w-sm">
          {[
            { label: "상담사 정산 주기", value: settlementDays, set: setSettlementDays },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-gray-100 p-3">
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5">{f.label}</label>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-400">판매완료 후</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={f.value}
                  onChange={(e) => { setSaved(false); f.set(parseInt(e.target.value, 10) || 0); }}
                  className="w-14 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                />
                <span className="text-[11px] text-gray-400">일 후</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2.5">기본값 각 {defaultSettlementDays}일. 영업일 기준 N일 후 정산 예정일이 산정됩니다.</p>
      </section>

      {/* 저장 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          저장
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Icon name="Check" size={14} /> 저장되었습니다
          </span>
        )}
      </div>
    </div>
  );
}
