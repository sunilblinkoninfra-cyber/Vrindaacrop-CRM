import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";
import {
  IconDashboard,
  IconLeads,
  IconPipeline,
  IconImport,
  IconCampaigns,
  IconTemplates,
  IconReports,
  IconSources,
  IconUsers,
} from "@/components/icons";

// `ownerOnly` items are hidden from AGENT users (and blocked in middleware).
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const email = session.user?.email ?? "";
  const name = session.user?.name ?? "User";
  const role = (session.user as { role?: string }).role;
  const initials = email.slice(0, 2).toUpperCase();
  const visibleNav = nav.filter((item) => !item.ownerOnly || role !== "AGENT");

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Image src="/logo.png" alt="VrindaaCorp" width={36} height={36} className="h-9 w-9 object-contain" priority />
          <div>
            <div className="text-[15px] font-semibold leading-tight text-slate-900">VrindaaCorp</div>
            <div className="text-xs text-slate-400">Lead CRM &amp; Outreach</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {visibleNav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80" title="Account settings">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
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

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <MobileNav role={role} name={name} email={email} initials={initials} />
          <Image src="/logo.png" alt="VrindaaCorp" width={30} height={30} className="h-7 w-7 object-contain" priority />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">VrindaaCorp</div>
            <div className="truncate text-[10px] text-slate-400">Lead CRM &amp; Outreach</div>
          </div>
        </div>
        <Link href="/account" aria-label="Open account settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
          {initials}
        </Link>
      </header>

      <main className="ml-0 px-4 py-5 sm:px-6 sm:py-6 lg:ml-64 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
