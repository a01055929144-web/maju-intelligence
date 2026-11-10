import {afterEach,beforeEach,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>vi.fn());vi.mock("server-only",()=>({}));vi.mock("../lib/store",()=>({supabaseRequest:db}));
import {issueDocumentShareToken} from "../lib/pricing/document-share-token";
import {readStorePortalSourceDocuments as read} from "../lib/pricing/store-portal-source-documents";
const company="company",account="account",customer="customer",document="document",version="version",share="10000000-0000-4000-8000-000000000001",nonce="a".repeat(32);
let expiredVersion:boolean,expired:boolean,revoked:boolean,archived:boolean,issued:boolean,duplicate:boolean,invalidHash:boolean,wrongVersion:boolean;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("STORE_PORTAL_SOURCE_DOCUMENTS_ENABLED","true");vi.stubEnv("FEATURE_STORE_PORTAL_SOURCE_DOCUMENTS_COMPANY_IDS",company);vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET","synthetic-document-secret-more-than-32-characters");
 expiredVersion=expired=revoked=archived=issued=duplicate=invalidHash=wrongVersion=false;
 db.mockImplementation(async(path:string,init:unknown)=>{
  expect(init).toBeUndefined();expect(path).toContain(`company_id=eq.${company}`);
  if(path.startsWith("store_owner_activation_requests?")){
   expect(path).toContain(`store_account_id=eq.${account}&customer_id=eq.${customer}`);expect(path).toContain("consumed_at=not.is.null&cancelled_at=is.null");
   const source={document_id:document,document_version_id:version,share_link_id:share};return duplicate?[source,source]:[source];
  }
  if(path.startsWith("storefront_links?")){
   expect(path).toContain(`customer_id=eq.${customer}&document_version_id=eq.${version}`);expect(path).not.toContain("revoked_at=is.null");return issued?[{id:"previous-issued"}]:[];
  }
  if(path.startsWith("pricing_document_share_links?")){
   expect(path).toContain(`id=eq.${share}&document_id=eq.${document}&document_version_id=eq.${version}`);expect(path).toContain("revoked_at=is.null&expires_at=gt.");
   return [{id:share,document_id:document,document_version_id:wrongVersion?"other":version,token_nonce:nonce,token_hash:invalidHash?"bad":issueDocumentShareToken(share,nonce).hash,expires_at:expired?"2000-01-01":"2099-01-01",revoked_at:revoked?"2026-01-01":null}];
  }
  if(path.startsWith("pricing_document_versions?"))return [{id:version,document_id:document,content:{kind:"sheet",title:"합성 가입 문서",validUntil:expiredVersion?"2000-01-01":"2099-01-01"}}];
  if(path.startsWith("pricing_documents?")){expect(path).toContain("archived_at=is.null");return archived?[]:[{id:document}];}
  throw new Error("unexpected query");
 });
});
afterEach(()=>vi.unstubAllEnvs());
it("shows the consumed signup source with the original public token and no new order rights or writes",async()=>{
 const expected=[{title:"합성 가입 문서",kind:"sheet",href:`/pricing-document#${issueDocumentShareToken(share,nonce).token}`,canOrder:false,validUntil:"2099-01-01"}];
 expect(await read(company,account,customer)).toEqual(expected);expect(await read(company,account,customer)).toEqual(expected);
 expect(db.mock.calls.every(([,init])=>init===undefined)).toBe(true);
});
it("deduplicates repeated source records and never resurrects any previously issued store version",async()=>{
 duplicate=true;expect(await read(company,account,customer)).toHaveLength(1);
 issued=true;expect(await read(company,account,customer)).toEqual([]);
 expect(db.mock.calls.filter(([path])=>path.startsWith("storefront_links?")).length).toBe(2);
});
it.each(["expired","document_expired","revoked","archived","hash","version"])("hides unavailable source %s",async reason=>{
 expiredVersion=reason==="document_expired";expired=reason==="expired";revoked=reason==="revoked";archived=reason==="archived";invalidHash=reason==="hash";wrongVersion=reason==="version";
 expect(await read(company,account,customer)).toEqual([]);
});
it("keeps OFF and excluded companies on the original query path",async()=>{
 vi.stubEnv("STORE_PORTAL_SOURCE_DOCUMENTS_ENABLED","false");expect(await read(company,account,customer)).toEqual([]);expect(db).not.toHaveBeenCalled();
 vi.stubEnv("STORE_PORTAL_SOURCE_DOCUMENTS_ENABLED","true");vi.stubEnv("FEATURE_STORE_PORTAL_SOURCE_DOCUMENTS_COMPANY_IDS","other");expect(await read(company,account,customer)).toEqual([]);expect(db).not.toHaveBeenCalled();
});
it("does not hide a source lookup failure as an empty successful portal",async()=>{
 db.mockRejectedValue(new Error("lookup unavailable"));await expect(read(company,account,customer)).rejects.toThrow("lookup unavailable");
});
