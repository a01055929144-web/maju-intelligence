"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarginGroup, PriceItem, PriceState } from "../domains/pricing/price-rules";
import type { PricingCommand, PricingBulkCommand } from "../application/pricing/manage-price-sheets";
import { filterMarginCategories, marginCategoryOptions, marginGroupSummary } from "./pricing-margin-group-options";
import { Button } from "./ui/button";

type Checkpoint = { id?: string; name: string; categories: string[] };
type Props = { companyId: string; state: PriceState; busy: boolean; send: (command?: PricingCommand | PricingBulkCommand) => Promise<PriceState>;
  onBusy: (value: boolean) => void; onMessage: (value: string) => void; onError: (value: string) => void };
const input = "min-h-11 w-full min-w-0 rounded border border-slate-300 bg-white px-3 text-sm";

export function PricingMarginGroups({ companyId, state, busy, send, onBusy, onMessage, onError }: Props) {
  const [items, setItems] = useState<PriceItem[] | null>(null), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0), [id, setId] = useState(""), [name, setName] = useState(""), [margin, setMargin] = useState("12"), [rounding, setRounding] = useState("10");
  const [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(""), [levels, setLevels] = useState(["", "", ""]);
  const [uncertain, setUncertain] = useState<Checkpoint | null>(null), [steps, setSteps] = useState(["미시작", "미시작", "미시작"]);
  const checkpointKey = `maju:margin-group-save:${companyId}`;
  function checkpoint(value: Checkpoint | null) {
    // A missing storage permission must not change server save behavior.
    try { if (value) sessionStorage.setItem(checkpointKey, JSON.stringify(value)); else sessionStorage.removeItem(checkpointKey); } catch { /* Keep the current form in memory. */ }
  }
  function selectGroup(group?: MarginGroup, categories?: string[]) {
    setId(group?.id ?? ""); setName(group?.name ?? ""); setMargin(String(group?.margin ?? 12)); setRounding(String(group?.rounding ?? 10));
    setSelected(categories ?? state.categories.filter(link => link.groupId === group?.id).map(link => link.category));
    setQuery(""); setLevels(["", "", ""]); setSteps(["미시작", "미시작", "미시작"]);
    if (group && (!uncertain || uncertain.name === group.name)) { setUncertain(null); checkpoint(null); }
  }
  const restoredCheckpoint = useRef("");
  useEffect(() => {
    if (restoredCheckpoint.current === checkpointKey) return;
    restoredCheckpoint.current = checkpointKey;
    try {
      const value = JSON.parse(sessionStorage.getItem(checkpointKey) || "null");
      if (!value || typeof value.name !== "string" || !Array.isArray(value.categories) || !value.categories.every((category: unknown) => typeof category === "string")) return;
      const group = state.groups.find(group => group.id === value.id);
      if (group) {
        setId(group.id); setName(group.name); setMargin(String(group.margin)); setRounding(String(group.rounding)); setSelected(value.categories);
        setSteps(["이전 저장 확인", "다시 저장하면 연결 상태 대조", "재확인 대기"]);
      }
      else { setName(value.name); setSelected(value.categories); setUncertain(value); }
    } catch { /* Invalid or unavailable local state is not authentication. */ }
    // Restore once per company; later server reads must not erase unsaved selections.
  }, [checkpointKey, state.groups]);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    async function page(number: number) {
      const params = new URLSearchParams({ companyId, page: String(number) });
      const response = await fetch(`/api/price-sheets?${params}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) throw new Error(result.message || "분류와 상품 수를 불러오지 못했습니다.");
      return result as PriceState;
    }
    void (async () => {
      const first = await page(1), all = [...first.items];
      if (!Number.isSafeInteger(first.total) || first.total < 0 || !Number.isSafeInteger(first.pageSize) || first.pageSize < 1) throw new Error("상품 수를 확인하지 못했습니다.");
      const pages = Math.ceil(first.total / first.pageSize);
      if (pages > 100000) throw new Error("상품 조회 범위를 확인해 주세요.");
      for (let start = 2; start <= pages; start += 4) {
        const batch = await Promise.all(Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => page(start + index)));
        for (const result of batch) { if (result.total !== first.total) throw new Error("상품 목록이 변경됐습니다. 다시 불러와 주세요."); all.push(...result.items); }
      }
      if (new Set(all.map(item => item.id)).size !== first.total) throw new Error("상품 목록이 변경됐습니다. 다시 불러와 주세요.");
      if (!controller.signal.aborted) setItems(all);
    })().catch(error => { if (!controller.signal.aborted) { setItems(null); setLoadError(error instanceof Error ? error.message : "분류를 불러오지 못했습니다."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, busy, reload]);

  const options = useMemo(() => marginCategoryOptions(items ?? [], state.categories), [items, state.categories]);
  const visible = filterMarginCategories(options, query, levels);
  const summary = marginGroupSummary(state, items ?? [], id, selected);
  async function recoverCreation() {
    if (!uncertain) return;
    onBusy(true); onError("");
    try {
      const latest = await send(), matches = latest.groups.filter(group => group.name === uncertain.name);
      if (matches.length === 1) {
        const group = matches[0]; setId(group.id); setName(group.name); setMargin(String(group.margin)); setRounding(String(group.rounding)); setSelected(uncertain.categories);
        setUncertain(null); checkpoint({ ...uncertain, id: group.id }); setSteps(["저장 확인 완료", "다시 저장해 연결 상태 확인", "대기"]);
        onMessage("이미 생성된 그룹을 찾았습니다. 새 그룹을 만들지 않고 기존 그룹으로 이어서 저장합니다.");
      } else onError(matches.length ? "같은 이름의 그룹이 여러 개입니다. 기존 그룹 목록에서 직접 선택해 주세요." : "생성 결과를 아직 확인하지 못했습니다. 중복 생성하지 않도록 조회만 다시 시도해 주세요.");
    } catch (error) { onError(error instanceof Error ? error.message : "그룹 생성 결과를 조회하지 못했습니다."); }
    finally { onBusy(false); }
  }
  async function save() {
    if (busy || loading || !items || uncertain) return;
    const trimmed = name.trim(), rate = Number(margin), unit = Number(rounding);
    if (!trimmed || margin === "" || !Number.isFinite(rate) || rate < 0 || rate > 1000 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-8) { onError("이름과 0~1000% 마진율(소수 둘째 자리까지)을 확인해 주세요."); return; }
    if (selected.some(category => !options.some(option => option.path === category))) { onError("선택한 분류가 변경됐습니다. 목록을 다시 확인하고 선택해 주세요."); return; }
    const moved = selected.filter(category => state.categories.some(link => link.category === category && link.groupId !== id));
    if (moved.length && !window.confirm(`${moved.length}개 분류의 기존 그룹 연결을 이 그룹으로 바꿀까요? 상품의 분류 자체는 바뀌지 않습니다.`)) return;
    onBusy(true); onError(""); onMessage(""); setSteps(["저장 중", "대기", "대기"]);
    let stage = 0, completed = 0, target = id;
    try {
      if (!target) {
        const latest = await send(), matches = latest.groups.filter(group => group.name === trimmed);
        if (matches.length) { onError("같은 이름의 그룹이 있습니다. 기존 그룹을 선택해 수정해 주세요. 새 그룹은 만들지 않았습니다."); setSteps(["기존 그룹 선택 필요", "미시작", "미시작"]); return; }
        checkpoint({ name: trimmed, categories: selected });
      }
      const before = new Set(state.groups.map(group => group.id));
      let latest = await send({ action: "group", ...(target ? { id: target } : {}), name: trimmed, margin: rate, rounding: unit });
      if (!target) {
        const created = latest.groups.filter(group => !before.has(group.id) && group.name === trimmed);
        if (created.length !== 1) throw new Error("새 그룹의 저장 결과를 확인해 주세요.");
        target = created[0].id; setId(target);
      }
      checkpoint({ id: target, name: trimmed, categories: selected }); setSteps(["완료", "저장 중", "대기"]); stage = 1;
      const commands: PricingCommand[] = [
        ...latest.categories.filter(link => link.groupId === target && !selected.includes(link.category)).map(link => ({ action: "category" as const, category: link.category, groupId: "" })),
        ...selected.filter(category => !latest.categories.some(link => link.category === category && link.groupId === target)).map(category => ({ action: "category" as const, category, groupId: target })),
      ];
      for (const command of commands) { latest = await send(command); completed++; setSteps(["완료", `${completed}/${commands.length}개 완료`, "대기"]); }
      setSteps(["완료", "완료", "반영 중"]); stage = 2;
      if (latest.pendingCount > 0) await send({ action: "recalculate" });
      checkpoint(null); setSteps(["완료", "완료", "완료"]); onMessage("그룹·분류 연결을 저장하고 판매가 반영을 마쳤습니다.");
    } catch (error) {
      if (!target) { const pending = { name: trimmed, categories: selected }; setUncertain(pending); checkpoint(pending); }
      setSteps(stage === 0 ? ["실패 또는 응답 미확정", "미시작", "미시작"] : stage === 1 ? ["완료", `${completed}개 완료 후 실패`, "미시작"] : ["완료", "완료", "실패 또는 응답 미확정"]);
      onError(`${stage ? "앞 단계 저장은 유지됩니다. 같은 그룹으로 다시 저장하면 이미 완료된 연결은 건너뜁니다. " : "그룹 생성 결과를 먼저 조회해 주세요. "}${error instanceof Error ? error.message : "저장하지 못했습니다."}`);
    } finally { onBusy(false); }
  }

  return <section aria-label="마진 그룹 만들기·수정" className="min-w-0 space-y-4">
    <div className="flex flex-wrap gap-2"><Button disabled={busy || Boolean(uncertain)} onClick={() => selectGroup()} variant="outline" type="button">새 마진 그룹</Button>
      {state.groups.map(group => <Button key={group.id} disabled={busy} onClick={() => selectGroup(group)} variant={id === group.id ? "default" : "outline"} className="h-auto min-h-11 max-w-full whitespace-normal break-words py-2 text-left" type="button">{group.name} · {group.margin}% · {group.rounding}원 올림</Button>)}</div>
    {!state.groups.length ? <p>마진 그룹이 없습니다. 이름·마진율과 적용할 분류를 골라 새로 만드세요.</p> : null}
    {uncertain ? <div className="space-y-2 rounded border p-3"><p>그룹 생성 응답을 확인하지 못했습니다. 중복 생성을 막기 위해 다시 만들지 않고 기존 그룹을 조회합니다.</p><Button disabled={busy} onClick={() => void recoverCreation()} type="button">생성 결과 다시 조회</Button></div> : null}
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
      <fieldset disabled={busy || Boolean(uncertain)} className="min-w-0 space-y-3">
        <legend className="font-bold">{id ? "그룹 수정" : "그룹 만들기"}</legend>
        <div className="grid gap-3 sm:grid-cols-3"><label>그룹 이름<input aria-label="마진 그룹 이름" className={input} value={name} maxLength={80} required onChange={event => setName(event.target.value)} /></label>
          <label>마진율 (%)<input aria-label="그룹 마진율" className={input} type="number" min="0" max="1000" step="0.01" required value={margin} onChange={event => setMargin(event.target.value)} /></label>
          <label>끝자리 올림<select aria-label="그룹 끝자리 올림" className={input} value={rounding} onChange={event => setRounding(event.target.value)}>{[1, 10, 100].map(value => <option key={value} value={value}>{value}원</option>)}</select></label></div>
        <p>분류 연결은 전체 경로가 같은 상품에만 적용합니다. 상위 분류를 골라도 하위 분류가 자동 연결되지는 않습니다. 상품 분류를 바꾸거나 상품을 이동하지 않습니다.</p>
        <label className="block">분류 검색<input aria-label="마진 적용 분류 검색" className={input} placeholder="대·중·소 분류 이름 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="grid gap-2 sm:grid-cols-3">{["대분류", "중분류", "소분류"].map((label, index) => {
          const choices = Array.from(new Set(options.filter(option => levels.slice(0, index).every((value, level) => !value || option.parts[level] === value)).map(option => option.parts[index]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
          return <label key={label}>{label}<select aria-label={`마진 ${label} 필터`} className={input} value={levels[index]} onChange={event => setLevels(previous => previous.map((value, level) => level === index ? event.target.value : level > index ? "" : value))}><option value="">전체</option>{choices.map(value => <option key={value}>{value}</option>)}</select></label>;
        })}</div>
        {loading ? <p role="status">전체 상품의 분류와 적용 수를 확인하는 중입니다.</p> : null}
        {loadError ? <p role="alert">{loadError}</p> : null}
        <Button disabled={busy || loading} type="button" variant="outline" onClick={() => setReload(value => value + 1)}>분류·상품 수 다시 조회</Button>
        {items && !loading && !loadError ? <div className="max-h-72 overflow-y-auto rounded border" aria-label="실제 상품 분류 선택">{visible.length ? visible.map(option => <label key={option.path} className="flex min-h-11 items-center gap-2 border-b p-2 last:border-0">
          <input aria-label={`마진 분류 ${option.path}`} type="checkbox" disabled={!option.selectable} checked={selected.includes(option.path)} onChange={event => setSelected(previous => event.target.checked ? [...previous, option.path] : previous.filter(path => path !== option.path))} />
          <span className="min-w-0 flex-1 break-words">{option.parts.join(" > ")}<span className="block text-xs text-slate-500">{state.categories.find(link => link.category === option.path) ? `현재 ${state.groups.find(group => group.id === state.categories.find(link => link.category === option.path)?.groupId)?.name || "기존 그룹"}` : "그룹 연결 없음"}{!option.selectable ? " · 상품관리에서 분류 표기를 확인해 주세요" : ""}</span></span><span className="shrink-0">{option.count}개</span>
        </label>) : <p className="p-3">선택할 분류가 없습니다. 검색·필터를 바꾸거나 상품관리의 분류를 확인해 주세요.</p>}</div> : null}
        <div className="rounded border bg-slate-50 p-3" aria-label="선택 분류와 적용 상품 요약"><p>선택 분류 {selected.length}개 · 분류의 활성 상품 {items && !loading && !loadError ? `${summary.categoryProducts}개` : "확인 중"}</p>
          <p>실제 그룹 마진 대상 {items && !loading && !loadError ? `${summary.groupProducts}개` : "확인 중"} <span className="text-xs">(상품 지정 {summary.explicitProducts}개 포함, 현재 조회 기준)</span></p>
          <p className="text-xs">직접 단가·개별 마진·상품 지정 그룹이 우선합니다. 선택 분류의 상품 수와 실제 적용 수가 다를 수 있습니다.</p>
          <div className="mt-2 flex flex-wrap gap-2">{selected.map(category => <button key={category} type="button" className="min-h-11 max-w-full rounded border bg-white px-2 py-1 text-left text-xs [overflow-wrap:anywhere]" onClick={() => setSelected(previous => previous.filter(value => value !== category))}>{category} ×<span className="sr-only"> 연결 선택 해제</span></button>)}</div>
        </div>
        <Button disabled={loading || Boolean(loadError) || !items} type="submit">그룹·분류 저장하고 판매가 반영</Button>
      </fieldset>
    </form>
    <ol className="space-y-1" aria-label="마진 그룹 저장 단계">{["그룹 저장", "분류 연결", "판매가 반영"].map((label, index) => <li key={label}>{index + 1}. {label}: {steps[index]}</li>)}</ol>
  </section>;
}
