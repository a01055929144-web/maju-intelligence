import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CommonDataTable, type CommonTableColumn } from "../components/common-data-table";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/state";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

it("LoadingState: 한 줄(스피너+문구, role=status)과 설명이 있는 두 줄", () => {
  const one = html(<LoadingState label="가짜 목록을 불러오는 중입니다..." />);
  expect(one).toContain('role="status"');
  expect(one).toContain("가짜 목록을 불러오는 중입니다...");
  expect(one).toContain("maju-empty-state");
  const two = html(<LoadingState bare description="잠시만 기다려 주세요." label="불러오는 중" />);
  expect(two).toContain("잠시만 기다려 주세요.");
  expect(two).not.toContain("maju-empty-state");
});

it("EmptyState: 문구 + 설명 + 다음 행동 자리(action)", () => {
  const out = html(<EmptyState action={<a href="/x">가짜 등록하기</a>} description="필터를 조정해 주세요." message="가짜 항목이 없습니다." />);
  expect(out).toContain("가짜 항목이 없습니다.");
  expect(out).toContain("필터를 조정해 주세요.");
  expect(out).toContain("가짜 등록하기");
  expect(html(<EmptyState message="없음" />)).not.toContain("<a ");
});

it("ErrorState: role=alert, onRetry가 있을 때만 '다시 시도' 버튼", () => {
  const withRetry = html(<ErrorState message="가짜 오류" onRetry={() => undefined} />);
  expect(withRetry).toContain('role="alert"');
  expect(withRetry).toContain("다시 시도");
  const without = html(<ErrorState message="가짜 오류" />);
  expect(without).toContain("가짜 오류");
  expect(without).not.toContain("다시 시도");
});

type Row = { id: string; name: string };
const columns: CommonTableColumn<Row>[] = [{ key: "name", label: "상호", value: (row) => row.name }];
const table = (props: Record<string, unknown>) => html(<CommonDataTable columns={columns} rowKey={(row) => row.id} rows={[]} {...props} />);

it("공통 표: 로딩·오류·빈 칸이 상태 부품으로 나오고 기존 문구 유지", () => {
  expect(table({ loading: true })).toContain("불러오는 중…");
  expect(table({ loading: true })).toContain('role="status"');
  const failed = table({ error: "가짜 불러오기 실패", onRetry: () => undefined });
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("가짜 불러오기 실패");
  expect(failed).toContain("다시 시도");
  expect(table({ error: "가짜 불러오기 실패" })).not.toContain("다시 시도");
  expect(table({ emptyMessage: "가짜 목록이 비었습니다." })).toContain("가짜 목록이 비었습니다.");
  expect(table({})).toContain("표시할 항목이 없습니다.");
});
