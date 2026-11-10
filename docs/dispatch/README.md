# MAJU 개발 분배 운영 방식 (2026-11-10 대표 결정)

**설계·분배·문서는 Claude(컨트롤타워), 개발은 Codex와 Claude Code가 나눠서 병렬로, 모든 코드는 Ponytail 점검을 거쳐 병합한다.**

## 역할

| 누구 | 하는 일 | 하지 않는 일 |
| --- | --- | --- |
| **Claude 컨트롤타워** (claude.ai 프로젝트 세션) | 설계·우선순위·작업 분배 md 작성, 차수별 현황판 갱신, 중앙 체크리스트·블루프린트·승인표 정리, 완료 판정 검토 | 기능 코드 작성(긴급 핫픽스 제외) |
| **Claude Code** (대표 PC) | 분배된 `CC-*` 작업 구현·테스트·PR | 남의 작업 파일 수정, 운영 DB 쓰기·배포·플래그 변경(승인 없이) |
| **Codex 작업방 01~09** | 분배된 `CX-*` 작업 구현·테스트·PR (Ponytail 사용) | 위와 같음 |
| **Codex Ponytail 검토방** | Claude Code PR을 Ponytail로 점검·보완 커밋 | 기능 범위 변경·재기획 |
| **대표** | 우선순위 결정, 운영 DB·플래그·배포 승인, 실사용 검증 | — |

## 한 작업의 흐름

```
컨트롤타워: docs/dispatch/<차수>-claude-code.md / -codex.md 에 작업지시(WO) 작성
   ↓
개발자: 지시서의 작업 ID로 브랜치 생성 (Claude Code: claude/<id>-<요약>, Codex: codex/<id>-<요약>)
   ↓ 구현 + 로컬 검증 (tsc · lint · test · build · auth-boundaries, 화면이면 PC/390 e2e)
PR 생성 — 제목 앞에 [CC-01] / [CX-01], 본문에 지시서 링크
   ↓
Ponytail 점검 (필수)
   · Codex 작업: 작성한 Codex가 Ponytail 사용 → 본문 `Ponytail: 사용함`
   · Claude Code 작업: PR을 Draft로 올리고 본문 `Ponytail: 검토 요청` → Codex Ponytail 검토방이 점검·보완 커밋
     → 본문을 `Ponytail: 사용함 (Codex 검토 #PR)`로 바꿈
   ↓
CI 전체 초록 → Ready for review → 병합 (병합은 작성자가 함)
   ↓
현황판(<차수>-board.md)에 PR 번호·상태 기록 → 컨트롤타워가 완료 판정
   ↓
운영 배포: 대표 지시 때만, 하루 1회 묶음. 운영 DB·플래그는 각각 별도 승인.
```

`Ponytail:` 줄이 `사용함`이 아닌 PR은 병합하지 않는다(문서만 바꾼 PR은 `해당 없음(문서)`).

## 충돌 방지

1. **작업마다 파일 소유가 지시서에 적혀 있다.** 지시서의 `Files` 밖을 고쳐야 하면 고치지 말고 현황판 "막힘"에 적는다.
2. 공유 파일(`lib/store.ts`, `lib/customer-navigation.ts` 메뉴, `docs/backend/*`, 중앙 체크리스트, 승인표)은 지시서에 **명시된 한 작업만** 고친다.
3. 작업 시작 전·PR 전 `git fetch && git rebase origin/main`. 충돌이 나면 먼저 병합된 쪽을 기준으로 맞춘다.
4. 같은 화면을 두 작업이 동시에 맡지 않는다. 한 작업이 끝나기 전 같은 화면 후속 작업은 다음 차수로 넘긴다.

## 승인 경계 (모두 공통 · 변경 없음)

- 운영 DB(`fcmdvveqmcgtioelzqun`) 스키마·데이터 변경: SQL 초안 + down + PG17 → 대표 명시 승인 문구 → 적용 → 읽기 검증 → `docs/work-orders/db-approval/` 기록.
- 새 기능은 기본 OFF + 회사 allowlist. 대표 회사 외 활성화·돈 관련 활성화는 대표 승인.
- 비밀값은 출력 금지, 이름만 `docs/work-orders/owner-change-later.md`.
- 금지: 단체 문자·카톡 매크로, 스크래핑, 비밀번호 대리 입력, 개인정보 파일 커밋, hold 모듈 노출.

## 완료 보고 (PR 본문 + 현황판 한 줄)

`무엇을 바꿨나 / 검증(명령·결과) / 남은 문제 / 다음 권장`. "HTTP 200"이나 "CI 통과"만으로 운영 완료로 적지 않는다.

## 차수

| 차수 | 지시서 | 현황판 |
| --- | --- | --- |
| R1 (2026-11-10~) | [Claude Code](2026-11-10-R1-claude-code.md) · [Codex](2026-11-10-R1-codex.md) | [R1 현황판](2026-11-10-R1-board.md) |
