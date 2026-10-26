import { createHash, randomBytes } from "crypto";
import { supabaseRequest, upsertStaffMobileLocation } from "./store";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueStaffLocationDeviceToken(input: { companyId: string; userId: string; actorName: string; consentVersion: string; deviceLabel?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 180 * 86400000).toISOString();
  await supabaseRequest("staff_location_device_tokens", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      actor_name: input.actorName,
      company_id: input.companyId,
      consent_version: input.consentVersion,
      device_label: input.deviceLabel?.trim().slice(0, 80) || "Android",
      expires_at: expiresAt,
      token_hash: tokenHash(token),
      token_prefix: token.slice(0, 10),
      user_id: input.userId
    })
  });
  return { expiresAt, token };
}

export async function revokeStaffLocationDeviceTokens(companyId: string, userId: string) {
  await supabaseRequest(`staff_location_device_tokens?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  });
}

export async function saveStaffLocationBatch(deviceToken: string, samples: Array<Record<string, unknown>>, userAgent?: string) {
  const rows = await supabaseRequest<Array<{ company_id: string; user_id: string; actor_name: string | null; expires_at: string }>>(
    `staff_location_device_tokens?select=company_id,user_id,actor_name,expires_at&token_hash=eq.${tokenHash(deviceToken)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
  );
  const token = rows[0];
  if (!token) throw new Error("DEVICE_TOKEN_INVALID");
  const ordered = [...samples].sort((left, right) => String(left.recordedAt || "").localeCompare(String(right.recordedAt || "")));
  let accepted = 0;
  for (const sample of ordered) {
    const result = await upsertStaffMobileLocation({
      accuracyMeters: Number(sample.accuracyM), companyId: token.company_id, driverName: token.actor_name || "모바일 직원",
      lat: Number(sample.latitude), lng: Number(sample.longitude), recordedAt: String(sample.recordedAt || ""), status: "active",
      userAgent, userId: token.user_id, workActive: true
    });
    if (result.persisted) accepted += 1;
  }
  await supabaseRequest(`staff_location_device_tokens?token_hash=eq.${tokenHash(deviceToken)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_used_at: new Date().toISOString() })
  });
  return { accepted, received: ordered.length };
}
