-- 11/3 22:34 대표 요청: 직원 담당 업무에 '사무(내근)'·'기타' 추가. 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요.
begin;
alter table public.company_members drop constraint if exists company_members_duties_check;
alter table public.company_members add constraint company_members_duties_check check (duties <@ array['sales','delivery','office','other']::text[]);
alter table public.staff_invitations drop constraint if exists staff_invitations_duties_check;
alter table public.staff_invitations add constraint staff_invitations_duties_check check (duties <@ array['sales','delivery','office','other']::text[]);
commit;
