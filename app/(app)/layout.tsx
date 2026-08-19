import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { NavLink } from "@/components/nav-link";
import {
  IconDashboard,
  IconLeads,
  IconPipeline,
  IconImport,
  IconCampaigns,
  IconTemplates,
  IconReports,
  IconSources,
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
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const email = session.user?.email ?? "";
  const role = (session.user as { role?: string }).role;
  const initials = email.slice(0, 2).toUpperCase();
  const visibleNav = nav.filter((item) => !item.ownerOnly || role !== "AGENT");

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Image src="/logo.png" alt="VrindaaCorp" width={36} height={36} className="h-9 w-9 object-contain" priority />
          <div>
            <div className="text-[15px] font-semibold leading-tight text-slate-900">VrindaaCorp</div>
            <div className="text-xs text-slate-400">Lead CRM &amp; Outreach</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
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
                <div className="truncate text-xs font-medium text-slate-700">{session.user?.name ?? "User"}</div>
                <div className="truncate text-[11px] text-slate-400">{email}</div>
              </div>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <main className="ml-64 flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
