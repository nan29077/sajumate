"use client";

import BrandWordmark from "@/components/shared/BrandWordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Instagram, Youtube, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import type { FeatureFlags, SocialLinks } from "@/lib/featureFlags";
import type { FooterSettings } from "@/lib/settings";
import { FOOTER_DEFAULTS } from "@/lib/settings";
import { useShopChrome } from "@/components/shared/ShopChromeProvider";

export default function Footer({
  flags,
  socialLinks,
  footerSettings,
}: {
  flags: FeatureFlags;
  socialLinks?: SocialLinks;
  footerSettings?: FooterSettings;
}) {
  const pathname = usePathname() ?? "";
  const { subpageActive } = useShopChrome();
  if (/^\/shop\/[^\/]+/.test(pathname) || subpageActive) return null;

  const footer = footerSettings ?? FOOTER_DEFAULTS;
  const copyright = footer.copyright.replace(/sellerbricks/gi, "사주메이트");

  // 활성화된 소셜 링크만 렌더
  const activeSocials: { href: string; icon: typeof Instagram; label: string }[] = [];
  if (socialLinks?.instagramEnabled && socialLinks.instagramUrl) {
    activeSocials.push({ href: socialLinks.instagramUrl, icon: Instagram, label: "인스타그램" });
  }
  if (socialLinks?.youtubeEnabled && socialLinks.youtubeUrl) {
    activeSocials.push({ href: socialLinks.youtubeUrl, icon: Youtube, label: "유튜브" });
  }
  if (socialLinks?.emailEnabled && socialLinks.emailUrl) {
    activeSocials.push({ href: socialLinks.emailUrl, icon: Mail, label: "이메일" });
  }

  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="px-4 py-5">
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* 브랜드 */}
          <div className="col-span-2">
            <Link href="/" className="inline-block mb-3">
              <BrandWordmark size="lg" variant="light" />
            </Link>
            {activeSocials.length > 0 && (
              <div className="flex gap-2">
                {activeSocials.map(({ href, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="p-1.5 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                  >
                    <Icon size={14} strokeWidth={1.5} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* 서비스 */}
          <div>
            <h4 className="text-xs font-semibold text-white mb-3">서비스</h4>
            <ul className="space-y-2">
              <li><Link href="/auth/register?role=seller" className="text-xs hover:text-white transition-colors">상담사 신청하기</Link></li>
              <li><Link href="/support/seller-guide" className="text-xs hover:text-white transition-colors">상담사 신청 안내</Link></li>
              <li><Link href="/support/terms" className="text-xs hover:text-white transition-colors">이용약관</Link></li>
              <li><Link href="/support/privacy" className="text-xs hover:text-white transition-colors">개인정보처리방침</Link></li>
            </ul>
          </div>

          {/* 고객센터 */}
          <div>
            <h4 className="text-xs font-semibold text-white mb-3">고객센터</h4>
            <ul className="space-y-2">
              <li><Link href="/support/contact" className="text-xs hover:text-white transition-colors">1대1 문의</Link></li>
              <li><Link href="/support/faq" className="text-xs hover:text-white transition-colors">자주 묻는 질문</Link></li>
              <li><Link href="/support/shipping" className="text-xs hover:text-white transition-colors">상담 방식 안내</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <div className="space-y-2 text-[10px] text-gray-500 leading-relaxed">
            <div className="space-y-0.5">
              <p>
                <span className="text-gray-400">상호</span> {footer.companyName}
                <span className="mx-1.5 text-gray-700">|</span>
                <span className="text-gray-400">대표</span> {footer.ceoName}
              </p>
              <p>
                <span className="text-gray-400">사업자등록번호</span> {footer.bizNum}
                <span className="mx-1.5 text-gray-700">|</span>
                <span className="text-gray-400">통신판매신고번호</span> {footer.mailOrderNum}
              </p>
              <p>
                <span className="text-gray-400">대표번호</span> {footer.phone}
              </p>
              <p>
                <span className="text-gray-400">주소</span> {footer.address}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 pt-2 border-t border-gray-900">
              <div className="flex gap-3">
                <Link href="/support/terms" className="hover:text-gray-300">이용약관</Link>
                <Link href="/support/privacy" className="hover:text-gray-300">개인정보처리방침</Link>
                <a href="#" className="hover:text-gray-300">사업자정보확인</a>
              </div>
              <p>&copy; {copyright}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 모바일 하단 네비 높이만큼 여백 */}
      <div className="h-16" />
    </footer>
  );
}
