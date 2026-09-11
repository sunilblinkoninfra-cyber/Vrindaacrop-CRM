"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconLeads,
  IconPipeline,
  IconCampaigns,
  IconReports,
  IconMenu,
} from "@/components/icons";

interface BottomNavProps {
  role?: string;
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const isAgent = role === "AGENT";

  const fourthItem = isAgent
    ? { href: "/reports", label: "Reports", icon: <IconReports className="h-5 w-5" /> }
    : { href: "/campaigns", label: "Campaigns", icon: <IconCampaigns className="h-5 w-5" /> };

  const items = [
    { href: "/", label: "Dashboard", icon: <IconDashboard className="h-5 w-5" /> },
    { href: "/leads", label: "Leads", icon: <IconLeads className="h-5 w-5" /> },
    { href: "/pipeline", label: "Pipeline", icon: <IconPipeline className="h-5 w-5" /> },
    fourthItem,
  ];

  function openMenu() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-mobile-nav"));
    }
  }

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 py-1 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] backdrop-blur-md lg:hidden pb-safe"
    >
      {items.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-medium transition-all ${
              isActive
                ? "font-semibold text-brand"
                : "text-slate-500 hover:text-slate-900 active:scale-95"
            }`}
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                isActive ? "bg-teal-50 text-brand" : "text-slate-500"
              }`}
            >
              {item.icon}
            </div>
            <span className="truncate leading-none">{item.label}</span>
          </Link>
        );
      })}

      {/* More / Menu Drawer Trigger */}
      <button
        type="button"
        onClick={openMenu}
        aria-label="Open full menu"
        className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-medium text-slate-500 transition-all hover:text-slate-900 active:scale-95"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500">
          <IconMenu className="h-5 w-5" />
        </div>
        <span className="truncate leading-none">More</span>
      </button>
    </nav>
  );
}
