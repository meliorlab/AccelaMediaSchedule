import { DAYPARTS, type Daypart } from "@shared/types";
import { money, type EnrichedPlacement, type Period } from "../api";

export type View = "CLIENT" | "ACCELA";
export type EditableField = "clientUnitCost" | "agencyUnitCost" | "wireFee" | "timeSlot" | "daypart";

export function FlightingGrid({
  placements,
  periods,
  view,
  showDaypart,
  daypartsByOutlet,
  onFlight,
  onEditField,
  onSetDaypart,
  onDelete,
  onPattern,
}: {
  placements: EnrichedPlacement[];
  periods: Period[];
  view: View;
  showDaypart: boolean;
  daypartsByOutlet: Map<number, Daypart[]>;
  onFlight: (placementId: number, periodKey: string, delta: number) => void;
  onEditField: (placementId: number, field: EditableField, value: string) => void;
  onSetDaypart: (placementId: number, name: string) => void;
  onDelete: (placementId: number) => void;
  onPattern: (placementId: number) => void;
}) {
  const numCols =
    view === "ACCELA"
      ? ["Accela Cost", "Client Cost", "Ins.", "Sub Total", "Tax", "Grand Total", "Wire", "GT w/ Wire", "USD", "Margin"]
      : ["Client Cost", "Ins.", "Sub Total", "Tax", "Grand Total", "Wire", "GT w/ Wire", "USD"];

  if (placements.length === 0) {
    return <div className="p-8 text-center text-slate-400 text-sm">No placements for this medium yet. Add one above.</div>;
  }

  const colTotals = periods.map((per) =>
    placements.reduce((a, p) => a + (p.flights.find((f) => f.periodKey === per.key)?.count ?? 0), 0),
  );

  const t = (sel: (p: EnrichedPlacement) => number) => placements.reduce((a, p) => a + sel(p), 0);

  return (
    <div className="overflow-x-auto thin-scroll border border-slate-200 rounded-lg bg-white">
      <datalist id="daypart-options">
        {DAYPARTS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <table className="text-xs border-collapse">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="sticky left-0 z-20 bg-slate-800 px-2 py-2 text-left min-w-[160px]">Media House</th>
            <th className="px-2 py-2 text-left min-w-[130px]">Product / Slot</th>
            {showDaypart && <th className="px-2 py-2 text-left min-w-[120px]">Daypart</th>}
            {numCols.map((c) => (
              <th key={c} className="px-2 py-2 text-right whitespace-nowrap">{c}</th>
            ))}
            {periods.map((per) => (
              <th key={per.key} className="px-1 py-1 text-center min-w-[30px] border-l border-slate-700">
                <div className="font-semibold">{per.label}</div>
                <div className="text-[9px] text-slate-300 font-normal">{per.sub}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => {
            const f = p.financials;
            return (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-sky-50/40 group">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-sky-50 px-2 py-1 border-r border-slate-100">
                  <div className="font-medium text-slate-800">{p.outletName}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">{p.countryName}</span>
                    <button
                      className="text-[10px] text-sky-600 hover:underline whitespace-nowrap"
                      onClick={() => onPattern(p.id)}
                      title="Set which days / how often this ad runs"
                    >
                      Set days…
                    </button>
                  </div>
                </td>
                <td className="px-2 py-1">
                  <input
                    className="w-[120px] bg-transparent focus:bg-white focus:ring-1 focus:ring-sky-400 rounded px-1 py-0.5"
                    defaultValue={p.timeSlot || p.productName}
                    onBlur={(e) => onEditField(p.id, "timeSlot", e.target.value)}
                  />
                </td>
                {showDaypart && (
                  <td className="px-2 py-1">
                    <DaypartCell
                      placement={p}
                      dayparts={daypartsByOutlet.get(p.outletId) ?? []}
                      onSetDaypart={onSetDaypart}
                      onEditField={onEditField}
                    />
                  </td>
                )}

                {view === "ACCELA" && (
                  <td className="px-1 py-1 text-right">
                    <NumCell value={p.agencyUnitCost} onCommit={(v) => onEditField(p.id, "agencyUnitCost", v)} />
                  </td>
                )}
                <td className="px-1 py-1 text-right">
                  <NumCell value={p.clientUnitCost} onCommit={(v) => onEditField(p.id, "clientUnitCost", v)} />
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-medium">{f.insertions}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{money(view === "ACCELA" ? f.agencySubTotal : f.subTotal)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{money(f.tax)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{money(view === "ACCELA" ? f.agencyGrandTotal : f.grandTotal)}</td>
                <td className="px-1 py-1 text-right">
                  <NumCell value={p.wireFee} onCommit={(v) => onEditField(p.id, "wireFee", v)} />
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-semibold text-slate-800">{money(f.grandTotalWithWire)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-500">{money(f.usd)}</td>
                {view === "ACCELA" && <td className="px-2 py-1 text-right tabular-nums text-emerald-600">{money(f.margin)}</td>}

                {periods.map((per) => {
                  const count = p.flights.find((fl) => fl.periodKey === per.key)?.count ?? 0;
                  return (
                    <td
                      key={per.key}
                      onClick={() => onFlight(p.id, per.key, 1)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onFlight(p.id, per.key, -1);
                      }}
                      title="Click +1 · Right-click −1"
                      className={`text-center border-l border-slate-100 cursor-pointer select-none tabular-nums ${
                        count > 0 ? "bg-emerald-100 text-emerald-800 font-semibold hover:bg-emerald-200" : "text-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {count > 0 ? count : "·"}
                    </td>
                  );
                })}
                <td className="px-1">
                  <button className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 px-1" onClick={() => onDelete(p.id)} title="Remove placement">
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-orange-50 border-t-2 border-orange-200 font-semibold text-slate-700">
            <td className="sticky left-0 z-10 bg-orange-50 px-2 py-1.5">TOTAL</td>
            <td></td>
            {showDaypart && <td></td>}
            {view === "ACCELA" && <td></td>}
            <td></td>
            <td className="px-2 py-1.5 text-right tabular-nums">{t((p) => p.financials.insertions)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(t((p) => (view === "ACCELA" ? p.financials.agencySubTotal : p.financials.subTotal)))}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(t((p) => p.financials.tax))}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(t((p) => (view === "ACCELA" ? p.financials.agencyGrandTotal : p.financials.grandTotal)))}</td>
            <td></td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(t((p) => p.financials.grandTotalWithWire))}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{money(t((p) => p.financials.usd))}</td>
            {view === "ACCELA" && <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{money(t((p) => p.financials.margin))}</td>}
            {periods.map((per, i) => (
              <td key={per.key} className="text-center border-l border-orange-200 tabular-nums">
                {colTotals[i] || ""}
              </td>
            ))}
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DaypartCell({
  placement,
  dayparts,
  onSetDaypart,
  onEditField,
}: {
  placement: EnrichedPlacement;
  dayparts: Daypart[];
  onSetDaypart: (placementId: number, name: string) => void;
  onEditField: (placementId: number, field: EditableField, value: string) => void;
}) {
  if (dayparts.length === 0) {
    // No dayparts defined for this outlet — fall back to free text (add them in Reference Data).
    return (
      <input
        list="daypart-options"
        key={placement.daypart}
        className="w-[120px] bg-transparent focus:bg-white focus:ring-1 focus:ring-sky-400 rounded px-1 py-0.5"
        defaultValue={placement.daypart}
        placeholder="Add in Ref. Data"
        onBlur={(e) => onEditField(placement.id, "daypart", e.target.value)}
      />
    );
  }
  const isCustom = placement.daypart !== "" && !dayparts.some((d) => d.name === placement.daypart);
  return (
    <select
      value={placement.daypart}
      onChange={(e) => onSetDaypart(placement.id, e.target.value)}
      className="w-[130px] bg-transparent focus:bg-white focus:ring-1 focus:ring-sky-400 rounded px-1 py-0.5"
      title={dayparts.find((d) => d.name === placement.daypart)?.time || ""}
    >
      <option value="">—</option>
      {dayparts.map((d) => (
        <option key={d.id} value={d.name}>
          {d.name}
          {d.time ? ` (${d.time})` : ""}
        </option>
      ))}
      {isCustom && <option value={placement.daypart}>{placement.daypart}</option>}
    </select>
  );
}

function NumCell({ value, onCommit }: { value: number; onCommit: (v: string) => void }) {
  return (
    <input
      type="number"
      defaultValue={value}
      key={value}
      onBlur={(e) => onCommit(e.target.value)}
      className="w-16 text-right bg-transparent focus:bg-white focus:ring-1 focus:ring-sky-400 rounded px-1 py-0.5 tabular-nums"
    />
  );
}
