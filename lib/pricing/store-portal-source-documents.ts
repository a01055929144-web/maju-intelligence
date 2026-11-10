import "server-only";
import {supabaseRequest} from "../store";
import {issueDocumentShareToken} from "./document-share-token";

type Source={document_id:string;document_version_id:string;share_link_id:string};
type Share={id:string;document_id:string;document_version_id:string;token_nonce:string;token_hash:string;expires_at:string;revoked_at:string|null};
type Version={id:string;document_id:string;content:{title:string;kind:"sheet"|"quote";validUntil:string}};

/** Read only: returning to a public source never grants order or acceptance rights. */
export async function readStorePortalSourceDocuments(companyId:string,storeAccountId:string,customerId:string) {
  if(process.env.STORE_PORTAL_SOURCE_DOCUMENTS_ENABLED!=="true" ||
    !(process.env.FEATURE_STORE_PORTAL_SOURCE_DOCUMENTS_COMPANY_IDS||"").split(",").some(id=>id.trim()===companyId))return [];
  const company=encodeURIComponent(companyId),customer=encodeURIComponent(customerId),account=encodeURIComponent(storeAccountId);
  const sources=await supabaseRequest<Source[]>(`store_owner_activation_requests?company_id=eq.${company}&store_account_id=eq.${account}&customer_id=eq.${customer}`+
    `&consumed_at=not.is.null&cancelled_at=is.null&share_link_id=not.is.null&select=document_id,document_version_id,share_link_id&order=consumed_at.desc&limit=20`);
  const unique=Array.from(new Map(sources.map(source=>[source.document_version_id,source])).values());
  const now=new Date(),today=now.toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"});
  const documents=await Promise.all(unique.map(async source=>{
    const version=encodeURIComponent(source.document_version_id),document=encodeURIComponent(source.document_id);
    // Any previously issued store link owns this version, including revoked/expired links.
    // Do not resurrect it through the public source, or duplicate an active order entry.
    const issued=await supabaseRequest<Array<{id:string}>>(`storefront_links?company_id=eq.${company}&customer_id=eq.${customer}&document_version_id=eq.${version}&select=id&limit=1`);
    if(issued.length)return null;
    const [shares,versions,activeDocuments]=await Promise.all([
      supabaseRequest<Share[]>(`pricing_document_share_links?company_id=eq.${company}&id=eq.${encodeURIComponent(source.share_link_id)}&document_id=eq.${document}&document_version_id=eq.${version}`+
        `&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now.toISOString())}&select=id,document_id,document_version_id,token_nonce,token_hash,expires_at,revoked_at&limit=1`),
      supabaseRequest<Version[]>(`pricing_document_versions?company_id=eq.${company}&id=eq.${version}&document_id=eq.${document}&published_at=not.is.null&select=id,document_id,content&limit=1`),
      supabaseRequest<Array<{id:string}>>(`pricing_documents?company_id=eq.${company}&id=eq.${document}&archived_at=is.null&select=id&limit=1`)
    ]);
    const share=shares[0],published=versions[0];
    if(!share||!published||activeDocuments[0]?.id!==source.document_id||share.id!==source.share_link_id||
      share.document_id!==source.document_id||share.document_version_id!==source.document_version_id||
      published.id!==source.document_version_id||published.document_id!==source.document_id||
      share.revoked_at||Date.parse(share.expires_at)<=now.getTime()||!Number.isFinite(Date.parse(share.expires_at)))return null;
    const content=published.content;
    if(!content||!["sheet","quote"].includes(content.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(content.validUntil)||content.validUntil<today)return null;
    const token=issueDocumentShareToken(share.id,share.token_nonce);
    if(token.hash!==share.token_hash)return null;
    return {title:content.title,kind:content.kind,href:`/pricing-document#${token.token}`,canOrder:false,validUntil:content.validUntil};
  }));
  return documents.filter((item):item is NonNullable<typeof item>=>item!==null);
}
