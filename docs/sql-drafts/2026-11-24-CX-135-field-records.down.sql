-- DOWN: CX-135 현장 기록 표 제거. 기록이 한 건이라도 있으면 중단한다(증거 보호). 리드 영업 기록(lead_actions)에 남긴 줄도 지우지 않는다.
begin;
do $guard$ begin
  if exists (select 1 from public.field_records) then raise exception 'cx135_down_refused_field_records_exist'; end if;
end $guard$;
drop function if exists public.create_field_record_v1(uuid, uuid, uuid, text, text[], uuid, uuid, uuid, numeric, numeric, numeric, timestamptz, text, text, jsonb, text);
drop table if exists public.field_record_photos;
drop function if exists public.field_record_photo_count_sync_v1();
drop table if exists public.field_records;
commit;
