# Billing (구독/결제)

## Status
운영 중. 고객사용(`app/revenue/billing`)과 관리자용(`app/admin/billing`) 두 화면이 같은 구독 데이터를 서로 다른 시점에서 본다.

## Goal
Toss Payments 기반 정기결제 카드 등록, 월 자동청구, 구독/결제이력 조회.

## Owner Domain
organization

## Related Domains
없음

## Allowed Files
- `app/revenue/billing/page.tsx`, `components/billing-workspace.tsx`
- `app/admin/billing/page.tsx`, `components/admin-billing-workspace.tsx`
- `app/api/billing/**`, `app/api/admin/billing/route.ts`
- `lib/toss-payments.ts`

## Do Not Touch
- `lib/store.ts`의 customer/lead/route/delivery 전용 섹션
- 결제 자격증명/시크릿 값을 코드나 커밋 메시지에 직접 남기지 않는다

## Preserve
- billingKey 발급 → 카드 등록 → 월 자동청구 cron 흐름
- 구독/결제이력 조회(고객사/관리자 양쪽)

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 실제 결제를 발생시키는 테스트는 사용자 승인 없이 진행하지 않는다(Claude는 금융 거래를 직접 실행하지 않음)

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 토스페이먼츠 정기결제 API 연동, 구독/결제 DB 스키마
- [x] 카드 등록 위젯 + billingKey 발급 API
- [x] 월 자동청구 cron + 결제 API
- [x] 고객사/관리자 결제 관리 화면

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
