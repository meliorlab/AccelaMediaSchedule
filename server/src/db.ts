import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { seedCountries, seedOutlets, seedClients, defaultDayparts } from "@msb/shared";
import type {
  Campaign,
  Client,
  Country,
  Daypart,
  FlightCell,
  Outlet,
  Placement,
  Product,
} from "@msb/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Allow overriding the data location (e.g. a mounted persistent disk on Render/Railway/Fly)
const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, "media-schedules.db"));

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XCD',
  vatRate REAL NOT NULL DEFAULT 0,
  defaultWireFee REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outlets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  countryId INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  medium TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  popularSlots TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outletId INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rackRate REAL NOT NULL DEFAULT 0,
  discountPct REAL NOT NULL DEFAULT 0,
  agencyCommPct REAL NOT NULL DEFAULT 0.15
);

CREATE TABLE IF NOT EXISTS dayparts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outletId INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clientId INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  gridMode TEXT NOT NULL DEFAULT 'daily',
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  fxRate REAL NOT NULL DEFAULT 2.65,
  notes TEXT NOT NULL DEFAULT '',
  jobBag TEXT NOT NULL DEFAULT '',
  preparedBy TEXT NOT NULL DEFAULT '',
  datePrepared TEXT NOT NULL DEFAULT '',
  placementLength TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaignId INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  outletId INTEGER NOT NULL REFERENCES outlets(id),
  productId INTEGER REFERENCES products(id),
  countryId INTEGER NOT NULL REFERENCES countries(id),
  medium TEXT NOT NULL,
  daypart TEXT NOT NULL DEFAULT '',
  timeSlot TEXT NOT NULL DEFAULT '',
  clientUnitCost REAL NOT NULL DEFAULT 0,
  agencyUnitCost REAL NOT NULL DEFAULT 0,
  wireFee REAL NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS flight_cells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placementId INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  periodKey TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(placementId, periodKey)
);
`);

// ---- Lightweight migrations (add columns to existing DBs) ----
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("placements", "daypart", "daypart TEXT NOT NULL DEFAULT ''");
ensureColumn("campaigns", "jobBag", "jobBag TEXT NOT NULL DEFAULT ''");
ensureColumn("campaigns", "preparedBy", "preparedBy TEXT NOT NULL DEFAULT ''");
ensureColumn("campaigns", "datePrepared", "datePrepared TEXT NOT NULL DEFAULT ''");
ensureColumn("campaigns", "placementLength", "placementLength TEXT NOT NULL DEFAULT ''");

// ---- Seed on first run ----
function seedIfEmpty() {
  const countryCount = (db.prepare("SELECT COUNT(*) AS c FROM countries").get() as { c: number }).c;
  if (countryCount > 0) return;

  const insCountry = db.prepare(
    "INSERT INTO countries (name, currency, vatRate, defaultWireFee) VALUES (?, ?, ?, ?)",
  );
  const insOutlet = db.prepare(
    "INSERT INTO outlets (countryId, name, medium, email, phone, popularSlots) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insProduct = db.prepare(
    "INSERT INTO products (outletId, name, rackRate, discountPct, agencyCommPct) VALUES (?, ?, ?, ?, ?)",
  );
  const insDaypart = db.prepare("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)");
  const insClient = db.prepare("INSERT INTO clients (name) VALUES (?)");

  const countryIdByName = new Map<string, number>();
  for (const c of seedCountries) {
    const info = insCountry.run(c.name, c.currency, c.vatRate, c.defaultWireFee);
    countryIdByName.set(c.name, Number(info.lastInsertRowid));
  }
  for (const o of seedOutlets) {
    const cid = countryIdByName.get(o.country);
    if (!cid) continue;
    const info = insOutlet.run(cid, o.name, o.medium, o.email, o.phone, o.popularSlots);
    const oid = Number(info.lastInsertRowid);
    for (const p of o.products) {
      insProduct.run(oid, p.name, p.rackRate, p.discountPct, p.agencyCommPct);
    }
    for (const d of defaultDayparts(o.medium)) {
      insDaypart.run(oid, d.name, d.time);
    }
  }
  for (const name of seedClients) insClient.run(name);
}
seedIfEmpty();

// Seed dayparts for databases created before dayparts existed.
function seedDaypartsIfEmpty() {
  const dpCount = (db.prepare("SELECT COUNT(*) AS c FROM dayparts").get() as { c: number }).c;
  if (dpCount > 0) return;
  const outlets = db.prepare("SELECT id, medium FROM outlets").all() as unknown as { id: number; medium: Outlet["medium"] }[];
  const insDaypart = db.prepare("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)");
  for (const o of outlets) {
    for (const d of defaultDayparts(o.medium)) insDaypart.run(o.id, d.name, d.time);
  }
}
seedDaypartsIfEmpty();

// ---- Typed query helpers ----
export const queries = {
  // clients
  listClients: () => db.prepare("SELECT * FROM clients ORDER BY name").all() as unknown as Client[],
  createClient: (name: string) =>
    Number(db.prepare("INSERT INTO clients (name) VALUES (?)").run(name).lastInsertRowid),
  deleteClient: (id: number) => db.prepare("DELETE FROM clients WHERE id = ?").run(id),

  // countries
  listCountries: () => db.prepare("SELECT * FROM countries ORDER BY name").all() as unknown as Country[],
  getCountry: (id: number) => db.prepare("SELECT * FROM countries WHERE id = ?").get(id) as Country | undefined,
  createCountry: (c: Omit<Country, "id">) =>
    Number(
      db
        .prepare("INSERT INTO countries (name, currency, vatRate, defaultWireFee) VALUES (?, ?, ?, ?)")
        .run(c.name, c.currency, c.vatRate, c.defaultWireFee).lastInsertRowid,
    ),
  updateCountry: (id: number, c: Omit<Country, "id">) =>
    db
      .prepare("UPDATE countries SET name=?, currency=?, vatRate=?, defaultWireFee=? WHERE id=?")
      .run(c.name, c.currency, c.vatRate, c.defaultWireFee, id),
  deleteCountry: (id: number) => db.prepare("DELETE FROM countries WHERE id = ?").run(id),

  // outlets
  listOutlets: () => db.prepare("SELECT * FROM outlets ORDER BY name").all() as unknown as Outlet[],
  getOutlet: (id: number) => db.prepare("SELECT * FROM outlets WHERE id = ?").get(id) as Outlet | undefined,
  createOutlet: (o: Omit<Outlet, "id">) =>
    Number(
      db
        .prepare(
          "INSERT INTO outlets (countryId, name, medium, email, phone, popularSlots) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(o.countryId, o.name, o.medium, o.email, o.phone, o.popularSlots).lastInsertRowid,
    ),
  updateOutlet: (id: number, o: Omit<Outlet, "id">) =>
    db
      .prepare("UPDATE outlets SET countryId=?, name=?, medium=?, email=?, phone=?, popularSlots=? WHERE id=?")
      .run(o.countryId, o.name, o.medium, o.email, o.phone, o.popularSlots, id),
  deleteOutlet: (id: number) => db.prepare("DELETE FROM outlets WHERE id = ?").run(id),

  // products
  listProducts: () => db.prepare("SELECT * FROM products ORDER BY id").all() as unknown as Product[],
  listProductsForOutlet: (outletId: number) =>
    db.prepare("SELECT * FROM products WHERE outletId = ? ORDER BY id").all(outletId) as unknown as Product[],
  getProduct: (id: number) => db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined,
  createProduct: (p: Omit<Product, "id">) =>
    Number(
      db
        .prepare("INSERT INTO products (outletId, name, rackRate, discountPct, agencyCommPct) VALUES (?, ?, ?, ?, ?)")
        .run(p.outletId, p.name, p.rackRate, p.discountPct, p.agencyCommPct).lastInsertRowid,
    ),
  updateProduct: (id: number, p: Omit<Product, "id">) =>
    db
      .prepare("UPDATE products SET outletId=?, name=?, rackRate=?, discountPct=?, agencyCommPct=? WHERE id=?")
      .run(p.outletId, p.name, p.rackRate, p.discountPct, p.agencyCommPct, id),
  deleteProduct: (id: number) => db.prepare("DELETE FROM products WHERE id = ?").run(id),

  // dayparts
  listDayparts: () => db.prepare("SELECT * FROM dayparts ORDER BY id").all() as unknown as Daypart[],
  listDaypartsForOutlet: (outletId: number) =>
    db.prepare("SELECT * FROM dayparts WHERE outletId = ? ORDER BY id").all(outletId) as unknown as Daypart[],
  createDaypart: (d: Omit<Daypart, "id">) =>
    Number(db.prepare("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)").run(d.outletId, d.name, d.time).lastInsertRowid),
  updateDaypart: (id: number, d: Omit<Daypart, "id">) =>
    db.prepare("UPDATE dayparts SET outletId=?, name=?, time=? WHERE id=?").run(d.outletId, d.name, d.time, id),
  deleteDaypart: (id: number) => db.prepare("DELETE FROM dayparts WHERE id = ?").run(id),

  // campaigns
  listCampaigns: () => db.prepare("SELECT * FROM campaigns ORDER BY id DESC").all() as unknown as Campaign[],
  getCampaign: (id: number) => db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign | undefined,
  createCampaign: (c: Omit<Campaign, "id">) =>
    Number(
      db
        .prepare(
          "INSERT INTO campaigns (clientId, name, period, gridMode, startDate, endDate, fxRate, notes, jobBag, preparedBy, datePrepared, placementLength) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          c.clientId,
          c.name,
          c.period,
          c.gridMode,
          c.startDate,
          c.endDate,
          c.fxRate,
          c.notes,
          c.jobBag ?? "",
          c.preparedBy ?? "",
          c.datePrepared ?? "",
          c.placementLength ?? "",
        ).lastInsertRowid,
    ),
  updateCampaign: (id: number, c: Omit<Campaign, "id">) =>
    db
      .prepare(
        "UPDATE campaigns SET clientId=?, name=?, period=?, gridMode=?, startDate=?, endDate=?, fxRate=?, notes=?, jobBag=?, preparedBy=?, datePrepared=?, placementLength=? WHERE id=?",
      )
      .run(
        c.clientId,
        c.name,
        c.period,
        c.gridMode,
        c.startDate,
        c.endDate,
        c.fxRate,
        c.notes,
        c.jobBag ?? "",
        c.preparedBy ?? "",
        c.datePrepared ?? "",
        c.placementLength ?? "",
        id,
      ),
  deleteCampaign: (id: number) => db.prepare("DELETE FROM campaigns WHERE id = ?").run(id),

  // placements
  listPlacements: (campaignId: number) =>
    db
      .prepare("SELECT * FROM placements WHERE campaignId = ? ORDER BY sortOrder, id")
      .all(campaignId) as unknown as Placement[],
  getPlacement: (id: number) => db.prepare("SELECT * FROM placements WHERE id = ?").get(id) as Placement | undefined,
  createPlacement: (p: Omit<Placement, "id">) =>
    Number(
      db
        .prepare(
          `INSERT INTO placements (campaignId, outletId, productId, countryId, medium, daypart, timeSlot, clientUnitCost, agencyUnitCost, wireFee, sortOrder, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          p.campaignId,
          p.outletId,
          p.productId,
          p.countryId,
          p.medium,
          p.daypart,
          p.timeSlot,
          p.clientUnitCost,
          p.agencyUnitCost,
          p.wireFee,
          p.sortOrder,
          p.notes,
        ).lastInsertRowid,
    ),
  updatePlacement: (id: number, p: Omit<Placement, "id">) =>
    db
      .prepare(
        `UPDATE placements SET outletId=?, productId=?, countryId=?, medium=?, daypart=?, timeSlot=?, clientUnitCost=?, agencyUnitCost=?, wireFee=?, sortOrder=?, notes=? WHERE id=?`,
      )
      .run(
        p.outletId,
        p.productId,
        p.countryId,
        p.medium,
        p.daypart,
        p.timeSlot,
        p.clientUnitCost,
        p.agencyUnitCost,
        p.wireFee,
        p.sortOrder,
        p.notes,
        id,
      ),
  deletePlacement: (id: number) => db.prepare("DELETE FROM placements WHERE id = ?").run(id),

  // flight cells
  listFlights: (placementId: number) =>
    db.prepare("SELECT * FROM flight_cells WHERE placementId = ?").all(placementId) as unknown as FlightCell[],
  listFlightsForCampaign: (campaignId: number) =>
    db
      .prepare(
        `SELECT fc.* FROM flight_cells fc
         JOIN placements p ON p.id = fc.placementId
         WHERE p.campaignId = ?`,
      )
      .all(campaignId) as unknown as FlightCell[],
  upsertFlight: (placementId: number, periodKey: string, count: number) => {
    if (count <= 0) {
      db.prepare("DELETE FROM flight_cells WHERE placementId = ? AND periodKey = ?").run(placementId, periodKey);
      return;
    }
    db.prepare(
      `INSERT INTO flight_cells (placementId, periodKey, count) VALUES (?, ?, ?)
       ON CONFLICT(placementId, periodKey) DO UPDATE SET count = excluded.count`,
    ).run(placementId, periodKey, count);
  },
  upsertFlightsBulk: (placementId: number, cells: { periodKey: string; count: number }[], clearFirst: boolean) => {
    const insert = db.prepare(
      `INSERT INTO flight_cells (placementId, periodKey, count) VALUES (?, ?, ?)
       ON CONFLICT(placementId, periodKey) DO UPDATE SET count = excluded.count`,
    );
    const del = db.prepare("DELETE FROM flight_cells WHERE placementId = ? AND periodKey = ?");
    db.exec("BEGIN");
    try {
      if (clearFirst) db.prepare("DELETE FROM flight_cells WHERE placementId = ?").run(placementId);
      for (const c of cells) {
        if (c.count <= 0) del.run(placementId, c.periodKey);
        else insert.run(placementId, c.periodKey, c.count);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },
};
