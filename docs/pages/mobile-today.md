# Mobile Today (모바일 오늘 코스)

## Status
운영 중. 2026-09-11에 origin(Codex로 추정되는 병행 작업)의 "simplify mobile field UX" 변경이 병합되면서 UI가 상당히 단순화됨(아래 KNOWN ISSUES 참고).

## Goal
배송기사/영업직원이 모바일에서 오늘의 방문 코스, 선택 매장, 지도·전화·적재위치·배송완료 액션에 빠르게 접근한다.

## Owner Domain
delivery

## Related Domains
route, customer

## Allowed Files
- `app/mobile/today/page.tsx`
- `components/mobile-delivery-proof-panel.tsx`
- `components/mobile-loading-attachment-panel.tsx`
- `components/mobile-route-action-panel.tsx`
- `components/mobile-visit-note-form.tsx`
- `components/mobile-location-reporter.tsx`

## Do Not Touch
- `app/dashboard/**` (데스크톱 지도, map-and-route.md 소관 — 컴포넌트는 일부 공유하지만 페이지는 별개)
- `auth/**`, `billing/**`

## Preserve
- GPS 자동 송신(`MobileLocationReporter`)
- safe-area 여백(`pb-[calc(...+env(safe-area-inset-bottom))]`) — 노치/제스처바 있는 기기에서 하단 내비게이션에 가려지지 않게 하는 필수 여백, 절대 제거하지 않는다
- 배송완료/적재위치/방문메모 액션 플로우

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 실제 모바일 뷰포트(또는 반응형 에뮬레이션)에서 하단 내비게이션이 콘텐츠를 가리지 않는지 확인

---

## STATUS
ACTIVE (최근 UI 단순화, 재검토 권장)

## LAST VERIFIED
2026-09-11

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] safe-area 하단 여백, 터치 영역(min-h-12) 확대
- [x] 4초 GPS 폴링 연동

## TODO
- [ ] **origin의 "simplify mobile field UX" 병합 결과 재검토**: 이 변경으로 "현장 실행 순서" 4단계 진행 패널(구 `MobileFieldFlowPanel`)과 운영 기준 패널의 담당자/업무구분 표시(구 `MobileOperationBasisPanel`)가 제거되고 더 단순한 `MobileRouteContextBar`로 대체됐다. 텍스트 단순화 수준을 넘어 실제 정보 표시량이 줄어든 변경이라, 사용자가 실사용해보고 이 방향이 맞는지 확인이 필요하다. 되돌리길 원하면 git 히스토리에서 병합 직전 버전을 복원할 수 있다.

## KNOWN ISSUES
- 위 TODO와 동일 건 — 기능 손실이 아니라 "의도된 단순화인지 확인 필요"한 상태.
