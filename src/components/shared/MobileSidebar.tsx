"use client";

import BrandWordmark from "@/components/shared/BrandWordmark";
import { Icon } from '@/components/shared/Icon';
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from 'lucide-react';
import LogoutButton from "@/components/shared/LogoutButton";
import SafeImage from "@/components/shared/SafeImage";
import NotificationBell from "@/components/shared/NotificationBell";

interface NavItem {
  href: string;
  iconName: string;
  label: string;
  group?: string;
}

interface MobileSidebarProps {
  items: NavItem[];
  roleConfig: { label: string; color: string };
  user: { name?: string | null; email?: string | null; nameInitial: string; avatar?: string | null };
}

export default function MobileSidebar({ items, roleConfig, user }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  // Group items
  const groups: { name: string; items: NavItem[] }[] = [];
  items.forEach((item) => {
    const groupName = item.group || "";
    const existing = groups.find((g) => g.name === groupName);
    if (existing) existing.items.push(item);
    else groups.push({ name: groupName, items: [item] });
  });

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-brand-100 safe-area-top shadow-[0_8px_24px_rgba(56,35,105,0.05)]">
        <div className="flex min-h-14 items-center justify-between px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="min-w-10 min-h-10 inline-flex items-center justify-center -ml-1 text-brand-700 hover:text-brand-900 hover:bg-brand-50 rounded-xl transition-colors"
              aria-expanded={open}
              aria-controls="dashboard-mobile-menu"
              aria-label="메뉴 열기"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <Link href="/" className="flex items-center">
              <BrandWordmark size="sm" />
            </Link>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleConfig.color}`}>
              {roleConfig.label}
            </span>
          </div>
          <div className="flex items-center">
            {/* 대시보드 알림(출금 반려 등) — /my/* 는 고객 전용이라 "전체 보기"는 숨긴다 */}
            <NotificationBell size={18} className="text-gray-400 hover:text-gray-600" buttonClassName="p-2" allHref={null} />
            <Link href="/?main=1" className="min-w-10 min-h-10 inline-flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50">
              <Icon name="Home" size={18} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in Sidebar */}
      <div
        id="dashboard-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="대시보드 메뉴"
        className={`lg:hidden fixed top-0 left-0 bottom-0 w-[min(88vw,320px)] bg-[#fcfaff] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col safe-area-top safe-area-bottom ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex min-h-16 items-center justify-between px-4 py-3 border-b border-gray-100">
          <BrandWordmark size="sm" />
          <button
            onClick={() => setOpen(false)}
            className="min-w-10 min-h-10 inline-flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="메뉴 닫기"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* User Info */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
              <SafeImage
                src={user.avatar}
                alt={user.name || "프로필"}
                width={36}
                height={36}
                fallbackText={user.nameInitial}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto overscroll-contain">
          {groups.map((group, gi) => (
            <div key={group.name || gi} className={gi > 0 ? "mt-3" : ""}>
              {group.name && gi > 0 && (
                <p className="text-[10px] font-bold text-brand-400 tracking-[0.12em] px-3 mb-2">
                  {group.name}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isDashboardRoot = ["/admin", "/seller"].includes(item.href);
                  const isActive = isDashboardRoot
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-11 items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-all ${
                        isActive
                          ? "bg-brand-600 text-white font-bold shadow-sm shadow-brand-950/15"
                          : "text-gray-500 hover:bg-brand-50 hover:text-brand-800"
                      }`}
                    >
                      <Icon name={item.iconName} size={17} className={isActive ? "text-moon-100" : "text-brand-400"} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-gray-100 space-y-0.5 bg-white">
          <Link
            href="/?main=1"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 text-[13px] text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Icon name="Home" size={16} strokeWidth={1.5} />
            메인으로
          </Link>
          <LogoutButton variant="sidebar" />
        </div>
      </div>
    </>
  );
}
