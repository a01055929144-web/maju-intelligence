"use client";

// 인스타 아이디 찾기(2026-10-25). DM을 보내려면 아이디가 먼저 있어야 하므로,
// ① 네이버 검색 결과에서 후보 자동 찾기 ② 인스타·네이버·구글 검색 바로가기 ③ 복사한 링크 붙여넣기를 한곳에 모았습니다.
// 후보는 자동 저장하지 않고, 프로필을 열어 확인한 뒤 "이 계정 저장"을 눌러야 저장됩니다.

import { useState } from "react";
import { ClipboardPaste, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import type { InstagramCandidate } from "@/domains/lead/instagram-discovery";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { withPermitLeadCompanyQuery } from "@/components/sales-route-map-workspace";

type DiscoveryPayload = { ok: boolean; candidates?: InstagramCandidate[]; message?: string; documentCount?: number };

function areaText(address?: string) {
  return String(address || "")
    .split(/\s+/)
    .filter((token) => /(구|동|군|읍|면)$/.test(token))
    .slice(0, 2)
    .join(" ");
}

export function InstagramCandidateFinder({
  address,
  businessName,
  leadId,
  onPaste,
  onPick,
  saving
}: {
  readonly address?: string;
  readonly businessName: string;
  readonly leadId: string;
  readonly onPaste: (value: string) => void;
  readonly onPick: (handle: string) => void;
  readonly saving: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [candidates, setCandidates] = useState<InstagramCandidate[]>([]);
  const [message, setMessage] = useState("");
  const query = `${businessName} ${areaText(address)}`.trim();

  async function findCandidates() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${leadId}/instagram-candidates`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        15000
      );
      const payload = (await response.json().catch(() => null)) as DiscoveryPayload | null;
      if (!payload?.ok) {
        setState("error");
        setMessage(payload?.message || "후보를 찾지 못했습니다.");
        return;
      }
      setCandidates(payload.candidates || []);
      setState("done");
      if (!payload.candidates?.length) setMessage(`검색 결과 ${payload.documentCount ?? 0}건에서 인스타 계정을 찾지 못했습니다. 아래 검색 버튼으로 직접 찾아 주세요.`);
    } catch {
      setState("error");
      setMessage("네트워크 오류로 후보를 찾지 못했습니다.");
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onPaste(text.trim());
    } catch {
      setMessage("붙여넣기 권한이 없습니다. 입력칸에 직접 붙여 넣어 주세요(Ctrl+V).");
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-pink-100 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="maju-button-primary h-8 px-2 text-xs disabled:opacity-50" disabled={state === "loading"} onClick={() => void findCandidates()} type="button">
          {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          아이디 후보 찾기
        </button>
        <a className="maju-button-secondary h-8 px-2 text-xs" href={`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(businessName)}`} rel="noreferrer" target="_blank">
          <Search className="h-3.5 w-3.5" />
          인스타에서
        </a>
        <a className="maju-button-secondary h-8 px-2 text-xs" href={`https://search.naver.com/search.naver?query=${encodeURIComponent(`${query} 인스타`)}`} rel="noreferrer" target="_blank">
          <Search className="h-3.5 w-3.5" />
          네이버에서
        </a>
        <button className="maju-button-secondary h-8 px-2 text-xs" onClick={() => void pasteFromClipboard()} type="button">
          <ClipboardPaste className="h-3.5 w-3.5" />
          복사한 링크 붙여넣기
        </button>
      </div>

      {state === "done" && candidates.length ? (
        <ul className="mt-2 grid gap-1.5">
          {candidates.map((candidate) => (
            <li className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5" key={candidate.handle}>
              <span className="text-xs font-black text-slate-900">@{candidate.handle}</span>
              {candidate.nameMatched ? <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-black text-teal-700">상호 일치</span> : null}
              {candidate.regionMatched ? <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">지역 일치</span> : null}
              <span className="text-[10px] font-semibold text-slate-500">언급 {candidate.mentions}건</span>
              <span className="ml-auto flex gap-1">
                <a className="maju-button-secondary h-7 px-2 text-[11px]" href={`https://www.instagram.com/${encodeURIComponent(candidate.handle)}/`} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-3 w-3" />
                  프로필 확인
                </a>
                <button className="maju-button-primary h-7 px-2 text-[11px] disabled:opacity-50" disabled={saving} onClick={() => onPick(candidate.handle)} type="button">
                  이 계정 저장
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {state === "done" && candidates.length ? <p className="mt-1.5 text-[11px] font-semibold text-slate-500">자동 후보는 틀릴 수 있어요. 프로필에서 상호·주소를 확인하고 저장하세요.</p> : null}
      {message ? <p className={`mt-1.5 text-[11px] font-bold ${state === "error" ? "text-red-700" : "text-slate-600"}`}>{message}</p> : null}
    </div>
  );
}
