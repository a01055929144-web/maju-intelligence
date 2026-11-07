import { beforeEach, expect, it, vi } from "vitest";
import { listLeadContacts } from "../application/lead/manage-lead-actions";
import type { LeadActionRepository } from "../domains/lead/lead-action";

const mocks = { list: vi.fn(), record: vi.fn() };
const repository: LeadActionRepository = { list: mocks.list, record: mocks.record };

const companyId = "00000000-0000-4000-8000-000000000001";
const leadId = "20000000-0000-4000-8000-000000000001";
const sendId = "60000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
});

it.each([
  ["dm", "단가표 전달"],
  ["quote", "견적 전달"],
])("returns one %s delivery contact on repeated reads without another write", async (actionType, result) => {
  const action = { id: sendId, actionType, result, memo: "게시 문서 링크 전달", actorName: "합성 담당", createdAt: "2026-11-08T00:00:00Z" };
  mocks.list.mockResolvedValue([action]);

  expect(await listLeadContacts(repository, companyId, leadId)).toEqual([action]);
  expect(await listLeadContacts(repository, companyId, leadId)).toEqual([action]);
  expect(mocks.list).toHaveBeenNthCalledWith(1, companyId, leadId, 20);
  expect(mocks.list).toHaveBeenNthCalledWith(2, companyId, leadId, 20);
  expect(mocks.record).not.toHaveBeenCalled();
});

it("does not read contact history without an authenticated company scope", async () => {
  expect(() => listLeadContacts(repository, "", leadId)).toThrow("회사와 리드 정보가 필요합니다.");
  expect(mocks.list).not.toHaveBeenCalled();
});
