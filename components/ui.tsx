import { cn } from "@/lib/utils";
import * as React from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants: Record<string, string> = {
    primary: "bg-brand text-white shadow-sm hover:bg-brand-dark",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-4 sm:p-5", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20",
        className
      )}
      {...props}
    />
  );
}

const stageStyles: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-600 ring-slate-200",
  CONTACTED: "bg-sky-50 text-sky-700 ring-sky-200",
  REPLIED: "bg-amber-50 text-amber-700 ring-amber-200",
  QUALIFIED: "bg-violet-50 text-violet-700 ring-violet-200",
  PROPOSAL_SENT: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  WON: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  LOST: "bg-red-50 text-red-700 ring-red-200",
  // Email validation statuses (keys don't collide with LeadStage above).
  VALID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  UNKNOWN: "bg-slate-100 text-slate-600 ring-slate-200",
  RISKY: "bg-amber-50 text-amber-700 ring-amber-200",
  INVALID: "bg-red-50 text-red-700 ring-red-200",
  DISPOSABLE: "bg-orange-50 text-orange-700 ring-orange-200",
  CATCH_ALL: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone ? stageStyles[tone] ?? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-slate-100 text-slate-600 ring-slate-200",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Consistent page title + subtitle, with optional right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  );
}

/** KPI / stat tile with optional icon and accent. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "text-slate-400",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        {icon && <span className={cn("shrink-0", accent)}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
