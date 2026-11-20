import { describe, expect, it } from "vitest";
import { isLeadContactFilterChannel, LEAD_CONTACT_FILTER_CHANNELS } from "@/domains/lead/contact-channels";
import { permitLeadContactChannelParams } from "@/lib/store";
import { readFileSync } from "node:fs";

describe("lead contact filter contract", () => {
  it("accepts only server-supported contact channels", () => {
    expect(LEAD_CONTACT_FILTER_CHANNELS).toEqual(["sms", "instagram", "talktalk", "email", "fax"]);
    for (const channel of LEAD_CONTACT_FILTER_CHANNELS) expect(isLeadContactFilterChannel(channel)).toBe(true);
    expect(isLeadContactFilterChannel("visit")).toBe(false);
    expect(isLeadContactFilterChannel(null)).toBe(false);
  });

  it("maps each channel to database filters used by both rows and exact count", () => {
    expect(permitLeadContactChannelParams("sms")).toEqual(["phone=like.010*"]);
    expect(permitLeadContactChannelParams("instagram")).toEqual(["instagram_url=not.is.null", "instagram_url=neq."]);
    expect(permitLeadContactChannelParams("talktalk")).toEqual(["naver_talktalk_url=not.is.null", "naver_talktalk_url=neq."]);
    expect(permitLeadContactChannelParams("email")).toEqual(["email=not.is.null", "email=neq."]);
    expect(permitLeadContactChannelParams("fax")).toEqual(["fax=not.is.null", "fax=neq."]);
  });

  it("keeps page rows and exact total on the same filter set", () => {
    const route = readFileSync("app/api/leads/permits/route.ts", "utf8");
    const store = readFileSync("lib/store.ts", "utf8");
    expect(route).toContain("offset: pageSize ? (page - 1) * pageSize : undefined");
    expect(store).toContain("&limit=${limit}&offset=${offset}");
    expect(store).toContain("supabasePermitLeadCount(params)");
  });
});
