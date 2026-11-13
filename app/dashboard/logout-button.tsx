"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutAllLink } from "@/components/logout-all-link";

export function CustomerLogoutButton() {
  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" onClick={logout}>
        <LogOut className="h-4 w-4" />
        로그아웃
      </Button>
      <LogoutAllLink to="/dashboard/login" />
    </div>
  );
}

