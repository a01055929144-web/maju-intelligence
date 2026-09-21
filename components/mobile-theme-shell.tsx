"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function MobileThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = window.localStorage.getItem("maju-mobile-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    else if (window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("maju-mobile-theme", next);
  }
  return <div className="mobile-theme-shell min-h-screen" data-mobile-theme={theme}>
    <button aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} className="mobile-theme-toggle fixed right-3 top-3 z-[60] grid h-11 w-11 place-items-center rounded-full border shadow-lg" onClick={toggle} type="button">{theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
    {children}
  </div>;
}
