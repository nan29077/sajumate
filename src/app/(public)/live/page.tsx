"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";
import { pickSajuAvatar } from "@/lib/defaults";
import { useFeatureFlags } from "@/components/shared/FeatureFlagsProvider";
import { LIVE_RING_CLASS, OnAirBadge } from "@/components/shared/LiveBadge";

interface SellerCard {
  id: string;
  slug: string;
  shopName: string;
  name: string | null;
  profileImage: string | null;
  mood: string | null;
  isLive: boolean;
  liveShareCode: string | null;
  liveLink: string | null;
}

export default function LiveSearchPage() {
  const { liveCommerce } = useFeatureFlags();
  if (!liveCommerce) notFound();
  return <LiveSearchInner />;
}

function LiveSearchInner() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellerCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [noLinkPopup, setNoLinkPopup] = useState(false);
  const [favLiveSellers, setFavLiveSellers] = useState<SellerCard[]>([]);
  const [favLoading, setFavLoading] = useState(true);

  const runSearch = async (term: string) => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/live/search-sellers?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.sellers || []);
    } catch {} finally { setLoading(false); }
  };

  // 마운트 시 찜한 상담사 중 현재 라이브 중인 분 조회
  useEffect(() => {
    fetch("/api/live/my-live-picks")
      .then(r => r.json())
      .then(d => setFavLiveSellers(d.sellers || []))
      .catch(() => {})
      .finally(() => setFavLoading(false));
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    await runSearch(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="min-h-[80vh]">
      {/* No-link popup */}
      {noLinkPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNoLinkPopup(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="NetworkError" size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">라이브 링크가 연결되어 있지 않습니다</p>
            <p className="text-xs text-gray-400 mb-5">상담사가 아직 라이브 링크를 설정하지 않았습니다.</p>
            <button
              onClick={() => setNoLinkPopup(false)}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Search Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-1 text-gray-400 hover:text-gray-600">
            <Icon name="ArrowRight" size={20} className="rotate-180" />
          </Link>
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="라이브 코드 또는 상담사명으로 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-gray-50 border-0 rounded-full px-4 py-2.5 pl-10 text-sm focus:ring-2 focus:ring-brand-200 focus:bg-white"
              autoFocus
            />
            <Icon name="Search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button onClick={handleSearch} className="px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg">
            검색
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* 단골 상담사 라이브 중 섹션 (검색 전, 로그인한 유저에게만 표시) */}
        {!searched && !favLoading && favLiveSellers.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              단골 상담사 라이브 중
            </p>
            <div className="space-y-3">
              {favLiveSellers.map(s => (
                <SellerCardItem key={s.slug} s={s} onNoLink={() => setNoLinkPopup(true)} />
              ))}
            </div>
          </div>
        )}

        {!searched ? (
          <div className="text-center py-16">
            <Icon name="Live" size={48} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-base font-bold text-gray-800 mb-2">라이브 찾기</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              상담사에게 받은 라이브 코드나<br />
              상담사 이름으로 라이브를 검색하세요.
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-16">
            <Loader2 size={24} className="animate-spin mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">라이브를 검색 중...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="Video" size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">다른 코드나 키워드로 검색해보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">상담사 {results.length}명을 찾았어요</p>
            {results.map(s => (
              <SellerCardItem key={s.slug} s={s} onNoLink={() => setNoLinkPopup(true)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SellerCardItem({ s, onNoLink }: { s: SellerCard; onNoLink: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      {s.isLive && s.liveShareCode ? (
        <Link
          href={`/live/${s.liveShareCode}`}
          className="flex items-center gap-3 hover:bg-gray-50 rounded-lg -mx-1 px-1 py-1 transition-colors"
        >
          <SellerCardAvatar s={s} />
          <SellerCardInfo s={s} />
        </Link>
      ) : s.isLive && s.liveLink ? (
        <button
          onClick={() => window.open(s.liveLink!, "_blank")}
          className="flex items-center gap-3 w-full text-left hover:bg-gray-50 rounded-lg -mx-1 px-1 py-1 transition-colors"
        >
          <SellerCardAvatar s={s} />
          <SellerCardInfo s={s} />
        </button>
      ) : s.isLive ? (
        <button
          onClick={onNoLink}
          className="flex items-center gap-3 w-full text-left hover:bg-gray-50 rounded-lg -mx-1 px-1 py-1 transition-colors"
        >
          <SellerCardAvatar s={s} />
          <SellerCardInfo s={s} />
        </button>
      ) : (
        <Link
          href={`/shop/${s.slug}`}
          className="flex items-center gap-3 hover:bg-gray-50 rounded-lg -mx-1 px-1 py-1 transition-colors"
        >
          <SellerCardAvatar s={s} />
          <SellerCardInfo s={s} />
        </Link>
      )}
      {s.isLive && s.liveShareCode ? (
        <Link href={`/live/${s.liveShareCode}`} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-black text-white text-sm font-bold py-2.5 rounded-xl hover:bg-gray-900">
          라이브 바로가기
        </Link>
      ) : s.isLive && s.liveLink ? (
        <button
          onClick={() => window.open(s.liveLink!, "_blank")}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-black text-white text-sm font-bold py-2.5 rounded-xl hover:bg-gray-900"
        >
          라이브 바로가기
        </button>
      ) : s.isLive ? (
        <button
          onClick={onNoLink}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-red-400 text-white text-sm font-bold py-2.5 rounded-xl opacity-80"
        >
          <Icon name="Live" size={15} /> 라이브 링크 미연결
        </button>
      ) : (
        <Link href={`/shop/${s.slug}`} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-gray-900 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-gray-800">
          상담사 점집으로 이동
        </Link>
      )}
      {s.isLive && (
        <Link href={`/shop/${s.slug}`} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-bold py-2.5 rounded-xl hover:bg-gray-200">
          라이브 점집 바로가기
        </Link>
      )}
    </div>
  );
}

function SellerCardAvatar({ s }: { s: SellerCard }) {
  return (
    <div className="flex-shrink-0">
      <div className={`w-14 h-14 rounded-full overflow-hidden bg-gray-50 ${s.isLive ? LIVE_RING_CLASS : "ring-2 ring-brand-100"}`}>
        <SafeImage src={s.profileImage} placeholder={pickSajuAvatar(s.id)} alt={s.name || s.shopName} width={56} height={56} fallbackText={(s.name || s.shopName).charAt(0)} />
      </div>
    </div>
  );
}

function SellerCardInfo({ s }: { s: SellerCard }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold text-gray-900 truncate">{s.name || s.shopName}</p>
        {s.isLive && <OnAirBadge />}
      </div>
      {s.mood && <p className="text-[11px] text-gray-400 truncate">{s.mood}</p>}
      {s.isLive ? (
        <p className="text-[11px] font-bold text-red-500 mt-0.5">라이브 중입니다</p>
      ) : (
        <p className="text-[11px] text-gray-400 mt-0.5">지금은 방송 중이 아닙니다</p>
      )}
    </div>
  );
}
