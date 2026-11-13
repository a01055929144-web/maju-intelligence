-- DRAFT ONLY. Do not apply to an operating database without separate approval.
-- Preserve the lead's existing customer link and hold order activation when the
-- accepted customer conflicts with that link.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$
declare
  target regprocedure:=to_regprocedure('public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)');
  definition text;
  needle constant text:='if not found then v_needs_review:=true; v_review_reason:=''lead_customer_mismatch''; end if;';
  replacement constant text:=$replacement$
if not found then
      v_needs_review:=true;
      v_review_reason:='lead_customer_mismatch';
      insert into public.pricing_document_acceptance_requests(
        company_id,idempotency_key,request_fingerprint,document_id,document_version_id,send_id,
        lead_id,customer_id,document_kind,accepted_via,needs_review,review_reason,result
      ) values(
        p_company_id,p_idempotency_key,p_request_fingerprint,p_document_id,p_document_version_id,p_send_id,
        v_lead,v_customer,d.kind,p_accepted_via,true,v_review_reason,
        jsonb_build_object(
          'customerId',v_customer,'leadId',v_lead,'documentVersionId',p_document_version_id,
          'kind',d.kind,'needsReview',true,'orderEnabled',false
        )
      ) returning * into r;
      return r.result;
    end if;$replacement$;
begin
  if target is null then raise exception 'pricing_acceptance_rpc_required'; end if;
  definition:=pg_get_functiondef(target);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'pricing_acceptance_lead_mismatch_guard_changed';
  end if;
  execute replace(definition,needle,replacement);
end $$;

commit;
