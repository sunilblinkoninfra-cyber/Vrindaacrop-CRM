"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand/10 text-brand"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <span className={cn("shrink-0 transition-colors", active ? "text-brand" : "text-slate-400 group-hover:text-slate-600")}>
        {icon}
      </span>
      {label}
    </Link>
  );
}
