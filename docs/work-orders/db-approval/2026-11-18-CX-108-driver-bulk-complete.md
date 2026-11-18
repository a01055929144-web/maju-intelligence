# CX-108 기사 정류장 일괄 완료 — DB 승인 대기

Ponytail: 사용함

## 승인 대상

| 항목 | 상태 | 확인 내용 |
|---|---|---|
| 신규 객체 | 승인 대기 | `complete_driver_delivery_stops_atomic(uuid,uuid,date,uuid[])` 함수 1개 |
| 기존 단건 완료 | 유지 | 기존 단건 완료 API·테이블 계약을 변경하지 않음 |
| 5초 되돌리기 | 유지 | 모든 정류장에 동일한 `completed_at` 토큰을 기록하며 기존 `undo_driver_route_stop`을 변경하지 않음 |
| 회사·기사 격리 | PG17 통과 | 회사·기사·당일·배송 종류·상태를 잠금 후 같은 트랜잭션에서 재검증 |
| 경쟁·부분 실패 | PG17 통과 | 한 정류장이 먼저 바뀐 경우 나머지 정류장도 수정하지 않고 `40001`로 전체 실패 |
| 함수 ACL | 확인 | `public`, `anon`, `authenticated` 실행 권한 제거, `service_role`만 허용 |
| 원복 | 확인 | down SQL이 함수의 정확한 시그니처만 제거 |
| RLS | 영향 없음 | 신규 테이블·정책 없음. `security invoker`이며 서비스 역할 전용 RPC |

## 운영 적용 전 필수

- [ ] 대표의 운영 DB 적용 승인 문구 확보
- [ ] 적용 대상이 PostgreSQL 17인지 재확인
- [ ] SQL, down, PG17 시험 파일의 동일 커밋 해시 확인
- [ ] 기존 CX-65 단건 완료·5초 되돌리기 회귀 시험 통과
- [ ] 앱의 REST 일괄 `PATCH`를 이 RPC 호출로 교체한 뒤 부분 완료 경쟁 시험 통과
- [ ] `DRIVER_RUN_EXPERIENCE` 기본 OFF와 회사 allowlist 유지 확인
- [ ] Stage A 및 390px E2E 통과 후에만 기능 활성화 검토
- [ ] 운영 적용 뒤 함수 ACL과 시그니처를 읽기 전용으로 재확인

운영 DB 적용, 기능 ON, 배포 및 기존 #1091 병합은 이 문서의 승인이 아니다.
