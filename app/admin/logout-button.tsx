"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutAllLink } from "@/components/logout-all-link";

export function AdminLogoutButton({ compact = false, sidebar = false }: { readonly compact?: boolean; readonly sidebar?: boolean } = {}) {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="flex flex-col items-start gap-1">
    <Button className={sidebar ? `h-8 border-white/15 bg-transparent px-2 text-white/70 hover:bg-white/10 hover:text-white ${compact ? "w-9" : ""}` : undefined} variant="outline" onClick={logout}>
      <LogOut className="h-4 w-4" />
      <span className={compact ? "sr-only" : ""}>로그아웃</span>
    </Button>
    {compact ? null : <LogoutAllLink to="/admin/login" />}
    </div>
  );
}

