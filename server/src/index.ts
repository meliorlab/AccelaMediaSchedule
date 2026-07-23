import express from "express";
import cors from "cors";
import { queries } from "./db.js";
import { buildBookingOrders, buildSummary, getCampaignBundle } from "./compute.js";
import { buildCampaignWorkbook, buildBookingOrdersWorkbook } from "./export/excel.js";
import { agencyCostFromClient } from "@msb/shared";
import type { Outlet, Placement } from "@msb/shared";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 4000;

function wrap(fn: (req: express.Request, res: express.Response) => unknown) {
  return async (req: express.Request, res: express.Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
    }
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- Clients ----
app.get("/api/clients", wrap((_req, res) => res.json(queries.listClients())));
app.post("/api/clients", wrap((req, res) => {
  const id = queries.createClient(String(req.body.name || "Untitled Client"));
  res.json({ id });
}));
app.delete("/api/clients/:id", wrap((req, res) => {
  queries.deleteClient(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Countries ----
app.get("/api/countries", wrap((_req, res) => res.json(queries.listCountries())));
app.post("/api/countries", wrap((req, res) => {
  const b = req.body;
  const id = queries.createCountry({
    name: b.name,
    currency: b.currency || "XCD",
    vatRate: Number(b.vatRate) || 0,
    defaultWireFee: Number(b.defaultWireFee) || 0,
  });
  res.json({ id });
}));
app.put("/api/countries/:id", wrap((req, res) => {
  const b = req.body;
  queries.updateCountry(Number(req.params.id), {
    name: b.name,
    currency: b.currency || "XCD",
    vatRate: Number(b.vatRate) || 0,
    defaultWireFee: Number(b.defaultWireFee) || 0,
  });
  res.json({ ok: true });
}));
app.delete("/api/countries/:id", wrap((req, res) => {
  queries.deleteCountry(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Outlets (with products) ----
app.get("/api/outlets", wrap((_req, res) => {
  const outlets = queries.listOutlets();
  const withProducts = outlets.map((o) => ({
    ...o,
    products: queries.listProductsForOutlet(o.id),
    dayparts: queries.listDaypartsForOutlet(o.id),
  }));
  res.json(withProducts);
}));
app.post("/api/outlets", wrap((req, res) => {
  const b = req.body as Omit<Outlet, "id">;
  const id = queries.createOutlet({
    countryId: Number(b.countryId),
    name: b.name,
    medium: b.medium,
    email: b.email || "",
    phone: b.phone || "",
    popularSlots: b.popularSlots || "",
  });
  res.json({ id });
}));
app.put("/api/outlets/:id", wrap((req, res) => {
  const b = req.body as Omit<Outlet, "id">;
  queries.updateOutlet(Number(req.params.id), {
    countryId: Number(b.countryId),
    name: b.name,
    medium: b.medium,
    email: b.email || "",
    phone: b.phone || "",
    popularSlots: b.popularSlots || "",
  });
  res.json({ ok: true });
}));
app.delete("/api/outlets/:id", wrap((req, res) => {
  queries.deleteOutlet(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Products ----
app.post("/api/products", wrap((req, res) => {
  const b = req.body;
  const id = queries.createProduct({
    outletId: Number(b.outletId),
    name: b.name,
    rackRate: Number(b.rackRate) || 0,
    discountPct: Number(b.discountPct) || 0,
    agencyCommPct: Number(b.agencyCommPct) || 0,
  });
  res.json({ id });
}));
app.put("/api/products/:id", wrap((req, res) => {
  const b = req.body;
  queries.updateProduct(Number(req.params.id), {
    outletId: Number(b.outletId),
    name: b.name,
    rackRate: Number(b.rackRate) || 0,
    discountPct: Number(b.discountPct) || 0,
    agencyCommPct: Number(b.agencyCommPct) || 0,
  });
  res.json({ ok: true });
}));
app.delete("/api/products/:id", wrap((req, res) => {
  queries.deleteProduct(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Dayparts ----
app.post("/api/dayparts", wrap((req, res) => {
  const b = req.body;
  const id = queries.createDaypart({ outletId: Number(b.outletId), name: b.name || "", time: b.time || "" });
  res.json({ id });
}));
app.put("/api/dayparts/:id", wrap((req, res) => {
  const b = req.body;
  queries.updateDaypart(Number(req.params.id), { outletId: Number(b.outletId), name: b.name || "", time: b.time || "" });
  res.json({ ok: true });
}));
app.delete("/api/dayparts/:id", wrap((req, res) => {
  queries.deleteDaypart(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Campaigns ----
app.get("/api/campaigns", wrap((_req, res) => res.json(queries.listCampaigns())));
app.get("/api/campaigns/:id", wrap((req, res) => {
  const c = queries.getCampaign(Number(req.params.id));
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
}));
app.post("/api/campaigns", wrap((req, res) => {
  const b = req.body;
  const id = queries.createCampaign({
    clientId: Number(b.clientId),
    name: b.name || "New Campaign",
    period: b.period || "",
    gridMode: b.gridMode === "weekly" ? "weekly" : "daily",
    startDate: b.startDate,
    endDate: b.endDate,
    fxRate: Number(b.fxRate) || 2.65,
    notes: b.notes || "",
    jobBag: b.jobBag || "",
    preparedBy: b.preparedBy || "",
    datePrepared: b.datePrepared || "",
    placementLength: b.placementLength || "",
  });
  res.json({ id });
}));
app.put("/api/campaigns/:id", wrap((req, res) => {
  const b = req.body;
  queries.updateCampaign(Number(req.params.id), {
    clientId: Number(b.clientId),
    name: b.name,
    period: b.period || "",
    gridMode: b.gridMode === "weekly" ? "weekly" : "daily",
    startDate: b.startDate,
    endDate: b.endDate,
    fxRate: Number(b.fxRate) || 2.65,
    notes: b.notes || "",
    jobBag: b.jobBag || "",
    preparedBy: b.preparedBy || "",
    datePrepared: b.datePrepared || "",
    placementLength: b.placementLength || "",
  });
  res.json({ ok: true });
}));
app.delete("/api/campaigns/:id", wrap((req, res) => {
  queries.deleteCampaign(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Campaign composite views ----
app.get("/api/campaigns/:id/bundle", wrap((req, res) => {
  const bundle = getCampaignBundle(Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: "Not found" });
  res.json(bundle);
}));
app.get("/api/campaigns/:id/booking-orders", wrap((req, res) => {
  const bundle = getCampaignBundle(Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: "Not found" });
  res.json(buildBookingOrders(bundle));
}));
app.get("/api/campaigns/:id/summary", wrap((req, res) => {
  const bundle = getCampaignBundle(Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: "Not found" });
  res.json(buildSummary(bundle));
}));

// ---- Placements ----
app.post("/api/campaigns/:id/placements", wrap((req, res) => {
  const campaignId = Number(req.params.id);
  const b = req.body;
  const outlet = queries.getOutlet(Number(b.outletId));
  if (!outlet) return res.status(400).json({ error: "Invalid outlet" });
  const product = b.productId ? queries.getProduct(Number(b.productId)) : undefined;
  const country = queries.getCountry(outlet.countryId);

  const clientUnitCost =
    b.clientUnitCost != null ? Number(b.clientUnitCost) : product ? product.rackRate : 0;
  const agencyUnitCost =
    b.agencyUnitCost != null
      ? Number(b.agencyUnitCost)
      : agencyCostFromClient(clientUnitCost, product?.agencyCommPct ?? 0.15);

  const count = queries.listPlacements(campaignId).length;
  const id = queries.createPlacement({
    campaignId,
    outletId: outlet.id,
    productId: product?.id ?? null,
    countryId: outlet.countryId,
    medium: outlet.medium,
    daypart: b.daypart ?? "",
    timeSlot: b.timeSlot ?? outlet.popularSlots ?? "",
    clientUnitCost,
    agencyUnitCost,
    wireFee: b.wireFee != null ? Number(b.wireFee) : country?.defaultWireFee ?? 0,
    sortOrder: count,
    notes: b.notes || "",
  });
  res.json({ id });
}));
app.put("/api/placements/:id", wrap((req, res) => {
  const id = Number(req.params.id);
  const existing = queries.getPlacement(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const b = req.body as Partial<Placement>;
  const merged: Omit<Placement, "id"> = {
    campaignId: existing.campaignId,
    outletId: b.outletId != null ? Number(b.outletId) : existing.outletId,
    productId: b.productId !== undefined ? (b.productId == null ? null : Number(b.productId)) : existing.productId,
    countryId: b.countryId != null ? Number(b.countryId) : existing.countryId,
    medium: b.medium ?? existing.medium,
    daypart: b.daypart ?? existing.daypart,
    timeSlot: b.timeSlot ?? existing.timeSlot,
    clientUnitCost: b.clientUnitCost != null ? Number(b.clientUnitCost) : existing.clientUnitCost,
    agencyUnitCost: b.agencyUnitCost != null ? Number(b.agencyUnitCost) : existing.agencyUnitCost,
    wireFee: b.wireFee != null ? Number(b.wireFee) : existing.wireFee,
    sortOrder: b.sortOrder != null ? Number(b.sortOrder) : existing.sortOrder,
    notes: b.notes ?? existing.notes,
  };
  queries.updatePlacement(id, merged);
  res.json({ ok: true });
}));
app.delete("/api/placements/:id", wrap((req, res) => {
  queries.deletePlacement(Number(req.params.id));
  res.json({ ok: true });
}));

// ---- Flight cells ----
app.put("/api/placements/:id/flights", wrap((req, res) => {
  const placementId = Number(req.params.id);
  const { periodKey, count } = req.body;
  queries.upsertFlight(placementId, String(periodKey), Number(count) || 0);
  res.json({ ok: true });
}));
app.put("/api/placements/:id/flights/bulk", wrap((req, res) => {
  const placementId = Number(req.params.id);
  const cells = (Array.isArray(req.body.cells) ? req.body.cells : []).map((c: { periodKey: unknown; count: unknown }) => ({
    periodKey: String(c.periodKey),
    count: Number(c.count) || 0,
  }));
  queries.upsertFlightsBulk(placementId, cells, Boolean(req.body.clearFirst));
  res.json({ ok: true });
}));

// ---- Excel export ----
app.get("/api/campaigns/:id/export.xlsx", wrap(async (req, res) => {
  const campaignId = Number(req.params.id);
  const campaign = queries.getCampaign(campaignId);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  const buffer = await buildCampaignWorkbook(campaignId);
  const safe = campaign.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "campaign";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safe} - Media Schedule.xlsx"`);
  res.send(Buffer.from(buffer));
}));

app.get("/api/campaigns/:id/booking-orders.xlsx", wrap(async (req, res) => {
  const campaignId = Number(req.params.id);
  const campaign = queries.getCampaign(campaignId);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  const buffer = await buildBookingOrdersWorkbook(campaignId);
  const safe = campaign.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "campaign";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safe} - Booking Orders.xlsx"`);
  res.send(Buffer.from(buffer));
}));

app.listen(PORT, () => {
  console.log(`Media Schedule Builder API running at http://localhost:${PORT}`);
});
