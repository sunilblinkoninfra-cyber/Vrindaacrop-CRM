"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
} from "@/components/icons";

const nav = [
  { href: "/", label: "Dashboard", icon: <IconDashboard /> },
  { href: "/leads", label: "Leads", icon: <IconLeads /> },
  { href: "/pipeline", label: "Pipeline", icon: <IconPipeline /> },
  { href: "/import", label: "Import & Cleanup", icon: <IconImport />, ownerOnly: true },
  { href: "/campaigns", label: "Campaigns", icon: <IconCampaigns />, ownerOnly: true },
  { href: "/templates", label: "Templates", icon: <IconTemplates />, ownerOnly: true },
  { href: "/reports", label: "Reports", icon: <IconReports /> },
  { href: "/settings/sources", label: "Lead Sources", icon: <IconSources />, ownerOnly: true },
  { href: "/settings/users", label: "Users", icon: <IconUsers />, ownerOnly: true },
];

export function MobileNav({ role, name, email, initials }: { role?: string; name: string; email: string; initials: string }) {
  const [open, setOpen] = useState(false);
  const visibleNav = nav.filter((item) => !item.ownerOnly || role !== "AGENT");

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        <span className="sr-only">Open navigation</span>
        <span className="flex flex-col gap-1" aria-hidden="true">
          <span className="h-0.5 w-5 rounded bg-current" />
          <span className="h-0.5 w-5 rounded bg-current" />
          <span className="h-0.5 w-5 rounded bg-current" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[min(19rem,88vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Image src="/logo.png" alt="VrindaaCorp" width={34} height={34} className="h-8 w-8 object-contain" priority />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">VrindaaCorp</div>
                  <div className="truncate text-[11px] text-slate-400">Lead CRM &amp; Outreach</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3" onClick={() => setOpen(false)}>
              {visibleNav.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
              ))}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Link href="/account" onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-700">{name}</div>
                    <div className="truncate text-[11px] text-slate-400">{email}</div>
                  </div>
                </Link>
                <SignOutButton />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
