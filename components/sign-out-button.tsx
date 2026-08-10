"use client";

import { signOut } from "next-auth/react";
import { IconLogout } from "@/components/icons";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sign out"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
    >
      <IconLogout width={16} height={16} />
    </button>
  );
}
