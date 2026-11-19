# 행사 3건 권한 제한 DB 백업·면세 정정 — 적용 완료·재실행 금지

Ponytail: 사용함

2026-11-19 KST, 총괄방이 별도 승인 범위대로 운영 적용·읽기 검증을 완료했다고 전달했다. **SQL 재실행 금지.** 실제 운영 값·식별자·지문·원문은 이 파일이나 SQL에 포함하지 않았다. 아래 실행 전 조건과 시험 기록은 적용 당시 근거로 보존하며, 새 실행 허가가 아니다.

## 적용 완료 상태

- 적용 SQL 기준 커밋: `00acc1128258a0765fb6f7f30c8090fd80132f7b`. 원문 대비 런타임 차이는 BEGIN 직후 SET LOCAL 한 줄뿐이며 1회 성공했다는 총괄방 보고 기준이다. 09방은 추가 운영 SQL 실행/재실행을 하지 않았다.
- 백업3행·면세 정정3행·가격 변경0건·초안 변경0건·발행본 변경0건·다른 회사 변경 없음. 백업 테이블 RLS/ACL 접근 차단 확인.
- 기존 초안은 자동 변경하지 않았다. 사용자 확인 후 화면의 ‘현재 세금 구분 반영’ → 초안 저장 → 버전 확정으로 반영해야 하며, 이 상태 갱신에서 대신 실행하지 않는다.
- PR #1167 본문과 이 기록의 상태만 갱신한다. 거래처 등급 운영 DB 잠금 전환 중이므로 실제 병합은 총괄방의 별도 지시 전까지 대기한다.

## 적용 당시 승인 범위 — 한 문단

운영 프로젝트 `fcmdvveqmcgtioelzqun`에 `promotion_tax_backup_20261119` 스키마와 `promotion_rows` 테이블 1개를 만들고, DB 소유자만 접근하도록 RLS를 켜고 PUBLIC·anon·authenticated·service_role의 스키마/테이블 권한을 회수한 다음, 신고 문서 조건으로 유일하게 확인되는 계란 행사 정확히 3행의 전체 전값과 검증 해시를 복사하고 같은 트랜잭션에서 세금 분류만 면세로 바꾸며 수정 번호를 1 증가시키는 작업의 승인을 요청한다. 3건 일치·원상품 면세·현재 계산 가격 동일·기존 초안/발행본 불변·다른 행사 불변 조건 중 하나라도 실패하면 새 스키마/백업/정정 전체를 롤백한다. 새 백업 테이블은 Git 저장소 밖인 운영 DB 안에 보존하지만 **독립적인 DB 외부 백업이 아니므로 운영 DB 자체 장애·삭제 시 함께 손실될 수 있다는 한계**까지 승인 범위에 명시해야 한다. 사후 복구 SQL은 별도 지시 후 현재 값이 정정 직후 값과 같을 때만 이전 세금으로 되돌리고 수정 번호는 다시 증가시키며 백업 테이블을 삭제하지 않는다. 기능 ON·배포·다른 행 수정·백업 자동 삭제는 승인 범위에 포함하지 않는다.

## 파일과 동작

- up: `docs/sql-drafts/2026-11-19-promotion-tax-private-backup.sql`
- 복구: 같은 이름의 `.down.sql`. 이 파일은 데이터 복구이며 스키마 삭제 파일이 아니다.
- PG17: `tests/sql/promotion-tax-private-backup.pg17.sh`, 기존 P0/P1 정의를 쓰는 합성 fixture.
- 백업 스키마가 이미 있으면 재사용하지 않고 중단한다. 3개 전체 행을 백업한 뒤 정확한 전값과 일치하는 행만 갱신한다.
- 선별은 승인된 회사·문서·행사3개 조합의 비공개 지문과 정확히 일치하는 유일 단가표이다. revision과 품목 수는 문서의 고유 식별 조건으로 쓰지 않는다. 현재 revision과 내용 해시를 지문 후보 조회 시 함께 캡처하고 문서 잠금 시 둘 다 같아야 한다. 달라졌거나 지문 후보가 없거나 여러 건이면 중단한다. 같은 회사·행사/원상품 잠금과 면세/계란/가격/수정 번호 검증도 유지한다. 같은 모양의 다른 문서는 지문이 달라 대상에서 제외된다.
- 오인 방지를 위해 `maju.promotion_tax_scope_hash`에 승인된 회사·문서·정확한 행사3개 조합의 SHA256 지문을 반드시 전달해야 한다. 없거나 다르면 중단한다. 컨트롤타워가 원래 승인 대상과 식별자를 비공개로 대조한 뒤 아래의 단일 요청 래퍼로 `BEGIN` 직후 `SET LOCAL`을 주입한다. `SET SESSION`·별도 설정 호출·수동 RESET에 의존하지 않는다. 실제 식별자·지문은 Git/채팅에 넣지 않는다. 조건에 맞는 현재 후보로 지문을 자동 생성해 승인 대상 대조 없이 바로 적용하지 않는다.
- 금액 재계산은 검증에만 사용하고 원가·마진·가격을 갱신하지 않는다. 변경 허용 필드는 세금·수정 번호와 기존 트리거의 수정 시각뿐이다. 백업 전후 전체 필드를 대조한다.
- 원문을 클라이언트 도구 인자/출력으로 내보내지 않는다. 결과는 백업·정정·가격 변경 건수만 반환한다.
- 복구 시 다른 사용자의 후속 수정이나 초안/발행본 변경이 있으면 거부한다. 과거 전체 행으로 덮어쓰지 않는다. 가격은 그대로이고 수정 번호는 단조 증가한다.

## 한계

백업은 운영 DB 안의 권한 제한 테이블이므로 저장소 밖 조건은 충족하지만, DB 밖 독립 복구본을 대체하지 못한다. 별도의 DB 장애 대비가 필요하면 승인된 DB 백업/복구 체계나 원문이 도구 기록에 들어가지 않는 외부 직접 내보내기를 추가로 준비해야 한다. 이번 초안은 새 외부 프로젝트·자격증명·자동 전송을 만들지 않는다. 현재 운영 정정/스키마 생성은 미실행이다.

## 격리 검증 결과

2026-11-19 KST, 네트워크 차단·소스 읽기 전용 마운트의 폐기용 postgres:17에서 기존 P0/P1 정의와 합성 자료만 사용했다. 운영 DB 접속/쓰기 없음. 다음 5개 검증 모두 PASS:

1. 백업3행·면세 정정3행·가격 변경0건·초안/발행본 불변·다른 행사/회사 불변·API 역할 접근 거부·복구3행·수정 번호 단조 증가.
2. 대상 수 불일치: 새 스키마/백업 생성과 정정 전체 롤백.
3. 가격 재계산 불일치: 새 스키마/백업 생성과 정정 전체 롤백.
4. 백업과 3행 정정 뒤 강제 오류: 이미 수행한 쓰기까지 전체 롤백.
5. 정정 후 후속 수정: 복구 거부, 기존 백업과 정정 상태 보존.

브랜치: `codex/09-promotion-tax-private-backup-draft`. 최초 초안은 대표의 공개 승인 뒤 Draft PR #1167로 올렸고 당시 전체 CI를 통과했다. SQL 검증 외 로컬 앱 빌드·npm 실행 없음. 이번 보완의 운영 재실행은 금지하며 최신 CI와 컨트롤타워의 비공개 대상 대조 전까지 대기한다.

## #1167 revision 고정 취약성 보완

최초 공개 Draft #1167의 운영 시도는 `promotion_tax_candidate_count_mismatch`로 전체 롤백됐다는 컨트롤타워 전달을 받았다. 이후 읽기 대조에서 후보는1개·현재 revision20·20품목·행사3개·계란 원상품 면세/행사 과세3개·가격 변경 예상0개·백업 스키마 없음임을 확인했다. 문서 수정 시각은 2026-11-19 12:41 KST(분 단위)였다. 해당 문서의 발행본0개·대상 감사 이력0개이며, 실패한 백업 외에 이전 미발행 revision19 원문이 남아 있지 않아 정확한 내용 차이와 수정 주체/행동은 확정할 수 없다. 코드상 정상 저장은 내용이 같아도 revision을 증가시킬 수 있다. 이를 실제 원인으로 단정하지 않는다.

첫 보완에서는 19를20으로 바꾸는 대신 현재 상태 캡처→잠금 전후 revision/내용 일치 검사와 승인 문서·회사·행사3개 지문 대조를 결합했다. 이후 아래의 편집 진행 보고를 반영해 품목 수 고정도 제거했다. 3개·면세 원상품·계란·가격 불변·기존 초안/발행본 불변 조건은 유지한다. 운영 재실행 금지. 추가 PG17 검증과 최신 head의 CI가 완료된 뒤 컨트롤타워에 결과만 보고한다.

보완 후 네트워크 차단 PG17에서 11개 시나리오 PASS: revision20 전체 정정/복구와 가격0/발행본/권한 보존, revision19 호환, 비공개 지문 누락·불일치, 개수가 같아도 행사 교체 시 거부, 후보 문서 복수 시 거부, 후보 캡처 뒤 잠금 직전 revision 변경 시 전체 롤백, 대상 수/가격 불일치 시 전체 롤백, 백업·정정 뒤 강제 오류 시 전체 롤백, 후속 수정 시 복구 거부. 발행본 불변 장치는 시험에서도 끄지 않았다. 원래 승인된5파일 범위 안의4파일만 보완했으며 복구 SQL은 동일하다.

## 편집 진행 중 revision22·28행 보고 반영

04방은 저장/발행 실패 원인을 `published_tax_unconfirmed` 트리거로 확정했고, 초안/행사 원본3행 과세와 원상품3행 면세 불일치를 보고했다. 사용자 편집으로 문서는 revision22·28행으로 바뀌었으며 기존 발행본0건·편집값 유지라는 전달을 받았다. 09는 별도의 API/RPC 원인 조사를 반복하지 않는다.

따라서 최초 후보 선별부터 승인된 회사·문서·행사3개 지문으로 범위를 한정한다. 과거20행이나19/20/22 같은 revision 숫자에 의존하지 않으며, 실행 시 캡처한 현재 상태가 잠금 전에 바뀌면 전체 롤백한다. 다른 문서가 같은 구조여도 승인 지문과 다르면 조회 후보에서 제외된다. 정정 대상3행의 원상품/세금/가격 검사와 백업·전후 전체 필드 대조는 유지한다.

행사 원본 정정 뒤에도 **기존 초안은 자동 갱신하지 않는다.** 사용자가 화면에서 ‘현재 세금 구분 반영’ → 초안 저장 → 버전 확정 순서로 확인해야 한다. SQL은 초안·발행본 해시가 변하면 롤백하며 이 사용자 행동을 대신하지 않는다. 안전 조건과 최신 CI 완료 및 컨트롤타워 지시 전 운영 재실행 금지.

행 수 고정 제거 뒤 격리 PG17 12개 시나리오 모두 PASS: revision22·28행 전체 정정/복구/가격0/권한/초안·발행본 보존, revision20·20행 호환, revision19 호환, 지문 누락/불일치, 같은3건 중 행사 교체 거부, 같은 구조의 다른 문서 제외, 잠금 직전 문서 변경 롤백, 대상수/가격 불일치 롤백, 정정 뒤 강제 오류 롤백, 후속 수정 복구 거부. 운영 쓰기는 하지 않았다.

## 지문 계산 — 읽기 전용, 실제 값 출력 금지

아래 쿼리는 행 원문/ID/가격을 반환하지 않고 후보별 비공개 지문과 건수만 계산한다. 결과를 채팅/PR/실행 로그에 출력하지 않는다. 컨트롤타워가 기존 승인 기록의 문서/행사 조합과 독립적으로 대조해 정확히 한 후보를 선택해야 한다. 단순히 결과의 첫 행을 자동 승인하지 않는다. 대조 근거가 없거나 후보가 없으면 실행을 중단한다. revision/품목 수는 참고값이며 승인 지문에 포함하지 않는다.

```sql
with eligible as (
  select d.id,d.company_id,d.revision,d.content,
    jsonb_agg(distinct p.id order by p.id) filter(where p.id is not null) promotion_ids
  from public.pricing_documents d
  cross join lateral jsonb_array_elements(d.content->'lines') l
  left join public.pricing_promotions p
    on p.company_id=d.company_id and p.id=nullif(l->>'promotionId','')::uuid
  left join public.product_catalog x on x.company_id=p.company_id and x.id=p.product_id
  where d.archived_at is null and d.kind='sheet'
  group by d.id,d.company_id,d.revision,d.content
  having count(distinct nullif(l->>'promotionId','')::uuid)=3
    and count(distinct p.id)=3
    and count(distinct p.id) filter(where p.tax_type='taxable' and x.tax_type='exempt'
      and x.is_active and p.allow_sheet and p.revision>=1 and p.stock is distinct from 0
      and p.starts_on<=(clock_timestamp() at time zone 'Asia/Seoul')::date
      and p.ends_on>=(clock_timestamp() at time zone 'Asia/Seoul')::date
      and coalesce(x.purchase_product_name,'') ~ '(계란|달걀|특란|대란|중란|왕란)'
      and p.price=public.pricing_p0_price(p.purchase_cost,p.margin_bp,10))=3
)
select encode(sha256(convert_to(jsonb_build_object(
    'company_id',company_id,'document_id',id)::text,'UTF8')),'hex') document_identity_hash,
  encode(sha256(convert_to(promotion_ids::text,'UTF8')),'hex') promotion_set_hash,
  encode(sha256(convert_to(jsonb_build_object(
    'company_id',company_id,'document_id',id,'promotion_ids',promotion_ids)::text,'UTF8')),'hex') scope_hash,
  revision as current_revision,jsonb_array_length(content->'lines') as current_line_count,
  3 as target_count,0 as price_change_expected_count,
  to_regnamespace('promotion_tax_backup_20261119') is null as backup_schema_absent
from eligible;
```

## 같은 연결·트랜잭션의 런타임 주입 — 아직 실행 금지

검토한 up 원문에는 이미 `BEGIN`/`COMMIT`이 있다. 운영 도구는 원문을 승인 커밋과 대조한 뒤, `BEGIN` 바로 다음의 `-- PRIVATE_SCOPE_CONFIG_INJECTION_POINT` 주석 **한 줄만** 아래의 트랜잭션 한정 설정으로 치환한다. 밖에 새 BEGIN/COMMIT을 덧붙이거나, 별도 SQL 호출로 설정하거나, SQL의 선별/백업/정정 로직을 수정하지 않는다.

```sql
SET LOCAL maju.promotion_tax_scope_hash = '<검증한 비공개 64자리 지문>';
```

다음은 실제 값 없이 주입 위치와 변경 범위를 검사하는 래퍼이다. 설정은 결과 행을 반환하지 않는다. 실제 지문이 들어간 런타임 문자열은 파일·PR·채팅에 저장/출력하지 않는다.

```js
function withPrivateScope(approvedSqlText, verifiedPrivateScopeHash) {
  if (!/^[0-9a-f]{64}$/.test(verifiedPrivateScopeHash)) throw Error('Invalid private scope');
  const marker = '-- PRIVATE_SCOPE_CONFIG_INJECTION_POINT';
  if (approvedSqlText.split(marker).length !== 2) throw Error('Unexpected SQL marker');
  const at = approvedSqlText.indexOf(marker);
  if (!/begin;\r?\n$/.test(approvedSqlText.slice(0, at))) throw Error('Marker must follow BEGIN');
  const setting = `SET LOCAL maju.promotion_tax_scope_hash = '${verifiedPrivateScopeHash}';`;
  const runtimeSql = approvedSqlText.replace(marker, setting);
  if (runtimeSql.replace(setting, marker) !== approvedSqlText) throw Error('Unexpected SQL change');
  return runtimeSql;
}
// Future approved execution only: exactly one tool request, not two pooled requests.
await tools.mcp__codex_apps__supabase_execute_sql({
  project_id: 'fcmdvveqmcgtioelzqun',
  query: withPrivateScope(approvedSqlText, verifiedPrivateScopeHash),
});
```

이 단일 SQL 요청의 BEGIN → SET LOCAL → 백업/정정 → COMMIT은 같은 연결·트랜잭션 안에서 실행된다. 성공 시 COMMIT, 실패 시 해당 트랜잭션의 ROLLBACK으로 설정이 자동 해제된다. SET SESSION과 수동 RESET에 의존하거나 연결 풀을 사이에 둔 별도 호출의 설정값을 재사용하지 않는다. 설정 주입·해제의 격리 검증과 최신 CI, 총괄방의 안전 확인이 끝날 때까지 운영 재실행은 금지한다.

격리 PG17 재검증 결과: 승인표에서 읽기 계산 쿼리를 그대로 추출·실행해 고정된 합성 승인 대상의 독립 기대 지문과 일치를 확인했다. 원문에서 주입한 설정 한 줄을 다시 표시 주석으로 치환한 결과가 원문과 바이트 단위로 같음도 검사했다. 같은 psql 연결에서 COMMIT 뒤 설정이 비고정 상태로 돌아오는지, 전체 작업을 명시적으로 ROLLBACK한 뒤 설정/백업 스키마/행 변경이 모두 남지 않는지 확인했다. 정정·복구·충돌/거부 13개 시나리오 전체 PASS. 테스트의 커밋 후 설정 검사만 검증용으로 덧붙였으며 실제 운영 래퍼는 원문 대비 설정 한 줄 외에는 달라지지 않는다. 실제 운영 지문/ID 사용이나 운영 실행은 없었다.
