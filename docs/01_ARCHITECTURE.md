# 01. Architecture

## 목표 구조

MAJU는 **DDD 기반 Modular Monolith**를 지향한다. 현재 단계에서는 MSA(마이크로서비스)를 적용하지 않는다. 시스템은 페이지 단위가 아니라 **Domain 단위**로 이해한다. 하나의 페이지가 여러 Domain을 사용할 수는 있지만, 비즈니스 로직의 소유권은 반드시 하나의 Domain에 있어야 한다.

### Main Domains

- **customer** — 거래처 마스터, 연락처, 첨부파일, 메모, 관계상태(이탈위험), 중복 병합
- **lead** — 인허가 기반/카카오 키워드 기반 신규 리드, 추천 점수, 신규리드/영업리드 분류
- **sales** — 매출 거래, 파이프라인, AI 영업 어시스턴트, 리포트
- **route** — 방문 순서, 경로 확정, 거리 캐시
- **delivery** — 배송차량, 배송완료 기록, 직원 GPS 위치, 배송 히스토리
- **analytics** — 대시보드 집계, 시스템 진단
- **organization** — 회사/직원/구독·결제/인증, 테넌트 격리

## 현재 실제 구조 (2026-09 기준, 목표와의 갭)

**아직 물리적으로 Domain별 디렉터리로 분리되어 있지 않다.** 실제 코드는 다음처럼 라우트/파일 단위로 조직돼 있다.

- `app/` — Next.js App Router 라우트. 라우트 이름이 곧 "페이지"이고, 대부분 여러 Domain의 데이터를 한 화면에서 조합해서 보여준다(예: `app/dashboard`는 customer + lead + delivery + route 데이터를 지도 위에 함께 그림).
- `lib/store.ts` — **사실상 모든 Domain의 서버 로직이 한 파일에 들어있는 단일 모놀리스**(10,744줄, export 함수 138개). Supabase REST 호출, 비즈니스 규칙, 데이터 변환이 전부 이 파일 안에 있다. `docs/02_DOMAIN_MAP.md`가 이 파일 안 함수들을 논리적으로 어느 Domain 소유인지 정리한 잠정적 지도다.
- `lib/` 나머지 — `auth.ts`(인증/테넌트 격리 중앙 함수), `workspace.ts`(역할별 기능 권한), 그 외 33개 파일이 도메인 구분 없이 평면적으로 존재.
- `components/` — 페이지별 UI 컴포넌트. 일부는 이미 한 파일이 매우 커져 있다(`app/page.tsx` 5,220줄, `components/permit-leads-view.tsx` 3,535줄, `components/kakao-address-map.tsx` 1,305줄).

이 문서가 확인한 시점에는 Domain 단위 물리적 리팩터링이 진행되지 않은 상태다. 당장 전면 재구조화를 목표로 하지 않되, 아래 원칙을 지킨다.

1. **새 로직을 추가할 때는 `docs/02_DOMAIN_MAP.md` 기준으로 소유 Domain을 먼저 정하고**, 그 Domain의 기존 함수들 근처에 배치한다.
2. 한 페이지가 여러 Domain 데이터를 조합해야 하면, 페이지 컴포넌트에서 여러 Domain의 함수를 각각 호출해서 조합하는 것은 괜찮지만, **비즈니스 규칙 자체(예: "언제 이탈위험으로 분류하는가")를 페이지 컴포넌트 안에 새로 작성하지 않는다** — 이미 있는 `lib/store.ts`의 해당 Domain 함수를 재사용하거나 확장한다.
3. God Component / Cross-Domain Coupling / Duplicate Logic / UI Business Logic / Direct DB Dependency 패턴을 발견하면 즉시 고치려 하지 말고 보고부터 한다(작은 수정에 묻어가는 대규모 리팩터링은 회귀 위험이 크다).

## 페이지 ↔ Domain 매핑 (요약)

상세 파일 단위 매핑은 `docs/02_DOMAIN_MAP.md`, 페이지별 세부 명세는 `docs/pages/*.md`를 참고. 대표 라우트:

| 페이지 | 주 Domain | 관련 Domain |
|---|---|---|
| `app/dashboard` (지도 홈) | route, delivery | customer, lead, analytics |
| `app/crm/timeline` (거래처 관리) | customer | route, delivery |
| `app/crm/summary` (전체현황) | analytics | customer |
| `app/leads/permits` (리드) | lead | customer |
| `app/page.tsx` (데이터 등록) | customer | — |
| `app/customers/data` (등록 이력) | customer | — |
| `app/revenue/pipeline` | sales | customer |
| `app/revenue/transactions` | sales | customer |
| `app/assistant` (AI 영업) | sales | customer, lead |
| `app/reports/[id]` (AI 리포트) | analytics | sales |
| `app/dashboard/settings` | organization | delivery(GPS 보관정책) |
| `app/mobile/*` (모바일 현장) | delivery | route, customer |
| `app/admin/*` | organization | analytics |
| `app/revenue/billing`, `app/admin/billing` | organization | — |

(위 표는 `docs/pages/*.md`가 늘어날 때마다 함께 갱신한다.)
