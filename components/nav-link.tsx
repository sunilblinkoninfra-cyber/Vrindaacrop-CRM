"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
  icon,
  compactOnTablet = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  compactOnTablet?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        compactOnTablet && "md:justify-center md:px-2 lg:justify-start lg:px-3",
        active
          ? "bg-brand/10 text-brand font-semibold"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <span className={cn("shrink-0 transition-colors", active ? "text-brand" : "text-slate-400 group-hover:text-slate-600")}>
        {icon}
      </span>
      <span className={cn("truncate", compactOnTablet && "md:hidden lg:inline")}>
        {label}
      </span>
    </Link>
  );
}
