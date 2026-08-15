"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from '@/components/shared/Icon';

interface NavItem {
  href: string;
  iconName: string;
  label: string;
  group?: string;
}

export default function SidebarNavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";

  // Group items
  const groups: { name: string; items: NavItem[] }[] = [];
  items.forEach((item) => {
    const groupName = item.group || "";
    const existing = groups.find((g) => g.name === groupName);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ name: groupName, items: [item] });
    }
  });

  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-hide">
      {groups.map((group, gi) => (
        <div key={group.name || gi} className={gi > 0 ? "mt-4" : ""}>
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
                  className={`group flex min-h-10 items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all ${
                    isActive
                      ? "bg-brand-600 text-white font-bold shadow-sm shadow-brand-950/15"
                      : "text-gray-500 hover:bg-brand-50 hover:text-brand-800"
                  }`}
                >
                  <Icon name={item.iconName} size={17} className={isActive ? "text-moon-100" : "text-brand-400 group-hover:text-brand-600"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
