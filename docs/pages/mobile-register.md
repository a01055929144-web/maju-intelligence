# Mobile Register (모바일 신규 거래처 등록)

## Status
운영 중.

## Goal
현장 직원이 모바일에서 새 거래처를 빠르게 등록한다(카카오맵 검색 자동입력 또는 직접 입력).

## Owner Domain
customer

## Related Domains
route (등록 후 오늘 코스로 복귀)

## Allowed Files
- `app/mobile/register/page.tsx`
- `components/mobile-register-workspace.tsx`

## Do Not Touch
- `app/dashboard/**`, `app/crm/**`

## Preserve
- 카카오맵 매장 검색 자동입력 + 직접 입력 폴백
- 상호명만으로 우선 저장 가능(나머지는 나중에 보완)
- 등록 후 첨부파일(사업자등록증/신분증/적재위치 사진) 업로드 플로우

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-11

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 터치 영역 확대(min-h-12 등), safe-area 여백
- [x] origin의 문구 단순화 병합(빠른 등록/결과 없음 등 축약 표현)

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
