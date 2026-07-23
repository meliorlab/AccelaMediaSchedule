import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { BookingOrder, Country, Daypart, Medium } from "@shared/types";
import { MEDIA, WEEKDAY_LABELS } from "@shared/types";
import { computeFinancials } from "@shared/calc";
import { api, money, type CampaignBundle, type EnrichedPlacement, type OutletWithProducts, type Period } from "../api";
import { Button, Card, Field, Input, MediumBadge, Modal, Select } from "../components/ui";
import { FlightingGrid, type EditableField, type View } from "../components/FlightingGrid";

type Tab = Medium | "Booking Orders" | "Summary";

export default function CampaignEditor() {
  const { id } = useParams();
  const campaignId = Number(id);
  const [bundle, setBundle] = useState<CampaignBundle | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [outlets, setOutlets] = useState<OutletWithProducts[]>([]);
  const [tab, setTab] = useState<Tab>("TV");
  const [view, setView] = useState<View>("CLIENT");
  const [addOpen, setAddOpen] = useState(false);
  const [patternId, setPatternId] = useState<number | null>(null);

  const vatByCountry = useMemo(() => new Map(countries.map((c) => [c.id, c.vatRate])), [countries]);
  const daypartsByOutlet = useMemo(() => new Map<number, Daypart[]>(outlets.map((o) => [o.id, o.dayparts])), [outlets]);

  const load = useCallback(async () => {
    const [b, c, o] = await Promise.all([api.getBundle(campaignId), api.listCountries(), api.listOutlets()]);
    setBundle(b);
    setCountries(c);
    setOutlets(o);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const recompute = useCallback(
    (p: EnrichedPlacement): EnrichedPlacement => {
      const insertions = p.flights.reduce((a, f) => a + f.count, 0);
      const financials = computeFinancials({
        clientUnitCost: p.clientUnitCost,
        agencyUnitCost: p.agencyUnitCost,
        insertions,
        vatRate: vatByCountry.get(p.countryId) ?? 0,
        wireFee: p.wireFee,
        fxRate: bundle?.campaign.fxRate ?? 1,
      });
      return { ...p, financials };
    },
    [bundle?.campaign.fxRate, vatByCountry],
  );

  const patchPlacement = (placementId: number, patch: Partial<EnrichedPlacement>) => {
    setBundle((prev) =>
      prev
        ? { ...prev, placements: prev.placements.map((p) => (p.id === placementId ? recompute({ ...p, ...patch }) : p)) }
        : prev,
    );
  };

  const onFlight = async (placementId: number, periodKey: string, delta: number) => {
    const target = bundle?.placements.find((p) => p.id === placementId);
    if (!target) return;
    const existing = target.flights.find((f) => f.periodKey === periodKey);
    const newCount = Math.max(0, (existing?.count ?? 0) + delta);
    const flights = existing
      ? target.flights.map((f) => (f.periodKey === periodKey ? { ...f, count: newCount } : f)).filter((f) => f.count > 0)
      : newCount > 0
        ? [...target.flights, { id: Date.now(), placementId, periodKey, count: newCount }]
        : target.flights;
    patchPlacement(placementId, { flights });
    await api.setFlight(placementId, periodKey, newCount);
  };

  const onEditField = async (placementId: number, field: EditableField, value: string) => {
    const isText = field === "timeSlot" || field === "daypart";
    const patch: Partial<EnrichedPlacement> = isText ? { [field]: value } : { [field]: Number(value) };
    patchPlacement(placementId, patch);
    await api.updatePlacement(placementId, patch as Record<string, unknown>);
  };

  const onSetDaypart = async (placementId: number, name: string) => {
    const p = bundle?.placements.find((x) => x.id === placementId);
    const dps = p ? daypartsByOutlet.get(p.outletId) ?? [] : [];
    const dp = dps.find((d) => d.name === name);
    const patch: Partial<EnrichedPlacement> = { daypart: name, timeSlot: dp ? dp.time : p?.timeSlot ?? "" };
    patchPlacement(placementId, patch);
    await api.updatePlacement(placementId, patch as Record<string, unknown>);
  };

  const applyPattern = async (placementId: number, cells: { periodKey: string; count: number }[], clearFirst: boolean) => {
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            placements: prev.placements.map((p) => {
              if (p.id !== placementId) return p;
              const map = new Map((clearFirst ? [] : p.flights).map((f) => [f.periodKey, f]));
              for (const c of cells) {
                if (c.count > 0) map.set(c.periodKey, { id: Date.now() + Math.random(), placementId, periodKey: c.periodKey, count: c.count });
                else map.delete(c.periodKey);
              }
              return recompute({ ...p, flights: [...map.values()] });
            }),
          }
        : prev,
    );
    await api.setFlightsBulk(placementId, cells, clearFirst);
  };

  const onDelete = async (placementId: number) => {
    setBundle((prev) => (prev ? { ...prev, placements: prev.placements.filter((p) => p.id !== placementId) } : prev));
    await api.deletePlacement(placementId);
  };

  if (!bundle) return <p className="text-slate-400">Loading campaign…</p>;

  const c = bundle.campaign;
  const mediaTabs: Tab[] = [...MEDIA, "Booking Orders", "Summary"];
  const activePlacements = MEDIA.includes(tab as Medium)
    ? bundle.placements.filter((p) => p.medium === tab)
    : [];

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link to="/" className="text-xs text-sky-600 hover:underline">
            ← All campaigns
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">{c.name}</h1>
          <p className="text-slate-500 text-sm">
            {c.period} · {c.startDate} → {c.endDate} · {c.gridMode} grid · FX {c.fxRate} XCD/USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-slate-300">
            <button
              className={`px-3 py-1.5 text-sm ${view === "CLIENT" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}
              onClick={() => setView("CLIENT")}
            >
              Client
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${view === "ACCELA" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}
              onClick={() => setView("ACCELA")}
            >
              Accela
            </button>
          </div>
          <a href={api.exportUrl(campaignId)}>
            <Button variant="primary">Media Schedule .xlsx</Button>
          </a>
          <a href={api.bookingOrdersUrl(campaignId)}>
            <Button variant="subtle">Booking Orders .xlsx</Button>
          </a>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {mediaTabs.map((m) => {
          const count = MEDIA.includes(m as Medium) ? bundle.placements.filter((p) => p.medium === m).length : null;
          return (
            <button
              key={m}
              onClick={() => setTab(m)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                tab === m ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {m}
              {count != null && count > 0 && <span className="ml-1.5 text-xs bg-slate-200 text-slate-600 rounded-full px-1.5">{count}</span>}
            </button>
          );
        })}
      </div>

      {MEDIA.includes(tab as Medium) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MediumBadge medium={tab} />
              <span className="text-sm text-slate-500">{activePlacements.length} placement(s)</span>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add {tab} Placement
            </Button>
          </div>
          <FlightingGrid
            placements={activePlacements}
            periods={bundle.periods}
            view={view}
            showDaypart={tab === "TV" || tab === "Radio"}
            daypartsByOutlet={daypartsByOutlet}
            onFlight={onFlight}
            onEditField={onEditField}
            onSetDaypart={onSetDaypart}
            onDelete={onDelete}
            onPattern={(id) => setPatternId(id)}
          />
          <p className="text-xs text-slate-400 mt-2">
            Use <span className="font-medium text-slate-500">Set days…</span> to schedule which days / how often the ad runs, or click a
            calendar cell to add a spot (+1) and right-click to remove (−1). Daypart, cost, and wire fields are editable inline.
          </p>
        </div>
      )}

      {tab === "Booking Orders" && <BookingOrdersView campaignId={campaignId} />}
      {tab === "Summary" && <SummaryView campaignId={campaignId} />}

      <AddPlacementModal
        open={addOpen}
        medium={tab as Medium}
        outlets={outlets.filter((o) => o.medium === tab)}
        onClose={() => setAddOpen(false)}
        onAdd={async (body) => {
          await api.createPlacement(campaignId, body);
          setAddOpen(false);
          await load();
        }}
      />

      <PatternModal
        placement={bundle.placements.find((p) => p.id === patternId) ?? null}
        periods={bundle.periods}
        gridMode={c.gridMode}
        onClose={() => setPatternId(null)}
        onApply={async (cells, clearFirst) => {
          if (patternId != null) await applyPattern(patternId, cells, clearFirst);
          setPatternId(null);
        }}
      />
    </div>
  );
}

function PatternModal({
  placement,
  periods,
  gridMode,
  onClose,
  onApply,
}: {
  placement: EnrichedPlacement | null;
  periods: Period[];
  gridMode: "daily" | "weekly";
  onClose: () => void;
  onApply: (cells: { periodKey: string; count: number }[], clearFirst: boolean) => void;
}) {
  const [days, setDays] = useState<boolean[]>([false, true, true, true, true, true, false]); // Mon-Fri default
  const [spots, setSpots] = useState(1);
  const [everyN, setEveryN] = useState(1);
  const [replace, setReplace] = useState(true);

  useEffect(() => {
    if (placement) {
      setDays([false, true, true, true, true, true, false]);
      setSpots(1);
      setEveryN(1);
      setReplace(true);
    }
  }, [placement?.id]);

  const cells = useMemo(() => {
    if (!periods.length) return [] as { periodKey: string; count: number }[];
    if (gridMode === "weekly") {
      return periods
        .map((per, i) => ({ periodKey: per.key, count: i % everyN === 0 ? spots : 0 }))
        .filter((c) => c.count > 0);
    }
    const start = new Date(periods[0].key + "T00:00:00");
    return periods
      .map((per) => {
        const d = new Date(per.key + "T00:00:00");
        const weekIndex = Math.floor((d.getTime() - start.getTime()) / (7 * 864e5));
        const include = days[d.getDay()] && weekIndex % everyN === 0;
        return { periodKey: per.key, count: include ? spots : 0 };
      })
      .filter((c) => c.count > 0);
  }, [periods, gridMode, days, spots, everyN]);

  const totalSpots = cells.reduce((a, c) => a + c.count, 0);

  return (
    <Modal open={!!placement} title={`Schedule pattern — ${placement?.outletName ?? ""}`} onClose={onClose}>
      <div className="space-y-4">
        {gridMode === "daily" ? (
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1.5">Days of week</span>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setDays((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                  className={`w-11 py-1.5 rounded-md text-xs font-medium border ${
                    days[i] ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Weekly grid: the pattern applies spots to each qualifying week.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={gridMode === "daily" ? "Spots per day" : "Spots per week"}>
            <Input type="number" min={0} value={spots} onChange={(e) => setSpots(Math.max(0, Number(e.target.value)))} />
          </Field>
          <Field label={gridMode === "daily" ? "Every N weeks" : "Every N periods"}>
            <Input type="number" min={1} value={everyN} onChange={(e) => setEveryN(Math.max(1, Number(e.target.value)))} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace existing spots for this placement
        </label>

        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
          This will schedule <span className="font-semibold text-slate-800">{totalSpots}</span> spot(s) across{" "}
          <span className="font-semibold text-slate-800">{cells.length}</span> {gridMode === "daily" ? "day(s)" : "week(s)"}.
          You can still fine-tune individual cells afterwards.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApply(cells, replace)} disabled={cells.length === 0}>
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddPlacementModal({
  open,
  medium,
  outlets,
  onClose,
  onAdd,
}: {
  open: boolean;
  medium: Medium;
  outlets: OutletWithProducts[];
  onClose: () => void;
  onAdd: (body: Record<string, unknown>) => void;
}) {
  const [outletId, setOutletId] = useState(0);
  const [productId, setProductId] = useState<number | "">("");
  const [daypart, setDaypart] = useState("");
  const showDaypart = medium === "TV" || medium === "Radio";

  useEffect(() => {
    if (open) {
      setOutletId(outlets[0]?.id ?? 0);
      setProductId(outlets[0]?.products[0]?.id ?? "");
      setDaypart("");
    }
  }, [open, outlets]);

  const selected = outlets.find((o) => o.id === outletId);

  return (
    <Modal open={open} title={`Add ${medium} Placement`} onClose={onClose}>
      {outlets.length === 0 ? (
        <div className="text-sm text-slate-500">
          No {medium} media houses defined.{" "}
          <Link to="/reference" className="text-sky-600 hover:underline">
            Add one in Reference Data.
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Media House">
            <Select
              value={outletId}
              onChange={(e) => {
                const oid = Number(e.target.value);
                setOutletId(oid);
                setProductId(outlets.find((o) => o.id === oid)?.products[0]?.id ?? "");
              }}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Product / Rate">
            <Select value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— No rate card (enter costs manually) —</option>
              {selected?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.rackRate)}
                </option>
              ))}
            </Select>
          </Field>
          {showDaypart && (
            <Field label="Daypart / Time band">
              {selected && selected.dayparts.length > 0 ? (
                <Select value={daypart} onChange={(e) => setDaypart(e.target.value)}>
                  <option value="">— None —</option>
                  {selected.dayparts.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                      {d.time ? ` (${d.time})` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs text-slate-500">
                  No dayparts defined for this media house.{" "}
                  <Link to="/reference" className="text-sky-600 hover:underline">
                    Add them in Reference Data.
                  </Link>
                </p>
              )}
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const time = selected?.dayparts.find((d) => d.name === daypart)?.time ?? "";
                onAdd({ outletId, productId: productId || null, daypart, timeSlot: time || undefined });
              }}
              disabled={!outletId}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BookingOrdersView({ campaignId }: { campaignId: number }) {
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  useEffect(() => {
    api.getBookingOrders(campaignId).then(setOrders);
  }, [campaignId]);

  if (orders.length === 0) return <div className="text-slate-400 text-sm p-6">No placements yet — booking orders appear once you add placements.</div>;

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <Card key={o.outletId} className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div>
              <span className="font-semibold text-slate-800">{o.outletName}</span>
              <span className="text-xs text-slate-500 ml-2">
                {o.countryName} · VAT {(o.vatRate * 100).toFixed(1)}%
              </span>
            </div>
            <MediumBadge medium={o.medium} />
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5">Product</th>
                <th className="text-right px-3 py-1.5">Rack</th>
                <th className="text-right px-3 py-1.5">Discounted</th>
                <th className="text-right px-3 py-1.5">Ins.</th>
                <th className="text-right px-3 py-1.5">Sub Total</th>
                <th className="text-right px-3 py-1.5">Agency Comm.</th>
                <th className="text-right px-3 py-1.5">Net Sub Total</th>
                <th className="text-right px-3 py-1.5">VAT</th>
                <th className="text-right px-3 py-1.5">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.placementId} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{l.productName}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.rackRate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.discountedRate)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.insertions}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.subTotal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-500">{money(l.agencyCommission)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.netSubTotal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.vat)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{money(l.grandTotal)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-orange-200 bg-orange-50 font-semibold">
                <td className="px-3 py-1.5" colSpan={6}>
                  Grand Total
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(o.totalNetSubTotal)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(o.totalVat)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(o.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function SummaryView({ campaignId }: { campaignId: number }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getSummary>> | null>(null);
  useEffect(() => {
    api.getSummary(campaignId).then(setSummary);
  }, [campaignId]);
  if (!summary) return <p className="text-slate-400 text-sm p-6">Loading…</p>;

  const Section = ({ title, rows }: { title: string; rows: typeof summary.byMedium }) => (
    <Card className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 text-sm">{title}</div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="text-left px-4 py-2">Category</th>
            <th className="text-right px-4 py-2">Insertions</th>
            <th className="text-right px-4 py-2">Client (XCD)</th>
            <th className="text-right px-4 py-2">Agency (XCD)</th>
            <th className="text-right px-4 py-2">Margin (XCD)</th>
            <th className="text-right px-4 py-2">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">{r.key}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.insertions}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(r.clientTotal)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{money(r.agencyTotal)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{money(r.margin)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(r.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="By Medium" rows={summary.byMedium} />
      <Section title="By Country" rows={summary.byCountry} />
      <div className="lg:col-span-2">
        <Section title="Campaign Total" rows={[summary.grand]} />
      </div>
    </div>
  );
}
