import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";

export async function GET() {
  const session = getCustomerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ session });
}

