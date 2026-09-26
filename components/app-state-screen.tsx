import type { Ref } from "react";
import { AlertTriangle, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppStateScreenProps = {
  description: string;
  heading: string;
  headingRef?: Ref<HTMLHeadingElement>;
  onRetry?: () => void;
  tone: "loading" | "error" | "forbidden";
};

const stateIcon = {
  loading: Loader2,
  error: AlertTriangle,
  forbidden: LockKeyhole
};

export function AppStateScreen({ description, heading, headingRef, onRetry, tone }: AppStateScreenProps) {
  const Icon = stateIcon[tone];
  const isLoading = tone === "loading";

  return (
    <main
      aria-busy={isLoading || undefined}
      aria-labelledby="app-state-heading"
      aria-describedby="app-state-description"
      className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10"
    >
      <section
        aria-atomic="true"
        aria-live={isLoading ? "polite" : "assertive"}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"
        role={isLoading ? "status" : "alert"}
      >
        <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${isLoading ? "bg-teal-50 text-teal-700" : tone === "error" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700"}`}>
          <Icon aria-hidden="true" className={`h-6 w-6 ${isLoading ? "animate-spin" : ""}`} />
        </div>
        <h1
          className="mt-4 text-lg font-black text-slate-950 focus:outline-none"
          id="app-state-heading"
          ref={headingRef}
          tabIndex={isLoading ? undefined : -1}
        >
          {heading}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500" id="app-state-description">
          {description}
        </p>
        {onRetry ? (
          <Button className="mt-5 min-h-11 w-full" onClick={onRetry} type="button">
            다시 시도
          </Button>
        ) : null}
      </section>
    </main>
  );
}
