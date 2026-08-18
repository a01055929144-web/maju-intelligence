import { NextResponse } from "next/server";
import { getSystemDiagnostics } from "@/lib/store";

export async function GET() {
  const startedAt = Date.now();

  try {
    const system = await getSystemDiagnostics();
    const blockingCount = system.blockingIssues.length;
    const warningCount = system.warningIssues.length;
    const databaseReadyCount = system.databaseChecks.filter((check) => check.status === "ready").length;
    const storageReadyCount = system.storageChecks.filter((check) => check.status === "ready").length;
    const ok = system.readyForOperations && system.mode === "production-db";

    return NextResponse.json(
      {
        ok,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        mode: system.mode,
        readinessScore: system.readinessScore,
        blockingCount,
        warningCount,
        databaseChecks: {
          ready: databaseReadyCount,
          total: system.databaseChecks.length
        },
        storageChecks: {
          ready: storageReadyCount,
          total: system.storageChecks.length
        }
      },
      { status: ok ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Health check failed"
      },
      { status: 500 }
    );
  }
}
