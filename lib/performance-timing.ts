type TimingEntry = { durationMs: number; name: string };

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundDuration(value: number) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function sanitizeMetricName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "unknown";
}

export class RequestTiming {
  private readonly entries: TimingEntry[] = [];
  private readonly startedAt = now();

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = now();
    try {
      return await operation();
    } finally {
      this.entries.push({ durationMs: roundDuration(now() - startedAt), name: sanitizeMetricName(name) });
    }
  }

  measureSync<T>(name: string, operation: () => T): T {
    const startedAt = now();
    try {
      return operation();
    } finally {
      this.entries.push({ durationMs: roundDuration(now() - startedAt), name: sanitizeMetricName(name) });
    }
  }

  finish() {
    return [...this.entries, { durationMs: roundDuration(now() - this.startedAt), name: "total" }];
  }

  toServerTimingHeader() {
    return this.finish().map(({ durationMs, name }) => `${name};dur=${durationMs}`).join(", ");
  }

  log(route: string, status: "ok" | "redirect" = "ok") {
    const timings = Object.fromEntries(this.finish().map(({ durationMs, name }) => [name, durationMs]));
    console.info("[performance]", JSON.stringify({ route, status, timings }));
  }
}

export function reportClientRenderTiming(route: string, startedAt: number) {
  if (typeof performance === "undefined") return;
  const durationMs = roundDuration(performance.now() - startedAt);
  performance.measure(`maju:${sanitizeMetricName(route)}:initial-render`, { duration: durationMs, start: 0 });
  console.debug("[performance]", JSON.stringify({ route, timings: { client_initial_render: durationMs } }));
}
