"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * M9: 같은 종류의 요청이 연달아 나갈 때 "마지막 요청만" 살린다(R2·R3: 필터를 빨리 바꾸면 늦게 온 옛 응답이 새 목록을 덮던 문제).
 * begin()을 부르면 이전 요청을 취소(abort)하고 새 signal을 준다. 쓰는 쪽은 fetch에 signal을 넘기고, 응답 처리 전 signal.aborted면 버린다.
 * 컴포넌트가 사라지면 진행 중 요청도 취소한다.
 */
export function useLatestRequest() {
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  return useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);
}
