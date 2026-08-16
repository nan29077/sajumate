"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/shared/Icon";
import SafeImage from "@/components/shared/SafeImage";
import { OnAirBadge, LIVE_RING_CLASS } from "@/components/shared/LiveBadge";
import { X, Search } from "lucide-react";

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

// 단골 상담사가 없을 때 빈 화면에서 상담사 이름/코드로 바로 검색하는 위젯
export default function ConsultantSearchWidget() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/sellers/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => { setResults(d.sellers || []); setOpen(true); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const goToSeller = useCallback((seller: SellerResult) => {
    if (seller.isLive && seller.liveHref) {
      if (seller.isExternalLive) window.open(seller.liveHref, "_blank", "noopener,noreferrer");
      else router.push(seller.liveHref);
    } else {
      router.push(`/shop/${seller.slug}`);
    }
  }, [router]);

  return (
    <div ref={boxRef} className="relative w-full max-w-sm mx-auto mt-6">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="상담사 이름 또는 코드 입력"
          className="w-full pl-10 pr-9 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-300 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-4 text-center text-xs text-gray-400">검색 중…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-500 font-medium">검색 결과가 없어요</p>
              <p className="text-[11px] text-gray-400 mt-1">이름 또는 코드를 정확히 입력해 주세요</p>
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
                    <div className="flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full overflow-hidden bg-gray-100 ${s.isLive ? LIVE_RING_CLASS : "ring-1 ring-gray-100"}`}>
                        <SafeImage
                          src={s.profileImage}
                          alt={s.shopName}
                          width={36}
                          height={36}
                          fallbackText={s.shopName.charAt(0)}
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-semibold text-gray-900 truncate">{s.shopName}</p>
                        {s.isLive && <OnAirBadge />}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{s.category || s.mood || "상담사"}</p>
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
  );
}
