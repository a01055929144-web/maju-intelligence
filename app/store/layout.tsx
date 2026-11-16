import { Suspense, type ReactNode } from "react";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
