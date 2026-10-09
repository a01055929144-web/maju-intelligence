import type { ReactNode } from "react";

export function MobileThemeShell({ children }: { children: ReactNode }) {
  return <div className="mobile-theme-shell min-h-screen" data-mobile-theme="light">{children}</div>;
}
