"use client";

import { useMemo, useState } from "react";

/**
 * 2026-09-01 피드백: "서비스 내에 모든 표헤더들은 클릭하면 오름차순/내림차순으로 정렬되도록 만들어"
 * — 여러 화면에 흩어진 표마다 정렬 상태·토글·비교 로직을 매번 새로 작성하지 않도록 공용 훅으로
 * 뽑았습니다. 호출 쪽은 정렬 키별 비교 함수(comparators)만 넘기면 되고, 실제 정렬은 여기서
 * 처리합니다. 값이 없을 때(sortKey === null)는 원본 배열을 그대로 돌려줘 서버가 정해준 기본
 * 순서(예: 최신순)를 그대로 유지합니다.
 */
export function useTableSort<Row, SortKey extends string>(rows: readonly Row[], comparators: Record<SortKey, (a: Row, b: Row) => number>) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const comparator = comparators[sortKey];
    if (!comparator) return rows;
    const decorated = rows.map((row, index) => ({ index, row }));
    decorated.sort((a, b) => {
      const diff = comparator(a.row, b.row) || a.index - b.index;
      return sortDirection === "asc" ? diff : -diff;
    });
    return decorated.map((item) => item.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDirection]);

  return { sortDirection, sortKey, sortedRows, toggleSort };
}
