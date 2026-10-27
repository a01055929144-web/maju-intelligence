import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { isMapFilterPersistenceEnabled } from "@/lib/feature-modules";
import { normalizeMapFilterPresetName, parseMapFilterPresetFilters } from "@/lib/map-filter-presets";
import { deleteMapFilterPreset, getMapFilterPresets, saveMapFilterPreset } from "@/lib/store";

export const dynamic = "force-dynamic";

function resolveActor(session: Awaited<ReturnType<typeof getCustomerSession>>) {
  if (!session) return null;
  if (session.userId) return { actorKey: `app_user:${session.userId}`, appUserId: session.userId };
  if (session.workspaceRole === "owner") return { actorKey: `legacy_owner:${session.companyId}`, appUserId: undefined };
  return null;
}

async function context() {
  const session = await getCustomerSession();
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!isMapFilterPersistenceEnabled()) return { error: NextResponse.json({ enabled: false, presets: [] }) };
  const actor = resolveActor(session);
  if (!actor) return { error: NextResponse.json({ message: "actor_identity_required" }, { status: 409 }) };
  return { actor, session };
}

export async function GET() {
  const resolved = await context();
  if (resolved.error) return resolved.error;
  const presets = await getMapFilterPresets(resolved.session.companyId, resolved.actor.actorKey);
  return NextResponse.json({ enabled: true, presets });
}

export async function POST(request: NextRequest) {
  const resolved = await context();
  if (resolved.error) return resolved.error;
  const body = await request.json().catch(() => null) as { filters?: unknown; name?: unknown } | null;
  const name = normalizeMapFilterPresetName(body?.name);
  const filters = parseMapFilterPresetFilters(body?.filters);
  if (!name || !filters) return NextResponse.json({ message: "저장할 필터 이름과 조건을 확인해주세요." }, { status: 400 });
  const preset = await saveMapFilterPreset({
    ...resolved.actor,
    companyId: resolved.session.companyId,
    filters,
    name
  });
  return NextResponse.json({ preset });
}

export async function DELETE(request: NextRequest) {
  const resolved = await context();
  if (resolved.error) return resolved.error;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "삭제할 필터 ID가 필요합니다." }, { status: 400 });
  await deleteMapFilterPreset(resolved.session.companyId, resolved.actor.actorKey, id);
  return NextResponse.json({ ok: true });
}
