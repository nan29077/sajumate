"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";

interface SellerShopFooterProps {
  sellerInfo: {
    shopName: string;
    businessType: string | null;
    representativeName: string | null;
    businessRegistrationNo: string | null;
    telecomSalesLicenseNo: string | null;
    businessAddress: string | null;
    businessCategory: string | null;
  };
}

export default function SellerShopFooter({ sellerInfo }: SellerShopFooterProps) {
  const [open, setOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usagePolicy, setUsagePolicy] = useState<string | null>(null);

  // 최고관리자 "라이브 점집 정책 > 이용 안내"(usagePolicy)를 불러와 표시
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d) => {
        if (d.usagePolicy) setUsagePolicy(d.usagePolicy);
      })
      .catch(() => {});
  }, []);

  const isBusiness = sellerInfo.businessType === "business";

  // 표시할 상담사 사업자 정보 행 (값이 있는 항목만)
  const rows: { label: string; value: string }[] = [
    { label: "상호", value: sellerInfo.shopName },
    ...(sellerInfo.representativeName ? [{ label: "대표자", value: sellerInfo.representativeName }] : []),
    ...(sellerInfo.businessRegistrationNo ? [{ label: "사업자등록번호", value: sellerInfo.businessRegistrationNo }] : []),
    ...(sellerInfo.telecomSalesLicenseNo ? [{ label: "통신판매업신고", value: sellerInfo.telecomSalesLicenseNo }] : []),
    ...(sellerInfo.businessCategory ? [{ label: "업종/업태", value: sellerInfo.businessCategory }] : []),
    ...(sellerInfo.businessAddress ? [{ label: "주소", value: sellerInfo.businessAddress }] : []),
  ];

  return (
    <footer className="mt-8 border-t border-brand-100/70 bg-[#F1EEF8]">
      <div className="px-4 py-5 space-y-3">
        {/* ── 판매자(상담사) 사업자 정보 ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon name="Store" size={13} className="text-gray-400" />
            <h4 className="text-[11px] font-bold text-gray-500">판매자 정보</h4>
            <span className="text-[9px] text-gray-300">
              {isBusiness ? "사업자 판매자" : "개인 판매자"}
            </span>
          </div>
          <div className="space-y-1">
            {rows.map((r) => (
              <p key={r.label} className="text-[10px] text-gray-500 leading-relaxed">
                <span className="text-gray-400">{r.label}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="text-gray-600">{r.value}</span>
              </p>
            ))}
          </div>
        </div>

        {/* ── 통신판매중개자(사주메이트) 고지 ── */}
        <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
          >
            <Icon name="Info" size={13} className="text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-[10.5px] text-gray-500 leading-snug">
              <b className="text-gray-600 font-semibold">사주메이트는 통신판매중개자</b>이며 거래의 당사자가 아닙니다.
            </span>
            <span className="text-[9px] text-gray-400 flex items-center gap-0.5 flex-shrink-0">
              자세히 보기
              <Icon name="ChevronDown" size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </span>
          </button>

          {open && (
            <div className="px-3 pb-3 pt-0.5 border-t border-gray-50 animate-fade-in">
              <p className="text-[10px] text-gray-500 leading-relaxed mt-2">
                사주메이트는 통신판매중개자로서 통신판매의 당사자가 아니며, 상담상품의 예약·상담 방식·환불 등 거래에 대한
                의무와 책임은 판매자(상담사)에게 있습니다. 사주메이트는 거래 시스템(플랫폼)을 제공할 뿐 개별 거래에 대해서는
                책임을 지지 않습니다.
              </p>
              <div className="mt-3 pt-3 border-t border-gray-50 space-y-0.5 text-[10px] text-gray-400 leading-relaxed">
                <p className="font-semibold text-gray-500 mb-1">통신판매중개자 정보</p>
                <p><span className="text-gray-400">상호</span> 주식회사 이십세기소년들 · <span className="text-gray-400">대표</span> 박진혜</p>
                <p><span className="text-gray-400">사업자등록번호</span> 662-86-02270</p>
                <p><span className="text-gray-400">통신판매신고번호</span> 2022-고양일산서-0400</p>
                <p><span className="text-gray-400">대표번호</span> 070-4158-2540</p>
                <p><span className="text-gray-400">주소</span> 경기도 고양시 일산서구 킨텍스로 240, 2501호</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 이용 안내 (usagePolicy) ── */}
        {usagePolicy && (
          <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setUsageOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            >
              <Icon name="File" size={13} className="text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-[10.5px] font-semibold text-gray-600 leading-snug">
                이용 안내
              </span>
              <Icon name="ChevronDown" size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${usageOpen ? "rotate-180" : ""}`} />
            </button>

            {usageOpen && (
              <div className="px-3 pb-3 pt-0.5 border-t border-gray-50 animate-fade-in">
                <div className="text-[10px] text-gray-500 leading-relaxed mt-2 whitespace-pre-line">
                  {usagePolicy}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 text-center pt-1">
          &copy; {new Date().getFullYear()} 사주메이트. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
