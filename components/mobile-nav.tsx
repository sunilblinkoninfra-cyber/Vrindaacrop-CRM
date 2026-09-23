"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLink } from "@/components/nav-link";
import {
  IconCampaigns,
  IconDashboard,
  IconImport,
  IconLeads,
  IconPipeline,
  IconReports,
  IconSources,
  IconTemplates,
  IconUsers,
  IconWhatsApp,
} from "@/components/icons";

const nav = [
  { href: "/", label: "Dashboard", icon: <IconDashboard /> },
  { href: "/leads", label: "Leads", icon: <IconLeads /> },
  { href: "/pipeline", label: "Pipeline", icon: <IconPipeline /> },
  { href: "/import", label: "Import & Cleanup", icon: <IconImport />, ownerOnly: true },
  { href: "/campaigns", label: "Campaigns", icon: <IconCampaigns />, ownerOnly: true },
  { href: "/templates", label: "Templates", icon: <IconTemplates />, ownerOnly: true },
  { href: "/reports", label: "Reports", icon: <IconReports /> },
  { href: "/settings/whatsapp", label: "WhatsApp Agent", icon: <IconWhatsApp />, ownerOnly: true },
  { href: "/settings/sources", label: "Lead Sources", icon: <IconSources />, ownerOnly: true },
  { href: "/settings/users", label: "Users", icon: <IconUsers />, ownerOnly: true },
];

export function MobileNav({
  role,
  name,
  email,
  initials,
}: {
  role?: string;
  name: string;
  email: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const visibleNav = nav.filter((item) => !item.ownerOnly || role !== "AGENT");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener("open-mobile-nav", handleOpen);
    return () => window.removeEventListener("open-mobile-nav", handleOpen);
  }, []);

  // Close drawer on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawerContent = open && mounted ? (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation"
    >
      {/* Translucent backdrop with frosted blur */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <aside className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Translucent Drawer Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 py-3.5 backdrop-blur-md pt-[max(0.875rem,env(safe-area-inset-top,0px))]">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="VrindaaCorp"
              width={34}
              height={34}
              className="h-8 w-8 object-contain"
              priority
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">VrindaaCorp</div>
              <div className="truncate text-[11px] text-slate-400">Lead CRM &amp; Outreach</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
          >
            <span className="text-xl leading-none" aria-hidden="true">×</span>
          </button>
        </div>

        {/* Navigation Links List */}
        <nav
          className="flex-1 space-y-1 overflow-y-auto px-3 py-3 [-webkit-overflow-scrolling:touch]"
          onClick={() => setOpen(false)}
        >
          {visibleNav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>

        {/* Translucent Footer User Profile Card */}
        <div className="border-t border-slate-200/80 bg-slate-50/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-xs">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand ring-1 ring-brand/20">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-800">{name}</div>
                <div className="truncate text-[11px] text-slate-400">{email}</div>
              </div>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-xs backdrop-blur-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <span className="sr-only">Open navigation</span>
        <span className="flex flex-col gap-1" aria-hidden="true">
          <span className="h-0.5 w-5 rounded bg-current" />
          <span className="h-0.5 w-5 rounded bg-current" />
          <span className="h-0.5 w-5 rounded bg-current" />
        </span>
      </button>

      {mounted && typeof document !== "undefined" && drawerContent
        ? createPortal(drawerContent, document.body)
        : null}
    </>
  );
}
