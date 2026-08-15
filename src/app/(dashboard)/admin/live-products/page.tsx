"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Radio, X } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import SafeImage from "@/components/shared/SafeImage";
import Pagination, { usePagination } from "@/components/shared/Pagination";
import { NO_IMAGE } from "@/lib/defaults";

type ProductItem = {
  id: string;
  name: string;
  thumbnail: string | null;
  basePrice: number;
  categoryName: string | null;
  allowLiveCommerce: boolean;
};

export default function AdminLiveProductsPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/products/register?mode=admin-manage");
      const data = await response.json();
      setProducts(
        (data.products ?? []).map((product: any) => ({
          id: product.id,
          name: product.name,
          thumbnail: product.thumbnail,
          basePrice: Number(product.basePrice),
          categoryName: product.category?.name || product.categoryName || null,
          allowLiveCommerce: product.allowLiveCommerce ?? false,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleLive = async (product: ProductItem) => {
    const action = product.allowLiveCommerce ? "disableLiveCommerce" : "enableLiveCommerce";
    setActionLoading(product.id);
    try {
      const response = await fetch("/api/products/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, action }),
      });
      if (response.ok) {
        setProducts((current) =>
          current.map((item) =>
            item.id === product.id ? { ...item, allowLiveCommerce: !item.allowLiveCommerce } : item,
          ),
        );
      }
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return products.filter((product) => {
      if (onlyEnabled && !product.allowLiveCommerce) return false;
      return !keyword || product.name.toLowerCase().includes(keyword) || product.categoryName?.toLowerCase().includes(keyword);
    });
  }, [onlyEnabled, products, search]);

  const { pageItems, page, setPage, totalPages } = usePagination(filtered, 20);
  const enabledCount = products.filter((product) => product.allowLiveCommerce).length;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-400" size={26} /></div>;
  }

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-page-header">
        <div>
          <h1 className="dashboard-page-title"><Radio size={21} /> 라이브 상담상품 관리</h1>
          <p className="dashboard-page-description">라이브 방송에서 소개할 상담상품을 설정합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="dashboard-stat-card"><Icon name="Package" size={18} /><strong>{products.length}</strong><span>전체 상담상품</span></div>
        <div className="dashboard-stat-card"><Radio size={18} /><strong>{enabledCount}</strong><span>라이브 사용</span></div>
      </div>

      <div className="dashboard-toolbar">
        <div className="relative flex-1">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상담상품명 또는 분야 검색" className="dashboard-search-input" />
        </div>
        <button type="button" onClick={() => setOnlyEnabled((value) => !value)} className={onlyEnabled ? "dashboard-filter-button dashboard-filter-button-active" : "dashboard-filter-button"}>
          라이브 사용 중
        </button>
      </div>

      <div className="space-y-2">
        {pageItems.map((product) => (
          <div key={product.id} className="dashboard-list-card flex items-center gap-3">
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-brand-50">
              <SafeImage src={product.thumbnail} placeholder={NO_IMAGE} alt={product.name} width={56} height={56} fallbackText={product.name} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
              <p className="mt-0.5 text-xs text-gray-400">{product.categoryName || "상담"} · {product.basePrice.toLocaleString()}원</p>
            </div>
            <button type="button" disabled={actionLoading === product.id} onClick={() => toggleLive(product)} className={product.allowLiveCommerce ? "dashboard-toggle-button dashboard-toggle-button-active" : "dashboard-toggle-button"}>
              {actionLoading === product.id ? <Loader2 size={13} className="animate-spin" /> : product.allowLiveCommerce ? <Radio size={13} /> : <X size={13} />}
              {product.allowLiveCommerce ? "사용 중" : "사용 안 함"}
            </button>
          </div>
        ))}
        {filtered.length === 0 && <div className="dashboard-empty-state"><Radio size={34} /><p>조건에 맞는 상담상품이 없습니다.</p></div>}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
