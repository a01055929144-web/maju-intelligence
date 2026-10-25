-- REVIEW ONLY. 운영 적용 전 대표 승인 필요(프로젝트 fcmdvveqmcgtioelzqun).
-- 리드 영업 채널 확장(2026-10-25): 팩스·이메일·네이버 톡톡 주소를 리드에 저장합니다.
-- 인스타그램(instagram_url)·네이버 플레이스(naver_place_url)·사업자번호(business_number)·대표자(representative_name)
-- 칸은 이미 있으므로 추가하지 않습니다.
-- 새 lead_actions.action_type 값(sms/talktalk/email/fax)은 text 칸이라 스키마 변경이 필요 없습니다.
-- 데이터 변경 없음(기존 행은 null). 되돌리기는 아래 주석.

begin;

alter table public.business_permit_leads
  add column if not exists fax text,
  add column if not exists email text,
  add column if not exists naver_talktalk_url text,
  add column if not exists contact_channels_updated_at timestamptz;

comment on column public.business_permit_leads.fax is '팩스 번호(표시 형식 02-555-1234). 직접 입력·엑셀 가져오기·명함 인식';
comment on column public.business_permit_leads.email is '이메일(소문자 저장). 직접 입력·엑셀·통신판매사업자 정보';
comment on column public.business_permit_leads.naver_talktalk_url is '네이버 톡톡 창 주소 https://talk.naver.com/ct/{id}';

commit;

-- 롤백(별도 승인 후):
-- alter table public.business_permit_leads
--   drop column if exists contact_channels_updated_at,
--   drop column if exists naver_talktalk_url,
--   drop column if exists email,
--   drop column if exists fax;
