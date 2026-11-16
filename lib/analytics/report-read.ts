import type { AnalysisResult } from "../analysis";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function readLatestReport(
  request: Request,
  companyId: string | undefined,
  emptyReport: () => AnalysisResult,
  analyzeCurrent: (companyId: string) => Promise<AnalysisResult>
) {
  if (!companyId) return emptyReport();

  try {
    const reports = await request<Array<{ report: AnalysisResult }>>(
      `ai_reports?select=report&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=1`
    );
    return reports[0]?.report || analyzeCurrent(companyId);
  } catch (error) {
    console.error("Latest report fallback:", error);
    return analyzeCurrent(companyId).catch(emptyReport);
  }
}

export async function readReportById(
  request: Request,
  reportId: string,
  companyId?: string
): Promise<AnalysisResult | null> {
  if (!companyId) return null;

  const reports = await request<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report&id=eq.${encodeURIComponent(reportId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`
  );
  return reports[0]?.report || null;
}
