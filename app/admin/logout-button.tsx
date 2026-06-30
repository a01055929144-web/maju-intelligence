"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLogoutButton() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <Button variant="outline" onClick={logout}>
      <LogOut className="h-4 w-4" />
      로그아웃
    </Button>
  );
}

