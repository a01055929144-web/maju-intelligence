import { Suspense, type ReactNode } from "react";
import { StoreAppShell } from "@/components/store-app-shell";

// /store 화면만 PC 셸을 쓴다(하위 경로는 셸이 스스로 비켜 선다).
export default function StoreLayout({ children }: { children: ReactNode }) {
  return <Suspense><StoreAppShell>{children}</StoreAppShell></Suspense>;
}
