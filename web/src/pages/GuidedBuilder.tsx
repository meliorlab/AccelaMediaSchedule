import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Client, Country, Medium } from "@shared/types";
import { buildPeriods } from "@shared/calc";
import { api, type OutletWithProducts } from "../api";
import { Button, Card } from "../components/ui";

interface FreqPreset {
  id: string;
  label: string;
  days: number[]; // 0=Sun..6=Sat
  everyN: number;
  spots: number;
}

const FREQUENCIES: FreqPreset[] = [
  { id: "daily", label: "every day", days: [0, 1, 2, 3, 4, 5, 6], everyN: 1, spots: 1 },
  { id: "weekdays", label: "on weekdays (Mon-Fri)", days: [1, 2, 3, 4, 5], everyN: 1, spots: 1 },
  { id: "3xweek", label: "3x a week (Mon, Wed, Fri)", days: [1, 3, 5], everyN: 1, spots: 1 },
  { id: "2xweek", label: "2x a week (Tue, Thu)", days: [2, 4], everyN: 1, spots: 1 },
  { id: "2xdaily", label: "twice every weekday", days: [1, 2, 3, 4, 5], everyN: 1, spots: 2 },
  { id: "weeklyMon", label: "weekly (Mondays)", days: [1], everyN: 1, spots: 1 },
  { id: "weeklyFri", label: "weekly (Fridays)", days: [5], everyN: 1, spots: 1 },
  { id: "biweeklyFri", label: "every 2 weeks (Fridays)", days: [5], everyN: 2, spots: 1 },
];

const MEDIA_OPTIONS: { value: Medium; label: string; heading: string; hasTimes: boolean }[] = [
  { value: "TV", label: "TV", heading: "TV Stations", hasTimes: true },
  { value: "Radio", label: "Radio", heading: "Radio Stations", hasTimes: true },
  { value: "Press", label: "Print", heading: "Print Publications", hasTimes: false },
  { value: "Online", label: "Online", heading: "Online Publications", hasTimes: false },
];

interface MediumConfig {
  outletIds: number[];
  frequency: string;
  times: string[];
}

const emptyConfig = (): MediumConfig => ({ outletIds: [], frequency: "weekdays", times: [] });

export default function GuidedBuilder() {
  const nav = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [outlets, setOutlets] = useState<OutletWithProducts[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [busy, setBusy] = useState(false);

  const [clientId, setClientId] = useState<number | "new">(0);
  const [newClient, setNewClient] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10));
  const [selectedMedia, setSelectedMedia] = useState<Medium[]>(["TV", "Radio"]);
  const [configs, setConfigs] = useState<Record<Medium, MediumConfig>>({
    TV: emptyConfig(),
    Radio: emptyConfig(),
    Press: emptyConfig(),
    Online: emptyConfig(),
  });

  useEffect(() => {
    Promise.all([api.listClients(), api.listOutlets(), api.listCountries()]).then(([c, o, ct]) => {
      setClients(c);
      setOutlets(o);
      setCountries(ct);
      if (c.length) setClientId(c[0].id);
    });
  }, []);

  const countryName = useMemo(() => new Map(countries.map((c) => [c.id, c.name])), [countries]);
  const outletsById = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const outletsByMedium = useMemo(() => {
    const m = new Map<Medium, OutletWithProducts[]>();
    for (const o of outlets) {
      if (!m.has(o.medium)) m.set(o.medium, []);
      m.get(o.medium)!.push(o);
    }
    return m;
  }, [outlets]);

  const toggleMedium = (m: Medium) =>
    setSelectedMedia((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const setConfig = (m: Medium, patch: Partial<MediumConfig>) =>
    setConfigs((prev) => ({ ...prev, [m]: { ...prev[m], ...patch } }));

  // Available dayparts for a medium = union across selected outlets (fallback: all outlets of medium)
  const availableDayparts = (m: Medium): string[] => {
    const cfg = configs[m];
    const pool = cfg.outletIds.length
      ? cfg.outletIds.map((id) => outletsById.get(id)).filter(Boolean)
      : outletsByMedium.get(m) ?? [];
    const names = new Set<string>();
    for (const o of pool) o?.dayparts.forEach((d) => names.add(d.name));
    return [...names];
  };

  const periods = useMemo(() => buildPeriods(startDate, endDate, "daily"), [startDate, endDate]);

  const preview = useMemo(() => {
    let placements = 0;
    let spots = 0;
    for (const m of selectedMedia) {
      const cfg = configs[m];
      const freq = FREQUENCIES.find((f) => f.id === cfg.frequency)!;
      const dayCount = countPatternDays(periods, freq);
      const opt = MEDIA_OPTIONS.find((o) => o.value === m)!;
      const timeCount = opt.hasTimes && cfg.times.length ? cfg.times.length : 1;
      const p = cfg.outletIds.length * timeCount;
      placements += p;
      spots += p * dayCount * freq.spots;
    }
    return { placements, spots };
  }, [selectedMedia, configs, periods]);

  const canCreate =
    (clientId === "new" ? newClient.trim().length > 0 : Number(clientId) > 0) &&
    selectedMedia.some((m) => configs[m].outletIds.length > 0) &&
    periods.length > 0;

  async function create() {
    setBusy(true);
    try {
      let resolvedClientId = Number(clientId);
      if (clientId === "new") {
        const { id } = await api.createClient(newClient.trim());
        resolvedClientId = id;
      }
      const clientName = clientId === "new" ? newClient.trim() : clients.find((c) => c.id === resolvedClientId)?.name ?? "Client";
      const period = `${startDate} to ${endDate}`;
      const { id: campaignId } = await api.createCampaign({
        clientId: resolvedClientId,
        name: `${clientName} - Media Schedule`,
        period,
        gridMode: "daily",
        startDate,
        endDate,
        fxRate: 2.65,
      });

      for (const m of selectedMedia) {
        const cfg = configs[m];
        const freq = FREQUENCIES.find((f) => f.id === cfg.frequency)!;
        const opt = MEDIA_OPTIONS.find((o) => o.value === m)!;
        const daypartNames = opt.hasTimes && cfg.times.length ? cfg.times : [""];

        for (const outletId of cfg.outletIds) {
          const outlet = outletsById.get(outletId);
          if (!outlet) continue;
          for (const dpName of daypartNames) {
            const dp = outlet.dayparts.find((d) => d.name === dpName);
            const productId = outlet.products[0]?.id ?? null;
            const { id: placementId } = await api.createPlacement(campaignId, {
              outletId,
              productId,
              daypart: dpName,
              timeSlot: dp?.time,
            });
            const cells = periods
              .filter((per) => matchesPattern(per.key, periods[0].key, freq))
              .map((per) => ({ periodKey: per.key, count: freq.spots }));
            if (cells.length) await api.setFlightsBulk(placementId, cells, true);
          }
        }
      }
      nav(`/campaigns/${campaignId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Guided Schedule Builder</h1>
        <p className="text-slate-500 text-sm">Fill in the blanks and we'll build the schedule, placements and flighting for you.</p>
      </div>

      <div className="space-y-4">
        {/* Intro bubble */}
        <Bubble>
          <p className="leading-8 text-[15px] text-slate-700">
            I would like to create a media schedule for{" "}
            <InlineControl>
              <select
                className="inline-select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value === "new" ? "new" : Number(e.target.value))}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="new">+ New client…</option>
              </select>
            </InlineControl>
            {clientId === "new" && (
              <InlineControl>
                <input
                  className="inline-input"
                  placeholder="New client name"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                />
              </InlineControl>
            )}{" "}
            running from{" "}
            <InlineControl>
              <input type="date" className="inline-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </InlineControl>{" "}
            to{" "}
            <InlineControl>
              <input type="date" className="inline-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </InlineControl>
            , which includes:
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {MEDIA_OPTIONS.map((opt) => {
              const active = selectedMedia.includes(opt.value);
              const count = outletsByMedium.get(opt.value)?.length ?? 0;
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleMedium(opt.value)}
                  disabled={count === 0}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50 disabled:opacity-40"
                  }`}
                  title={count === 0 ? "No media houses of this type yet" : ""}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Bubble>

        {/* Per-medium bubbles */}
        {MEDIA_OPTIONS.filter((o) => selectedMedia.includes(o.value)).map((opt) => {
          const m = opt.value;
          const cfg = configs[m];
          const list = outletsByMedium.get(m) ?? [];
          const dayparts = availableDayparts(m);
          return (
            <Bubble key={m}>
              <div className="font-semibold text-slate-800 mb-2">{opt.heading}</div>
              <p className="text-[15px] text-slate-700 leading-8">
                I need the ad to show on these {opt.label.toLowerCase()} {m === "Press" || m === "Online" ? "outlets" : "stations"}:
              </p>
              <ChipMultiSelect
                items={list.map((o) => ({ id: o.id, label: `${o.name} · ${countryName.get(o.countryId) ?? ""}`.trim() }))}
                selected={cfg.outletIds}
                onToggle={(id) => {
                  const oid = Number(id);
                  setConfig(m, {
                    outletIds: cfg.outletIds.includes(oid) ? cfg.outletIds.filter((x) => x !== oid) : [...cfg.outletIds, oid],
                  });
                }}
              />
              <p className="text-[15px] text-slate-700 leading-8 mt-3">
                running{" "}
                <InlineControl>
                  <select className="inline-select" value={cfg.frequency} onChange={(e) => setConfig(m, { frequency: e.target.value })}>
                    {FREQUENCIES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </InlineControl>
                {opt.hasTimes && (
                  <>
                    {" "}
                    during these times:
                  </>
                )}
              </p>
              {opt.hasTimes && (
                <>
                  {dayparts.length ? (
                    <ChipMultiSelect
                      items={dayparts.map((d) => ({ id: d, label: d }))}
                      selected={cfg.times}
                      onToggle={(id) =>
                        setConfig(m, {
                          times: cfg.times.includes(id as string)
                            ? cfg.times.filter((x) => x !== id)
                            : [...cfg.times, id as string],
                        })
                      }
                    />
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      No dayparts defined for the selected stations. Add them in Reference Data, or leave blank and set times later.
                    </p>
                  )}
                </>
              )}
            </Bubble>
          );
        })}

        {/* Summary bubble */}
        <Bubble accent>
          <p className="text-[15px] text-slate-700">
            This will create{" "}
            <span className="font-semibold text-slate-900">{preview.placements}</span> placement(s) with about{" "}
            <span className="font-semibold text-slate-900">{preview.spots}</span> spot(s) across{" "}
            <span className="font-semibold text-slate-900">{periods.length}</span> days. You can fine-tune everything afterwards.
          </p>
          <div className="flex justify-end mt-3">
            <Button onClick={create} disabled={!canCreate || busy}>
              {busy ? "Building…" : "Build schedule →"}
            </Button>
          </div>
        </Bubble>
      </div>

      <style>{`
        .inline-select, .inline-input {
          border: none;
          border-bottom: 2px solid #38bdf8;
          background: #f0f9ff;
          border-radius: 6px 6px 0 0;
          padding: 2px 8px;
          font-size: 14px;
          font-weight: 600;
          color: #0369a1;
          outline: none;
          margin: 0 2px;
        }
        .inline-select:focus, .inline-input:focus { background: #e0f2fe; }
      `}</style>
    </div>
  );
}

function InlineControl({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-baseline">{children}</span>;
}

function Bubble({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-full grid place-items-center text-white text-sm font-bold shrink-0 ${accent ? "bg-emerald-500" : "bg-slate-800"}`}>
        A
      </div>
      <Card className={`flex-1 p-4 ${accent ? "border-emerald-200 bg-emerald-50/40" : ""}`}>{children}</Card>
    </div>
  );
}

function ChipMultiSelect({
  items,
  selected,
  onToggle,
}: {
  items: { id: number | string; label: string }[];
  selected: (number | string)[];
  onToggle: (id: number | string) => void;
}) {
  if (items.length === 0) return <p className="text-xs text-slate-400 mt-1">Nothing available.</p>;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((it) => {
        const active = selected.includes(it.id);
        return (
          <button
            key={it.id}
            onClick={() => onToggle(it.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              active ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {active ? "✓ " : ""}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function countPatternDays(periods: { key: string }[], freq: FreqPreset): number {
  if (!periods.length) return 0;
  return periods.filter((p) => matchesPattern(p.key, periods[0].key, freq)).length;
}

function matchesPattern(key: string, startKey: string, freq: FreqPreset): boolean {
  const d = new Date(key + "T00:00:00");
  const start = new Date(startKey + "T00:00:00");
  const weekIndex = Math.floor((d.getTime() - start.getTime()) / (7 * 864e5));
  return freq.days.includes(d.getDay()) && weekIndex % freq.everyN === 0;
}
