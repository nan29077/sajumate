"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";

import LiveBadge, { LIVE_RING_CLASS } from "@/components/shared/LiveBadge";

interface SellerResult {
  slug: string;
  shopName: string;
  profileImage: string | null;
  category: string | null;
  mood: string | null;
  totalFans: number;
  isLive: boolean;
  liveHref: string | null;
  isExternalLive: boolean;
}

export default function SellerSearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 디바운스 자동완성
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/sellers/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setResults(d.sellers || []);
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const goToSeller = useCallback(
    (seller: SellerResult) => {
      if (seller.isLive && seller.liveHref) {
        if (seller.isExternalLive) {
          window.open(seller.liveHref, "_blank", "noopener,noreferrer");
        } else {
          router.push(seller.liveHref);
        }
      } else {
        router.push(`/shop/${seller.slug}`);
      }
    },
    [router]
  );

  // 엔터: 결과가 1개 이상이면 첫 점집으로 이동(검색 결과가 없으면 그대로 둠).
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      if (results.length > 0) {
        goToSeller(results[0]);
      }
    },
    [query, results, goToSeller]
  );

  return (
    <section className="relative bg-brand-50/50 px-5 pt-7 pb-6">
      <div className="relative">
        {/* 소개 카피 */}
        <div className="inline-flex items-center gap-1 rounded-full bg-white border border-brand-100 px-2.5 py-1 mb-3">
          <Sparkles size={11} className="text-brand-500" />
          <span className="text-[10px] font-semibold text-brand-600">사주메이트</span>
        </div>
        <h1 className="text-[22px] font-extrabold leading-tight text-gray-900">
          좋아하는 <span className="text-brand-600">상담사</span>를 단골로 설정하고,
          <br />그 상담사의 점집·라이브를 즐기세요
        </h1>
        <p className="mt-2 text-[13px] text-gray-500 leading-relaxed">
          상담사를 단골로 설정하면 단골가게가 되고,
          <br />상담사별 전용 공간에서 상담상품·예약·라이브를 만나요.
        </p>

        {/* 상담사 검색 */}
        <div ref={boxRef} className="relative mt-5">
          <form onSubmit={handleSubmit}>
            <div className="relative">
              <Icon name="Search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder="상담사 이름 검색"
                className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-white text-[15px] text-gray-900 placeholder-gray-400 shadow-sm border border-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-300 transition-all"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                  aria-label="검색어 지우기"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </form>

          {/* 자동완성 드롭다운 */}
          {open && query.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="px-4 py-5 text-center text-xs text-gray-400">검색 중…</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-gray-500 font-medium">검색 결과가 없어요</p>
                  <p className="mt-1 text-[11px] text-gray-400">상담사 이름을 정확히 입력해 주세요</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {results.map((s) => (
                    <li key={s.slug}>
                      <button
                        type="button"
                        onClick={() => goToSeller(s)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`w-10 h-10 rounded-full overflow-hidden bg-gray-100 ${s.isLive ? LIVE_RING_CLASS : "ring-1 ring-gray-100"}`}>
                            <SafeImage
                              src={s.profileImage}
                              alt={s.shopName}
                              width={40}
                              height={40}
                              fallbackText={s.shopName.charAt(0)}
                            />
                          </div>
                          {s.isLive && <LiveBadge className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{s.shopName}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {s.category || s.mood || "라이브 점집"}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5 flex-shrink-0">
                          <Icon name="Users" size={10} />
                          {s.totalFans.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
