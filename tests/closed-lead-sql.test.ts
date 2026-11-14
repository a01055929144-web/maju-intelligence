import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { isClosedLead } from "../lib/leads";

// 46-2⓪ C-2: 보강 대상 SQL의 폐업 제외 조건이 앱의 isClosedLead와 같은 판정인지 확인한다(SQL 정규식을 꺼내 JS로 돌려 비교).
const sql = readFileSync("docs/sql-drafts/20261114-CC-46-enrichment-targets.sql", "utf8");
const statusPattern = /coalesce\(lead\.status, ''\) ~ '([^']+)'/.exec(sql)?.[1];
const permitPattern = /coalesce\(lead\.permit_status, ''\) ~ '([^']+)'/.exec(sql)?.[1];

const samples: Array<{ status?: string | null; permitStatus?: string | null }> = [
  {}, { status: "신규" }, { status: "제외" }, { status: "폐업 확인 필요" }, { status: "폐업" }, { status: "영업중 폐업예정" },
  { permitStatus: "영업/정상" }, { permitStatus: "폐업" }, { permitStatus: "말소" }, { permitStatus: "취소/말소/만료/정지/중지" },
  { permitStatus: "휴업" }, { permitStatus: "영업정지" }, { status: "신규", permitStatus: "폐업" }, { status: null, permitStatus: null }
];

it("SQL 폐업 제외 조건이 isClosedLead와 모든 표본에서 같은 결과", () => {
  expect(statusPattern).toBeTruthy();
  expect(permitPattern).toBeTruthy();
  const status = new RegExp(statusPattern as string);
  const permit = new RegExp(permitPattern as string);
  for (const lead of samples) {
    const sqlClosed = status.test(lead.status || "") || permit.test(lead.permitStatus || "");
    expect({ lead, closed: sqlClosed }).toEqual({ lead, closed: isClosedLead(lead) });
  }
});
