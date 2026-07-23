import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Campaign, Client } from "@shared/types";
import { api } from "../api";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

export default function Dashboard() {
  const nav = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [c, cl] = await Promise.all([api.listCampaigns(), api.listClients()]);
    setCampaigns(c);
    setClients(cl);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const clientName = (id: number) => clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-slate-500 text-sm">Build media schedules and booking orders, then export to Excel.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="subtle" onClick={() => nav("/guided")}>
            Guided Builder
          </Button>
          <Button onClick={() => setOpen(true)}>+ New Campaign</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : campaigns.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          No campaigns yet. Create one to start building schedules.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div onClick={() => nav(`/campaigns/${c.id}`)}>
                <div className="text-xs text-sky-600 font-medium">{clientName(c.clientId)}</div>
                <div className="font-semibold text-slate-800 mt-0.5">{c.name}</div>
                <div className="text-sm text-slate-500 mt-2">{c.period || "No period set"}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {c.startDate} → {c.endDate} · {c.gridMode} · FX {c.fxRate}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-slate-100">
                <a
                  href={api.exportUrl(c.id)}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Media Schedule
                </a>
                <a
                  href={api.bookingOrdersUrl(c.id)}
                  className="text-xs font-medium text-sky-600 hover:text-sky-700"
                >
                  Booking Orders
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewCampaignModal
        open={open}
        clients={clients}
        onClose={() => setOpen(false)}
        onCreated={async (id) => {
          setOpen(false);
          await load();
          nav(`/campaigns/${id}`);
        }}
      />
    </div>
  );
}

function NewCampaignModal({
  open,
  clients,
  onClose,
  onCreated,
}: {
  open: boolean;
  clients: Client[];
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState({
    clientId: 0,
    name: "",
    period: "",
    gridMode: "daily",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10),
    fxRate: 2.65,
    jobBag: "",
    preparedBy: "",
    datePrepared: new Date().toISOString().slice(0, 10),
  });
  const [newClient, setNewClient] = useState("");

  useEffect(() => {
    if (clients.length && !form.clientId) setForm((f) => ({ ...f, clientId: clients[0].id }));
  }, [clients]);

  async function submit() {
    let clientId = form.clientId;
    if (newClient.trim()) {
      const { id } = await api.createClient(newClient.trim());
      clientId = id;
    }
    const { id } = await api.createCampaign({ ...form, clientId, gridMode: form.gridMode as "daily" | "weekly" });
    onCreated(id);
  }

  return (
    <Modal open={open} title="New Campaign" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Campaign Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. RFHL Q2 2026 Financials" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="…or new client">
            <Input value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="New client name" />
          </Field>
        </div>
        <Field label="Placement Period (label)">
          <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="e.g. June - July 2026" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start Date">
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End Date">
            <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label="FX (XCD/USD)">
            <Input type="number" step="0.01" value={form.fxRate} onChange={(e) => setForm({ ...form, fxRate: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Flighting Grid Mode">
          <Select value={form.gridMode} onChange={(e) => setForm({ ...form, gridMode: e.target.value })}>
            <option value="daily">Daily (TV / Radio — weekday columns)</option>
            <option value="weekly">Weekly (Online / Press — WK columns)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Job Bag #">
            <Input value={form.jobBag} onChange={(e) => setForm({ ...form, jobBag: e.target.value })} placeholder="e.g. 8209" />
          </Field>
          <Field label="Prepared By">
            <Input value={form.preparedBy} onChange={(e) => setForm({ ...form, preparedBy: e.target.value })} placeholder="e.g. Casey Osbourne" />
          </Field>
          <Field label="Date Prepared">
            <Input type="date" value={form.datePrepared} onChange={(e) => setForm({ ...form, datePrepared: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!form.name.trim() || (!form.clientId && !newClient.trim())}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
