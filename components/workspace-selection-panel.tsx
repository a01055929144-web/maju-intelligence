"use client";

import { useState } from "react";
import { ArrowRight, Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { CustomerWorkspaceSummary } from "@/lib/store";
import { normalizeWorkspaceRole, workspaceRoleLabels, workspaceTypeLabels } from "@/lib/workspace";

type WorkspaceSelectionPanelProps = {
  currentCompanyId?: string;
  workspaces: CustomerWorkspaceSummary[];
};

export function WorkspaceSelectionPanel({ currentCompanyId, workspaces }: WorkspaceSelectionPanelProps) {
  const [workspaceList, setWorkspaceList] = useState(workspaces);
  const [pendingCompanyId, setPendingCompanyId] = useState("");
  const [leavingCompanyId, setLeavingCompanyId] = useState("");
  const [error, setError] = useState("");
  const busy = Boolean(pendingCompanyId || leavingCompanyId);

  async function selectWorkspace(companyId: string) {
    setPendingCompanyId(companyId);
    setError("");
    try {
      const response = await fetchWithTimeout(
        "/api/customer/workspaces",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId })
        },
        12000
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message || "워크스페이스를 전환하지 못했습니다.");
        return;
      }
      window.location.href = "/dashboard";
    } catch (error) {
      setError(error instanceof Error ? error.message : "워크스페이스를 전환하지 못했습니다.");
    } finally {
      setPendingCompanyId("");
    }
  }

  async function leaveWorkspace(workspace: CustomerWorkspaceSummary) {
    const isPersonal = workspace.workspaceType === "personal";
    const confirmed = window.confirm(
      `"${workspace.companyName}" 워크스페이스에서 나가시겠습니까?\n${
        isPersonal ? "개인 워크스페이스라 나가면 관련 데이터도 함께 삭제됩니다." : "다시 들어오려면 관리자의 재초대가 필요합니다."
      }\n되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    setLeavingCompanyId(workspace.companyId);
    setError("");
    try {
      const response = await fetchWithTimeout(
        "/api/customer/workspaces",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: workspace.companyId })
        },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; switchedTo?: string } | null;

      if (!response.ok) {
        setError(payload?.message || "워크스페이스 나가기에 실패했습니다.");
        return;
      }

      if (workspace.companyId === currentCompanyId) {
        // 지금 쓰던 워크스페이스를 나갔습니다. 서버가 남은 워크스페이스로 세션을 전환해줬으면
        // 대시보드로, 남은 워크스페이스가 없으면 로그인 화면으로 이동합니다.
        window.location.href = payload?.switchedTo ? "/dashboard" : "/dashboard/login";
        return;
      }
      setWorkspaceList((current) => current.filter((item) => item.companyId !== workspace.companyId));
    } catch (error) {
      setError(error instanceof Error ? error.message : "워크스페이스 나가기에 실패했습니다.");
    } finally {
      setLeavingCompanyId("");
    }
  }

  return (
    <div>
      {error ? <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="divide-y divide-slate-200">
        {workspaceList.map((workspace) => {
          const isPersonal = workspace.workspaceType === "personal";
          const isCurrent = workspace.companyId === currentCompanyId;
          return (
            <div
              key={workspace.companyId}
              className={`grid gap-3 px-4 py-4 transition sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                isCurrent ? "bg-teal-50/70" : "bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isPersonal ? "bg-sky-50 text-sky-700" : "bg-teal-50 text-teal-700"}`}>
                  {isPersonal ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black text-slate-950">{workspace.companyName}</p>
                    {isCurrent ? <Badge className="bg-primary text-primary-foreground">현재</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-500">
                    <span>{workspaceTypeLabels[workspace.workspaceType]}</span>
                    <span className="text-slate-300">/</span>
                    <span>{workspaceRoleLabels[normalizeWorkspaceRole(workspace.role)]}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
                <Button className="w-full sm:w-auto" disabled={busy || isCurrent} onClick={() => selectWorkspace(workspace.companyId)} size="sm">
                  {isCurrent ? "사용 중" : pendingCompanyId === workspace.companyId ? "전환 중" : "전환"}
                  {!isCurrent ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
                <button
                  className="text-xs font-bold text-slate-400 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  onClick={() => leaveWorkspace(workspace)}
                  type="button"
                >
                  {leavingCompanyId === workspace.companyId ? "나가는 중..." : "나가기"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
