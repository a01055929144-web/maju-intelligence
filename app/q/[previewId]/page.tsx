import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PreviewRedirect } from "./preview-redirect";
import { readDocumentSharePreview } from "@/lib/pricing/document-share";

export const dynamic = "force-dynamic";
const read = cache((previewId: string) => readDocumentSharePreview(previewId).catch(() => null));
const privateMetadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export async function generateMetadata({ params }: { params: Promise<{ previewId: string }> }): Promise<Metadata> {
  const preview = await read((await params).previewId);
  const title = preview?.title || "공유 단가표", description = preview?.description || "";
  return { ...privateMetadata, title, description,
    openGraph: { title, description, siteName: "MAJU", locale: "ko_KR", type: "website" },
    twitter: { card: "summary_large_image", title, description } };
}

export default async function PricingPreviewPage({ params }: { params: Promise<{ previewId: string }> }) {
  const preview = await read((await params).previewId);
  if (!preview) notFound();
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-5"><div className="w-full space-y-2 border-y border-slate-200 py-8"><h1 className="text-xl font-semibold text-slate-950">{preview.title}</h1><p className="text-sm text-slate-600">{preview.description}</p><PreviewRedirect /></div></main>;
}
