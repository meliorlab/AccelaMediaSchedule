import { useEffect, useState } from "react";
import type { Country, Medium } from "@shared/types";
import { MEDIA } from "@shared/types";
import { api, money, type OutletWithProducts } from "../api";
import { Button, Card, Field, Input, MediumBadge, Modal, Select } from "../components/ui";

export default function ReferenceData() {
  const [tab, setTab] = useState<"outlets" | "countries">("outlets");
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reference Data</h1>
          <p className="text-slate-500 text-sm">Media houses, rate cards, contacts, and country tax settings.</p>
        </div>
      </div>
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <TabBtn active={tab === "outlets"} onClick={() => setTab("outlets")}>
          Media Houses
        </TabBtn>
        <TabBtn active={tab === "countries"} onClick={() => setTab("countries")}>
          Countries & Tax
        </TabBtn>
      </div>
      {tab === "outlets" ? <OutletsTab /> : <CountriesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Countries ---------------- */
function CountriesTab() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [editing, setEditing] = useState<Country | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setCountries(await api.listCountries());
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
        <span className="font-medium text-slate-700">{countries.length} countries</span>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          + Add Country
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Country</th>
            <th className="text-left px-4 py-2">Currency</th>
            <th className="text-right px-4 py-2">VAT %</th>
            <th className="text-right px-4 py-2">Default Wire Fee</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {countries.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2 font-medium">{c.name}</td>
              <td className="px-4 py-2">{c.currency}</td>
              <td className="px-4 py-2 text-right">{(c.vatRate * 100).toFixed(1)}%</td>
              <td className="px-4 py-2 text-right">{money(c.defaultWireFee)}</td>
              <td className="px-4 py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={async () => { await api.deleteCountry(c.id); load(); }}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CountryModal open={open} country={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />
    </Card>
  );
}

function CountryModal({ open, country, onClose, onSaved }: { open: boolean; country: Country | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", currency: "XCD", vatPct: 0, defaultWireFee: 0 });
  useEffect(() => {
    if (open)
      setForm(
        country
          ? { name: country.name, currency: country.currency, vatPct: country.vatRate * 100, defaultWireFee: country.defaultWireFee }
          : { name: "", currency: "XCD", vatPct: 0, defaultWireFee: 0 },
      );
  }, [open, country]);

  async function save() {
    const payload = { name: form.name, currency: form.currency, vatRate: form.vatPct / 100, defaultWireFee: form.defaultWireFee };
    if (country) await api.updateCountry(country.id, payload);
    else await api.createCountry(payload);
    onSaved();
  }
  return (
    <Modal open={open} title={country ? "Edit Country" : "Add Country"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency">
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label="VAT %">
            <Input type="number" step="0.1" value={form.vatPct} onChange={(e) => setForm({ ...form, vatPct: Number(e.target.value) })} />
          </Field>
          <Field label="Wire Fee">
            <Input type="number" step="1" value={form.defaultWireFee} onChange={(e) => setForm({ ...form, defaultWireFee: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.name.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Outlets ---------------- */
function OutletsTab() {
  const [outlets, setOutlets] = useState<OutletWithProducts[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [filter, setFilter] = useState<Medium | "All">("All");
  const [editing, setEditing] = useState<OutletWithProducts | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const [o, c] = await Promise.all([api.listOutlets(), api.listCountries()]);
    setOutlets(o);
    setCountries(c);
  }
  useEffect(() => {
    load();
  }, []);

  const countryName = (id: number) => countries.find((c) => c.id === id)?.name ?? "";
  const shown = outlets.filter((o) => filter === "All" || o.medium === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["All", ...MEDIA] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m as Medium | "All")}
              className={`px-3 py-1.5 rounded-md text-sm ${filter === m ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          + Add Media House
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800">{o.name}</div>
                <div className="text-xs text-slate-500">{countryName(o.countryId)}</div>
              </div>
              <MediumBadge medium={o.medium} />
            </div>
            <div className="text-xs text-slate-500 mt-2 space-y-0.5">
              {o.popularSlots && <div>🕑 {o.popularSlots}</div>}
              {o.email && <div className="truncate">✉ {o.email}</div>}
              {o.phone && <div>☎ {o.phone}</div>}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="text-xs font-medium text-slate-400 mb-1">{o.products.length} rate(s)</div>
              {o.products.slice(0, 3).map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-slate-600">
                  <span className="truncate mr-2">{p.name}</span>
                  <span className="tabular-nums">{money(p.rackRate)}</span>
                </div>
              ))}
              {(o.medium === "TV" || o.medium === "Radio") && o.dayparts.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-medium text-slate-400 mb-1">{o.dayparts.length} daypart(s)</div>
                  {o.dayparts.slice(0, 4).map((d) => (
                    <div key={d.id} className="flex justify-between text-[11px] text-slate-500">
                      <span className="truncate mr-2">{d.name}</span>
                      <span className="truncate text-slate-400">{d.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-1 mt-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(o); setOpen(true); }}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={async () => { await api.deleteOutlet(o.id); load(); }}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <OutletModal
        open={open}
        outlet={editing}
        countries={countries}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); load(); }}
      />
    </div>
  );
}

function OutletModal({
  open,
  outlet,
  countries,
  onClose,
  onSaved,
}: {
  open: boolean;
  outlet: OutletWithProducts | null;
  countries: Country[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ countryId: 0, name: "", medium: "TV" as Medium, email: "", phone: "", popularSlots: "" });
  const [products, setProducts] = useState<{ id?: number; name: string; rackRate: number; discountPct: number; agencyCommPct: number }[]>([]);
  const [dayparts, setDayparts] = useState<{ id?: number; name: string; time: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    if (outlet) {
      setForm({ countryId: outlet.countryId, name: outlet.name, medium: outlet.medium, email: outlet.email, phone: outlet.phone, popularSlots: outlet.popularSlots });
      setProducts(outlet.products.map((p) => ({ id: p.id, name: p.name, rackRate: p.rackRate, discountPct: p.discountPct * 100, agencyCommPct: p.agencyCommPct * 100 })));
      setDayparts(outlet.dayparts.map((d) => ({ id: d.id, name: d.name, time: d.time })));
    } else {
      setForm({ countryId: countries[0]?.id ?? 0, name: "", medium: "TV", email: "", phone: "", popularSlots: "" });
      setProducts([]);
      setDayparts([]);
    }
  }, [open, outlet, countries]);

  async function save() {
    let outletId = outlet?.id;
    if (outlet) {
      await api.updateOutlet(outlet.id, form);
    } else {
      const { id } = await api.createOutlet(form);
      outletId = id;
    }
    if (!outletId) return;

    // sync products
    const existingIds = new Set((outlet?.products ?? []).map((p) => p.id));
    const keptIds = new Set(products.filter((p) => p.id).map((p) => p.id!));
    for (const id of existingIds) if (!keptIds.has(id)) await api.deleteProduct(id);
    for (const p of products) {
      const payload = { outletId, name: p.name, rackRate: p.rackRate, discountPct: p.discountPct / 100, agencyCommPct: p.agencyCommPct / 100 };
      if (p.id) await api.updateProduct(p.id, payload);
      else await api.createProduct(payload);
    }

    // sync dayparts
    const existingDp = new Set((outlet?.dayparts ?? []).map((d) => d.id));
    const keptDp = new Set(dayparts.filter((d) => d.id).map((d) => d.id!));
    for (const id of existingDp) if (!keptDp.has(id)) await api.deleteDaypart(id);
    for (const d of dayparts) {
      const payload = { outletId, name: d.name, time: d.time };
      if (d.id) await api.updateDaypart(d.id, payload);
      else await api.createDaypart(payload);
    }
    onSaved();
  }

  return (
    <Modal open={open} title={outlet ? "Edit Media House" : "Add Media House"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Country">
            <Select value={form.countryId} onChange={(e) => setForm({ ...form, countryId: Number(e.target.value) })}>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Medium">
            <Select value={form.medium} onChange={(e) => setForm({ ...form, medium: e.target.value as Medium })}>
              {MEDIA.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Popular Slots / Edition">
            <Input value={form.popularSlots} onChange={(e) => setForm({ ...form, popularSlots: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500">Rate Card / Products</span>
            <Button size="sm" variant="subtle" onClick={() => setProducts([...products, { name: "", rackRate: 0, discountPct: 15, agencyCommPct: 15 }])}>
              + Add Product
            </Button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_90px_80px_80px_28px] gap-2 text-[11px] text-slate-400 px-1">
              <span>Product</span>
              <span>Rack Rate</span>
              <span>Disc %</span>
              <span>Comm %</span>
              <span></span>
            </div>
            {products.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_80px_80px_28px] gap-2 items-center">
                <Input value={p.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="e.g. 30 Sec" />
                <Input type="number" value={p.rackRate} onChange={(e) => upd(i, { rackRate: Number(e.target.value) })} />
                <Input type="number" value={p.discountPct} onChange={(e) => upd(i, { discountPct: Number(e.target.value) })} />
                <Input type="number" value={p.agencyCommPct} onChange={(e) => upd(i, { agencyCommPct: Number(e.target.value) })} />
                <button className="text-red-500 hover:text-red-700" onClick={() => setProducts(products.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500">Dayparts / Time Bands</span>
            <Button size="sm" variant="subtle" onClick={() => setDayparts([...dayparts, { name: "", time: "" }])}>
              + Add Daypart
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Each media house can have its own time bands (e.g. Peak-Time = 7pm - 8pm). These appear as options when scheduling.
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_28px] gap-2 text-[11px] text-slate-400 px-1">
              <span>Daypart name</span>
              <span>Time</span>
              <span></span>
            </div>
            {dayparts.length === 0 && <div className="text-xs text-slate-400 px-1 py-1">No dayparts yet.</div>}
            {dayparts.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                <Input value={d.name} onChange={(e) => updDp(i, { name: e.target.value })} placeholder="e.g. Peak-Time" />
                <Input value={d.time} onChange={(e) => updDp(i, { time: e.target.value })} placeholder="e.g. 7:00pm - 8:00pm" />
                <button className="text-red-500 hover:text-red-700" onClick={() => setDayparts(dayparts.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.name.trim() || !form.countryId}>Save</Button>
        </div>
      </div>
    </Modal>
  );

  function upd(i: number, patch: Partial<(typeof products)[number]>) {
    setProducts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function updDp(i: number, patch: Partial<(typeof dayparts)[number]>) {
    setDayparts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
}
