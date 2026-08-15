"use client";

import { useState } from "react";
import { Loader2, Radio, Sparkles } from "lucide-react";
import { Icon } from "@/components/shared/Icon";

type ShopFeatures = {
  content: boolean;
  liveCommerce: boolean;
};

export default function ShopFeatureToggles({
  initialFeatures,
  adminFlags,
}: {
  initialFeatures: ShopFeatures;
  adminFlags?: ShopFeatures;
}) {
  const [features, setFeatures] = useState(initialFeatures);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const enabledByAdmin = adminFlags ?? { content: true, liveCommerce: true };

  const toggleFeature = async (key: keyof ShopFeatures) => {
    const next = { ...features, [key]: !features[key] };
    setFeatures(next);
    setSaving(true);
    try {
      const response = await fetch("/api/seller/shop-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("설정 저장 실패");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const items = [
    { key: "content" as const, label: "운세 콘텐츠", description: "점집의 소식과 운세 콘텐츠를 보여줍니다.", Icon: Sparkles },
    { key: "liveCommerce" as const, label: "라이브 상담", description: "유튜브·OBS 라이브와 실시간 상담을 운영합니다.", Icon: Radio },
  ].filter((item) => enabledByAdmin[item.key]);

  return (
    <section className="dashboard-panel p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">점집 공개 기능</h3>
          <p className="mt-1 text-xs text-gray-400">고객에게 보여줄 사주메이트 기능을 선택합니다.</p>
        </div>
        {saving ? <Loader2 size={16} className="animate-spin text-brand-500" /> : saved ? <span className="flex items-center gap-1 text-xs text-emerald-600"><Icon name="Check" size={13} /> 저장됨</span> : null}
      </div>

      <div className="space-y-2">
        {items.map(({ key, label, description, Icon: FeatureIcon }) => {
          const active = features[key];
          return (
            <button key={key} type="button" onClick={() => toggleFeature(key)} className={active ? "dashboard-list-card flex w-full items-center gap-3 text-left ring-1 ring-brand-200" : "dashboard-list-card flex w-full items-center gap-3 text-left opacity-65"}>
              <span className="dashboard-icon-tile"><FeatureIcon size={17} /></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-gray-900">{label}</strong><span className="text-[11px] text-gray-400">{description}</span></span>
              <span role="switch" aria-checked={active} className={active ? "relative h-6 w-11 rounded-full bg-brand-600" : "relative h-6 w-11 rounded-full bg-gray-200"}>
                <span className={active ? "absolute left-5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition" : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition"} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
