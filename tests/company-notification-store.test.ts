import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.request }));

import { ignoreStoreProfileNotification } from "../lib/store/07-company-notifications";

describe("CX-94 profile notification persistence", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.request.mockResolvedValue(undefined); });

  it("marks only the scoped unprocessed profile notification and never applies customer values", async () => {
    await ignoreStoreProfileNotification("company-a", "notification-1", "user-1");
    expect(mocks.request).toHaveBeenCalledOnce();
    const [path, options] = mocks.request.mock.calls[0];
    expect(path).toContain("company_id=eq.company-a");
    expect(path).toContain("id=eq.notification-1");
    expect(path).toContain("notification_type=eq.store_profile_changed");
    expect(path).toContain("processed_at=is.null");
    expect(JSON.parse(options.body)).toMatchObject({ processed_by_user_id: "user-1", read_by_user_id: "user-1" });
    expect(options.method).toBe("PATCH");
  });
});
