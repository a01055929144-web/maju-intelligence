"use client";

import { useState } from "react";
import { ArrowRight, Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomerWorkspaceSummary } from "@/lib/store";
import { workspaceRoleLabels, workspaceTypeLabels } from "@/lib/workspace";

type WorkspaceSelectionPanelProps = {
  currentCompanyId?: string;
  workspaces: CustomerWorkspaceSummary[];
};

export function WorkspaceSelectionPanel({ currentCompanyId, workspaces }: WorkspaceSelectionPanelProps) {
  const [pendingCompanyId, setPendingCompanyId] = useState("");
  const [error, setError] = useState("");

  async function selectWorkspace(companyId: string) {
    setPendingCompanyId(companyId);
    setError("");
    const response = await fetch("/api/customer/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId })
    });
    setPendingCompanyId("");
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message || "워크스페이스를 전환하지 못했습니다.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <div>
      {error ? <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="divide-y divide-slate-200">
        {workspaces.map((workspace) => {
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
                    <span>{workspaceRoleLabels[workspace.role]}</span>
                  </div>
                </div>
              </div>
              <Button className="w-full sm:w-auto" disabled={Boolean(pendingCompanyId) || isCurrent} onClick={() => selectWorkspace(workspace.companyId)} size="sm">
                {isCurrent ? "사용 중" : pendingCompanyId === workspace.companyId ? "전환 중" : "전환"}
                {!isCurrent ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
