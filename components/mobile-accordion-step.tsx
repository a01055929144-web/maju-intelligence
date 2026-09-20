"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

const OPEN_EVENT = "maju-mobile-step-open";

export function openMobileStep(targetId: string) {
  window.history.replaceState(null, "", `#${targetId}`);
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: targetId }));
  requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export function MobileAccordionStep({ children, defaultOpen = false, label, targetId }: {
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
  targetId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash === `#${targetId}`) {
        setOpen(true);
        window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: targetId }));
        requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    const closeOther = (event: Event) => setOpen((event as CustomEvent<string>).detail === targetId);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener(OPEN_EVENT, closeOther);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener(OPEN_EVENT, closeOther);
    };
  }, [targetId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      openMobileStep(targetId);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button aria-expanded={open} className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-black text-slate-800" onClick={toggle} type="button">
        {label}<ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={open ? "block" : "hidden"}>{children}</div>
    </section>
  );
}
