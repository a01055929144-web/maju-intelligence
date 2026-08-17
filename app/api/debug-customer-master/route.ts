import { NextResponse } from "next/server";
import { getCustomerMaster } from "@/lib/store";

export const dynamic = "force-dynamic";

// TEMPORARY diagnostic route — pinpoints why getCustomerMaster() is throwing in production.
// Deleted immediately after use; not part of the feature.
export async function GET() {
  try {
    const result = await getCustomerMaster();
    return NextResponse.json({ ok: true, count: result.customers.length });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
