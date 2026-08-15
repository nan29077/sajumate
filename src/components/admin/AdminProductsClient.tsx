"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useMemo, useCallback } from "react";
import { X, Loader2, Building2, Shield, Star } from 'lucide-react';
import { formatPrice } from "@/lib/utils";
import ProductImage from "@/components/shared/ProductImage";
import AdminProductActions from "@/components/shared/AdminProductActions";
import ProductRegisterForm from "@/components/shared/ProductRegisterForm";
import ProductItemActions from "@/components/shared/ProductItemActions";
import ProductSalesDetail from "@/components/shared/ProductSalesDetail";
import ProductChatPanel from "@/components/shared/ProductChatPanel";
import ProductSellerChatPanel from "@/components/shared/ProductSellerChatPanel";
import { useAppDialog } from "@/components/shared/AppDialog";
import SafeImage from "@/components/shared/SafeImage";
import { pickSajuAvatar } from "@/lib/defaults";

type RegistrarType = "CONSULTANT" | "ADMIN";

interface Product {
  id: string; name: string; basePrice: number;
  supplyPrice?: number | null; middleAdminMargin?: number | null; adminMargin?: number;
  thumbnail: string | null;
  isApproved: boolean; isActive: boolean; brandName: string | null;
  brandId?: string | null; middleAdminId?: string | null;
  registrarSellerId?: string | null; shopSellerIds?: string[];
  categoryName: string | null; sellerNames: string[]; sellerCount: number;
  reviewCount: number; chatCount?: number;
  registeredBy?: string; registrarType?: RegistrarType;
  soldCount?: number; wishlistCount?: number; createdAt?: string;
  sellerLogos?: { id: string; shopName: string; shopLogo: string | null }[];
  activeSellers?: { id: string; shopName: string; shopLogo: string | null }[];
  isSelling?: boolean;
}
interface PendingShop {
  id: string; productId: string; productName: string; productThumbnail: string | null;
  brandName: string | null; sellerName: string; sellerShopLogo?: string | null;
  sellerPrice?: number | null; createdAt?: string;
}
interface Brand {
  id: string;
  brandName: string;
  marginPolicy?: { method: "PERCENTAGE" | "SUPPLY_BASE"; base: "SUPPLY" | "SALE"; rate: number } | null;
}

export default function AdminProductsClient({ products, pendingShopProducts, soldSellerProducts = [], brands, middleAdmins = [], sellers = [], currentUserId }: { products: Product[]; pendingShopProducts: PendingShop[]; soldSellerProducts?: any[]; brands: Brand[]; middleAdmins?: { id: string; name: string }[]; sellers?: { id: string; shopName: string }[]; currentUserId?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  // 1차 분류 탭 (등록자 유형) + 정렬 + 페이지네이션
  const [typeTab, setTypeTab] = useState<"ALL" | RegistrarType | "SELLING">("ALL");
  const [sortBy, setSortBy] = useState<"latest" | "sales" | "popular" | "name">("latest");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const { appConfirm, appAlert } = useAppDialog();

  // 승인 대기(미승인) 상담상품
  const unapproved = useMemo(() => products.filter((p) => !p.isApproved), [products]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedIds((prev) => (prev.size === unapproved.length ? new Set() : new Set(unapproved.map((p) => p.id))));

  const handleBulkApprove = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!await appConfirm({ message: `${ids.length}개 상담상품을 승인할까요?\n승인 시 상담사에게 노출됩니다.` })) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/products/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_approve_products", productIds: ids }),
      });
      if (res.ok) { window.location.reload(); }
      else { const d = await res.json().catch(() => ({})); await appAlert(d.error || "승인 실패"); }
    } catch { await appAlert("오류가 발생했습니다."); }
    finally { setBulkLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (typeTab === "SELLING") return p.isSelling === true;
      if (typeTab !== "ALL" && (p.registrarType || "ADMIN") !== typeTab) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        p.sellerNames.some(s => s.toLowerCase().includes(q))
      );
    });
    if (typeTab === "SELLING" && q) {
      return list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.activeSellers || []).some(s => s.shopName.toLowerCase().includes(q))
      );
    }
    // 정렬
    const sorted = [...list];
    switch (sortBy) {
      case "sales":
        sorted.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
        break;
      case "popular":
        sorted.sort((a, b) => (b.wishlistCount || 0) - (a.wishlistCount || 0) || (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
        break;
      case "latest":
      default:
        sorted.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        break;
    }
    return sorted;
  }, [products, searchQuery, typeTab, sortBy]);

  // 페이지네이션
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  // 등록자 유형별 카운트 (탭 배지)
  const typeCounts = useMemo(() => {
    const c = { ALL: products.length, CONSULTANT: 0, ADMIN: 0, SELLING: 0 } as Record<string, number>;
    for (const p of products) {
      c[p.registrarType || "ADMIN"]++;
      if (p.isSelling) c["SELLING"]++;
    }
    return c;
  }, [products]);

  const handleReject = useCallback(async (productId: string) => {
    if (!await appConfirm({ message: "이 상담상품을 반려하시겠습니까?\n반려 시 상담상품이 삭제됩니다.", type: "warning", confirmText: "반려" })) return;
    setActionLoading(productId);
    try {
      const res = await fetch("/api/admin/products/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_product", productId }),
      });
      if (res.ok) { window.location.reload(); }
      else { const d = await res.json().catch(() => ({})); await appAlert(d.error || "반려 실패"); }
    } catch { await appAlert("오류가 발생했습니다."); }
    setActionLoading(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProductAction = useCallback(async (productId: string, action: string) => {
    if (action === "delete") {
      if (!await appConfirm({ message: "정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.", type: "warning", confirmText: "삭제" })) return;
    }
    if (action === "pauseSale" || action === "stopSale") {
      if (!await appConfirm("상담상품 판매를 중지하시겠습니까?")) return;
    }
    setActionLoading(productId);
    try {
      const res = await fetch("/api/products/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, action }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        await appAlert(data.error || "작업 실패");
      }
    } catch {
      await appAlert("오류가 발생했습니다.");
    }
    setActionLoading(null);
  }, []);

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="dashboard-icon-tile"><Icon name="ConsultProduct" size={19} /></span>
          <div>
          <h1 className="text-lg sm:text-xl font-bold text-brand-950">상담상품 관리</h1>
          <p className="text-xs sm:text-sm text-gray-500">상담 서비스와 승인 상태를 관리합니다 · 총 {products.length}개</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <ProductRegisterForm brands={brands} mode="admin" hideGroupBuy />
        </div>
      </div>

      {/* 상담상품 승인 대기 */}
      {unapproved.length > 0 && (
        <div className="dashboard-panel border-moon-500/30">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3">
            <Icon name="Warning" size={14} className="text-amber-500" />
            <p className="text-sm font-bold text-amber-700">상담상품 승인 대기</p>
            <span className="text-[11px] bg-moon-100 text-moon-700 px-1.5 py-0.5 rounded-full">{unapproved.length}</span>
          </div>
          <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 py-2.5">
                <p className="text-[11px] text-gray-400">관리자가 등록한 상담상품입니다. 승인 후 상담사에게 노출됩니다.</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                  >
                    {selectedIds.size === unapproved.length ? "전체 해제" : "전체 선택"}
                  </button>
                  <button
                    onClick={() => handleBulkApprove(Array.from(selectedIds))}
                    disabled={bulkLoading || selectedIds.size === 0}
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <Icon name="Play" size={13} />}
                    선택 승인 ({selectedIds.size})
                  </button>
                </div>
              </div>
              {unapproved.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Star size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">승인 대기 상담상품이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 px-2 py-2">
                  {unapproved.map((p) => {
                    const checked = selectedIds.has(p.id);
                    return (
                      <label key={p.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 px-2 py-2.5 rounded-lg cursor-pointer ${checked ? "bg-emerald-50/60" : "hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleSelect(p.id)} className="w-4 h-4 accent-emerald-600 flex-shrink-0" />
                        <div className="w-6 h-6 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <ProductImage src={p.thumbnail} alt={p.name} width={40} height={40} className="w-full h-full object-cover" iconSize={10} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">관리자 등록 · {formatPrice(p.basePrice)}</p>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto flex-shrink-0" onClick={(e) => e.preventDefault()}>
                          <button
                            onClick={(e) => { e.preventDefault(); window.open(`/products/${p.id}`, "_blank"); }}
                            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                          >
                            <Icon name="ArrowRight" size={12} className="shrink-0" /> 상세
                          </button>
                          <AdminProductActions type="approve_product" productId={p.id} brands={[]} />
                          <button
                            onClick={(e) => { e.preventDefault(); handleReject(p.id); }}
                            disabled={bulkLoading || actionLoading === p.id}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            반려
                          </button>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="상담상품명, 분야, 상담사 검색..."
            className="input-field pl-9 pr-8 py-2 text-sm" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
          )}
        </div>
      </div>

      {/* Pending Seller Applications */}
      {pendingShopProducts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="Warning" size={16} strokeWidth={1.5} className="text-yellow-500" />
            <h2 className="text-sm font-bold text-gray-700">상담사 상담상품 신청 대기 ({pendingShopProducts.length})</h2>
          </div>
          <div className="bg-moon-50 rounded-2xl border border-moon-500/25 overflow-hidden divide-y divide-moon-100">
            {pendingShopProducts.map((sp) => (
              <div key={sp.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 sm:p-4">
                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                  <ProductImage src={sp.productThumbnail} alt={sp.productName} width={40} height={40} className="w-full h-full object-cover" iconSize={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{sp.productName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">상담사: {sp.sellerName}</span>
                    {sp.sellerPrice != null && <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded font-medium">판매가 {sp.sellerPrice.toLocaleString("ko-KR")}원</span>}
                    {sp.createdAt && <span className="text-[10px] text-gray-400">{new Date(sp.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto flex-shrink-0">
                  <button
                    onClick={() => window.open(`/products/${sp.productId}`, "_blank")}
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                    title="상담상품 상세 보기"
                  >
                    <Icon name="ArrowRight" size={12} className="shrink-0" /> 상담상품 상세 보기
                  </button>
                  {currentUserId && (
                    <ProductChatPanel
                      productId={sp.productId}
                      productName={sp.productName}
                      currentUserId={currentUserId}
                    />
                  )}
                  <AdminProductActions type="approve_shop" shopProductId={sp.id} brands={brands} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 등록자 유형 탭 + 정렬 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto pb-0.5">
          {([
            { v: "ALL", l: "전체" },
            { v: "SELLING", l: "판매중" },
            { v: "CONSULTANT", l: "상담사" },
            { v: "ADMIN", l: "관리자" },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => { setTypeTab(t.v); setPage(1); }}
              className={`flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full border whitespace-nowrap transition-colors ${
                typeTab === t.v
                  ? t.v === "SELLING"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-brand-600 text-white border-brand-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600"
              }`}
            >
              {t.l}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeTab === t.v ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}>{typeCounts[t.v] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-shrink-0">
          <Icon name="ChevronDown" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
            className="pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="latest">최신순</option>
            <option value="sales">판매 많은 순</option>
            <option value="popular">인기순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>

      {/* Products list */}
      <div className="dashboard-panel">
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Icon name="ConsultProduct" size={36} className="mx-auto mb-2 text-brand-200" />
              <p className="text-sm">{searchQuery ? "검색 결과가 없습니다." : "등록된 상담상품이 없습니다."}</p>
            </div>
          ) : paged.map((product) => {
            const rt = REGISTRAR_BADGE[product.registrarType || "ADMIN"];
            const showSellers = typeTab === "SELLING" && (product.activeSellers || []).length > 0;
            return (
            <div key={product.id} className="p-3 sm:p-4 hover:bg-gray-50">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                  <ProductImage src={product.thumbnail} alt={product.name} width={48} height={48} className="w-full h-full object-cover" iconSize={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {/* 등록자 구분 배지 */}
                    {typeTab !== "SELLING" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5 ${rt.cls}`}>
                        <rt.icon size={9} /> {product.registrarType === "CONSULTANT" && product.sellerNames.length > 0 ? product.sellerNames[0] : rt.label}
                      </span>
                    )}
                    {product.categoryName && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{product.categoryName}</span>}
                    {/* 판매중 탭에서는 활성 상담사 이름 표시 */}
                    {showSellers ? (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                        판매중 {(product.activeSellers || []).length}개 점집
                      </span>
                    ) : product.sellerNames.length > 0 && (
                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                        판매 상담사 {product.sellerCount}
                      </span>
                    )}
                    {(product.soldCount || 0) > 0 && (
                      <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded font-medium">판매 {product.soldCount}</span>
                    )}
                  </div>
                  {/* 판매중 탭: 판매 점집 목록 표시 */}
                  {showSellers && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(product.activeSellers || []).map((s) => (
                        <div key={s.id} className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full">
                          <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                            <SafeImage src={s.shopLogo} placeholder={pickSajuAvatar(s.id)} alt={s.shopName} width={14} height={14} fallbackText={s.shopName.charAt(0)} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] text-emerald-700 font-medium">{s.shopName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold">{formatPrice(product.basePrice)}</p>
                  {(product.supplyPrice != null || product.middleAdminMargin != null || (product.adminMargin ?? 0) > 0) && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {product.supplyPrice != null && <span>공급 {product.supplyPrice.toLocaleString()}</span>}
                      {product.supplyPrice != null && product.middleAdminMargin != null && " · "}
                      {product.middleAdminMargin != null && <span>중간마진 {product.middleAdminMargin.toLocaleString()}</span>}
                      {(product.adminMargin ?? 0) > 0 && (
                        <span className="text-amber-600"> · 관리자마진 {(product.adminMargin ?? 0).toLocaleString()}</span>
                      )}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-end">
                    {!product.isApproved ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-600">승인대기</span>
                    ) : product.isActive ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-50 text-green-600">승인완료</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">판매중지</span>
                    )}
                    {!product.isApproved && (
                      <>
                        <AdminProductActions type="approve_product" productId={product.id} brands={[]} />
                        <button
                          onClick={() => handleReject(product.id)}
                          disabled={actionLoading === product.id}
                          className="text-[11px] font-medium px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
                        >
                          반려
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 w-full sm:w-auto pt-2 sm:pt-0 mt-1 sm:mt-0 border-t sm:border-t-0 border-gray-100 flex-shrink-0">
                  <button
                    onClick={() => window.open(`/products/${product.id}`, "_blank")}
                    className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="상담상품 상세 보기 (새 창)"
                  >
                    <Icon name="Info" size={14} />
                  </button>
                  {actionLoading === product.id ? (
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                  ) : product.isActive ? (
                    <button
                      onClick={() => handleProductAction(product.id, "hide")}
                      className="p-2 sm:p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition-colors"
                      title="판매중지"
                    >
                      <Icon name="Pause" size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleProductAction(product.id, "show")}
                      className="p-2 sm:p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700 transition-colors"
                      title="판매재개"
                    >
                      <Icon name="Play" size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleProductAction(product.id, "delete")}
                    className="p-2 sm:p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="삭제"
                  >
                    <Icon name="Delete" size={14} />
                  </button>
                  <ProductSalesDetail productId={product.id} productName={product.name} thumbnail={product.thumbnail} />
                  {currentUserId && (
                    <ProductSellerChatPanel
                      productId={product.id}
                      productName={product.name}
                      currentUserId={currentUserId}
                      sellers={(product.sellerLogos || []).map(s => ({ id: s.id, shopName: s.shopName, shopLogo: s.shopLogo }))}
                    />
                  )}
                  <ProductItemActions productId={product.id} mode="admin" isActive={product.isActive} />
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* 페이지네이션 */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="ChevronDown" size={16} className="rotate-90" />
          </button>
          <span className="text-xs text-gray-500">
            {currentPage} / {totalPages} 페이지
            <span className="text-gray-300 mx-1">·</span>
            총 {filtered.length}개
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="ChevronDown" size={16} className="-rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}

// 등록자 유형 배지 스타일
const REGISTRAR_BADGE: Record<RegistrarType, { label: string; cls: string; icon: any }> = {
  CONSULTANT: { label: "상담사", cls: "text-blue-600 bg-blue-50", icon: Building2 },
  ADMIN: { label: "관리자", cls: "text-gray-600 bg-gray-100", icon: Shield },
};
