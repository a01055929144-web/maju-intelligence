"use client";

import { useEffect } from "react";

export function PreviewRedirect() {
  useEffect(() => {
    const token = window.location.hash;
    if (token) window.location.replace(`/pricing-document${token}`);
  }, []);
  return <p className="text-sm text-slate-600">단가표를 여는 중입니다…</p>;
}
