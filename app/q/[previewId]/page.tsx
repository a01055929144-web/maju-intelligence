import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewRedirect } from "./preview-redirect";
import { industryBasketsEnabled } from "@/lib/pricing/industry-basket-feature";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
type Preview = { company_id: string; preview_title: string; preview_description: string; revoked_at: string | null; expires_at: string };

async function read(previewId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(previewId)) return null;
  const rows = await supabaseRequest<Preview[]>(`pricing_document_share_links?preview_id=eq.${encodeURIComponent(previewId)}&select=company_id,preview_title,preview_description,revoked_at,expires_at&limit=1`).catch(() => []);
  const row = rows[0];
  return row && industryBasketsEnabled(row.company_id) && !row.revoked_at && Date.parse(row.expires_at) > Date.now() ? row : null;
}

export async function generateMetadata({ params }: { params: Promise<{ previewId: string }> }): Promise<Metadata> {
  const preview = await read((await params).previewId);
  return preview ? { title: preview.preview_title, description: preview.preview_description, openGraph: { title: preview.preview_title, description: preview.preview_description, type: "website" } } : { title: "공유 단가표" };
}

export default async function PricingPreviewPage({ params }: { params: Promise<{ previewId: string }> }) {
  const preview = await read((await params).previewId);
  if (!preview) notFound();
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-5"><div className="w-full space-y-2 border-y border-slate-200 py-8"><h1 className="text-xl font-semibold text-slate-950">{preview.preview_title}</h1><p className="text-sm text-slate-600">{preview.preview_description}</p><PreviewRedirect /></div></main>;
}
