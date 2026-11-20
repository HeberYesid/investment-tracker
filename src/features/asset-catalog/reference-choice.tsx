"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogLabels as labels } from "@/lib/i18n/asset-catalog";
import { ASSET_EXCHANGES, ASSET_QUOTE_CURRENCIES, AssetDecision, CandidateGroups, NEW_ASSET_TYPES, type CandidateGroup } from "@/lib/validations/asset-catalog";

export async function fetchReferenceCandidates(tickers: string[]) {
  const query = new URLSearchParams();
  for (const ticker of tickers) query.append("ticker", ticker);
  const response = await fetch(`/api/v1/assets/references?${query}`);
  if (!response.ok) throw new Error(labels.lookupError);
  const { data } = await response.json();
  return CandidateGroups.parse(data);
}

export function ReferenceSearch({ tickers, onLoad }: { tickers: string[]; onLoad: (groups: CandidateGroup[]) => void }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setPending(true);
    setFailed(false);
    try {
      const groups = [];
      const distinct = [...new Set(tickers)];
      for (let offset = 0; offset < distinct.length; offset += 20) {
        groups.push(...await fetchReferenceCandidates(distinct.slice(offset, offset + 20)));
      }
      onLoad(groups);
    } catch { setFailed(true); }
    finally { setPending(false); }
  }

  return <div className="space-y-1">
    <Button type="button" variant="secondary" disabled={pending || tickers.length === 0} onClick={load}>{labels.lookup}</Button>
    {failed && <p role="alert" className="text-sm text-text-secondary">{labels.lookupError}</p>}
  </div>;
}

type Props = {
  group?: CandidateGroup;
  // null: elección individual en curso; undefined: selección borrada.
  onChange: (decision: AssetDecision | null | undefined) => void;
  legend?: string;
  required?: boolean;
  emptyLabel?: string;
};

const inputClass = "min-h-12 w-full rounded-xl border border-border-subtle bg-surface px-3 text-base text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring";

export function ReferenceChoice({ group, onChange, legend = labels.legend, required, emptyLabel = labels.placeholder }: Props) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const [identity, setIdentity] = useState({ exchange: "", currency: "", asset_type: "" });

  function change(next: string, fields = identity) {
    if (next === "new") {
      const result = AssetDecision.safeParse({ kind: "new", ...fields });
      onChange(result.success ? result.data : null);
      return;
    }
    const candidate = group?.candidates.find(({ id }) => id === next);
    onChange(candidate ? { kind: "existing", asset_id: candidate.id,
      ...(candidate.exchange !== null && { exchange: candidate.exchange }), currency: candidate.currency, asset_type: candidate.asset_type } : next ? null : undefined);
  }

  function changeField(field: keyof typeof identity, value: string) {
    const next = { ...identity, [field]: value };
    setIdentity(next);
    change(selected, next);
  }

  return <fieldset className="space-y-3 rounded-xl border border-border-subtle px-3 pb-3">
    <legend className="px-1 text-sm font-semibold text-text-primary">{legend}</legend>
    <label className="block text-sm text-text-secondary" htmlFor={`${id}-choice`}>{labels.legend}</label>
    <select id={`${id}-choice`} name={`${id}-choice`} className={inputClass} value={selected} required={required}
      onChange={(event) => { setSelected(event.target.value); change(event.target.value); }}>
      <option value="">{emptyLabel}</option>
      {group?.candidates.map((asset) => <option key={asset.id} value={asset.id}>
        {[asset.ticker, asset.name !== asset.ticker ? asset.name : null, asset.exchange ?? labels.unknownExchange,
          asset.currency, labels.types[asset.asset_type], asset.id.slice(-8)].filter(Boolean).join(" · ")}
      </option>)}
      <option value="new">{labels.create}</option>
    </select>
    {group?.truncated && <p role="status" className="text-sm text-text-secondary">{labels.truncated}</p>}
    {selected === "new" && <>
      {([
        ["exchange", labels.exchange, ASSET_EXCHANGES],
        ["currency", labels.currency, ASSET_QUOTE_CURRENCIES],
        ["asset_type", labels.type, NEW_ASSET_TYPES],
      ] as const).map(([field, label, options]) => <div key={field} className="space-y-1">
        <label className="block text-sm text-text-secondary" htmlFor={`${id}-${field}`}>{label}</label>
        <select id={`${id}-${field}`} name={`${id}-${field}`} value={identity[field]} required={required} className={inputClass}
          onChange={(event) => changeField(field, event.target.value)}>
          <option value="">{labels.placeholder}</option>
          {options.map((option) => <option key={option} value={option}>{option === "STOCK" || option === "ETF" ? labels.types[option] : option}</option>)}
        </select>
      </div>)}
      <p className="text-sm text-text-secondary">{labels.pendingQuote}</p>
    </>}
  </fieldset>;
}
