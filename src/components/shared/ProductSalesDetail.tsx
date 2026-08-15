"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import { X, Loader2 } from 'lucide-react';
import ProductImage from "@/components/shared/ProductImage";
import SafeImage from "@/components/shared/SafeImage";
import { pickSajuAvatar } from "@/lib/defaults";

interface SellerSale {
  sellerId: string;
  shopName: string;
  shopLogo: string | null;
  slug: string;
  totalOrders: number;
  totalQuantity: number;
  totalRevenue: number;
  isShopProduct: boolean;
}

interface Props {
  productId: string;
  productName: string;
  thumbnail?: string | null;
  trigger?: React.ReactNode;
}

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function ProductSalesDetail({ productId, productName, thumbnail, trigger }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    sellerSales: SellerSale[];
    totalSellers: number;
    totalOrders: number;
    totalRevenue: number;
  } | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/sales?productId=${productId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (isOpen && !data) {
      fetchSales();
    }
  }, [isOpen]);

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsOpen(true)} className="cursor-pointer">
          {trigger}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1 text-[10px] py-1.5 px-2.5 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors"
        >
          <Icon name="Chart" size={10} /> 판매내역
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Handle bar */}
            <div className="flex justify-center pt-2 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                  <ProductImage
                    src={thumbnail}
                    alt={productName}
                    width={36}
                    height={36}
                    className="w-full h-full object-cover"
                    iconSize={14}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-gray-900 truncate">{productName}</h3>
                  <p className="text-[10px] text-gray-400">상담사별 판매내역</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : !data || data.sellerSales.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Icon name="Package" size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">판매 상담사가 없습니다</p>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-2 px-5 py-4">
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <Icon name="Users" size={14} className="mx-auto text-blue-500 mb-1" />
                      <p className="text-lg font-bold text-blue-700">{data.totalSellers}</p>
                      <p className="text-[9px] text-blue-500">상담사</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                      <Icon name="Cart" size={14} className="mx-auto text-emerald-500 mb-1" />
                      <p className="text-lg font-bold text-emerald-700">{data.totalOrders}</p>
                      <p className="text-[9px] text-emerald-500">예약</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 text-center">
                      <Icon name="Chart" size={14} className="mx-auto text-orange-500 mb-1" />
                      <p className="text-lg font-bold text-orange-700">{formatPrice(data.totalRevenue)}</p>
                      <p className="text-[9px] text-orange-500">매출</p>
                    </div>
                  </div>

                  {/* Seller list */}
                  <div className="px-5 pb-5 space-y-2">
                    {data.sellerSales.map((seller, idx) => (
                      <div
                        key={seller.sellerId}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-white">
                            <SafeImage
                              src={seller.shopLogo}
                              alt={seller.shopName}
                              width={40}
                              height={40}
                              placeholder={pickSajuAvatar(seller.sellerId)}
                              fallbackText={seller.shopName.charAt(0)}
                            />
                          </div>
                          <span className="absolute -top-1 -left-1 w-5 h-5 bg-gray-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {idx + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{seller.shopName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {seller.isShopProduct && (
                              <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">일반판매</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-900">
                            {seller.totalRevenue > 0 ? formatPrice(seller.totalRevenue) : "-"}
                          </p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[10px] text-gray-400">
                              예약 {seller.totalOrders}건
                            </span>
                            <span className="text-[10px] text-gray-400">
                              수량 {seller.totalQuantity}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Bottom */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50 sm:rounded-b-2xl">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 text-sm font-medium text-gray-600 bg-white rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
