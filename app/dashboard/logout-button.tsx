"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CustomerLogoutButton() {
  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <Button variant="outline" onClick={logout}>
      <LogOut className="h-4 w-4" />
      로그아웃
    </Button>
  );
}

