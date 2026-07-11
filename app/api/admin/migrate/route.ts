import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
// @ts-expect-error pg ships without local type declarations in this project.
import pg from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const session = requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!connectionString) {
    return NextResponse.json({ message: "POSTGRES_URL_NON_POOLING 또는 POSTGRES_URL이 필요합니다." }, { status: 500 });
  }

  const root = process.cwd();
  const files = [
    path.join(root, "supabase", "schema.sql"),
    ...fs
      .readdirSync(path.join(root, "supabase", "migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => path.join(root, "supabase", "migrations", file))
  ];

  const { Client } = pg;
  const client = new Client({
    connectionString: normalizePostgresUrl(connectionString),
    ssl: { rejectUnauthorized: false }
  });
  const applied: string[] = [];

  try {
    await client.connect();
    for (const file of files) {
      await client.query(fs.readFileSync(file, "utf8"));
      applied.push(path.relative(root, file).replace(/\\/g, "/"));
    }
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    return NextResponse.json(
      { ok: false, applied, message: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function normalizePostgresUrl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    ["sslmode", "sslrootcert", "sslcert", "sslkey"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return connectionString;
  }
}
