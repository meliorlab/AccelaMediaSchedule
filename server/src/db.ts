import { createClient, type Client as LibsqlClient, type InArgs } from "@libsql/client";
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

/**
 * Database URL resolution:
 *  - Set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) in production (Vercel) to point at a
 *    hosted libSQL/Turso database (e.g. "libsql://your-db.turso.io").
 *  - Locally, if no URL is provided we fall back to an on-disk SQLite file so
 *    `npm run dev` keeps working with zero configuration.
 */
function resolveUrl(): string {
  const remote = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  if (remote) return remote;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
  mkdirSync(dataDir, { recursive: true });
  return `file:${join(dataDir, "media-schedules.db")}`;
}

export const db: LibsqlClient = createClient({
  url: resolveUrl(),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ---- Query helpers over the libSQL client ----
async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await db.execute({ sql, args });
  return rs.rows as unknown as T[];
}
async function get<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const rs = await db.execute({ sql, args });
  return (rs.rows[0] as unknown as T) ?? undefined;
}
async function run(sql: string, args: InArgs = []): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const rs = await db.execute({ sql, args });
  return {
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : 0,
    rowsAffected: rs.rowsAffected,
  };
}

// ---- One-time schema + seed, memoized so every request awaits the same promise ----
let readyPromise: Promise<void> | null = null;

async function migrate(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS countries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XCD',
      vatRate REAL NOT NULL DEFAULT 0,
      defaultWireFee REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS outlets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      countryId INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      medium TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      popularSlots TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outletId INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rackRate REAL NOT NULL DEFAULT 0,
      discountPct REAL NOT NULL DEFAULT 0,
      agencyCommPct REAL NOT NULL DEFAULT 0.15
    )`,
    `CREATE TABLE IF NOT EXISTS dayparts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outletId INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS campaigns (
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
    )`,
    `CREATE TABLE IF NOT EXISTS placements (
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
    )`,
    `CREATE TABLE IF NOT EXISTS flight_cells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placementId INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
      periodKey TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(placementId, periodKey)
    )`,
  ];
  for (const sql of statements) await db.execute(sql);

  // Lightweight column migrations for databases created by earlier versions.
  await ensureColumn("placements", "daypart", "daypart TEXT NOT NULL DEFAULT ''");
  await ensureColumn("campaigns", "jobBag", "jobBag TEXT NOT NULL DEFAULT ''");
  await ensureColumn("campaigns", "preparedBy", "preparedBy TEXT NOT NULL DEFAULT ''");
  await ensureColumn("campaigns", "datePrepared", "datePrepared TEXT NOT NULL DEFAULT ''");
  await ensureColumn("campaigns", "placementLength", "placementLength TEXT NOT NULL DEFAULT ''");
}

async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  const cols = await all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function seedIfEmpty(): Promise<void> {
  const row = await get<{ c: number }>("SELECT COUNT(*) AS c FROM countries");
  if ((row?.c ?? 0) > 0) return;

  const countryIdByName = new Map<string, number>();
  for (const c of seedCountries) {
    const info = await run(
      "INSERT INTO countries (name, currency, vatRate, defaultWireFee) VALUES (?, ?, ?, ?)",
      [c.name, c.currency, c.vatRate, c.defaultWireFee],
    );
    countryIdByName.set(c.name, info.lastInsertRowid);
  }
  for (const o of seedOutlets) {
    const cid = countryIdByName.get(o.country);
    if (!cid) continue;
    const info = await run(
      "INSERT INTO outlets (countryId, name, medium, email, phone, popularSlots) VALUES (?, ?, ?, ?, ?, ?)",
      [cid, o.name, o.medium, o.email, o.phone, o.popularSlots],
    );
    const oid = info.lastInsertRowid;
    for (const p of o.products) {
      await run("INSERT INTO products (outletId, name, rackRate, discountPct, agencyCommPct) VALUES (?, ?, ?, ?, ?)", [
        oid,
        p.name,
        p.rackRate,
        p.discountPct,
        p.agencyCommPct,
      ]);
    }
    for (const d of defaultDayparts(o.medium)) {
      await run("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)", [oid, d.name, d.time]);
    }
  }
  for (const name of seedClients) await run("INSERT INTO clients (name) VALUES (?)", [name]);
}

async function seedDaypartsIfEmpty(): Promise<void> {
  const row = await get<{ c: number }>("SELECT COUNT(*) AS c FROM dayparts");
  if ((row?.c ?? 0) > 0) return;
  const outlets = await all<{ id: number; medium: Outlet["medium"] }>("SELECT id, medium FROM outlets");
  for (const o of outlets) {
    for (const d of defaultDayparts(o.medium)) {
      await run("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)", [o.id, d.name, d.time]);
    }
  }
}

/** Ensure schema + seed have run. Memoized: safe (and cheap) to await on every request. */
export function ready(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await migrate();
      await seedIfEmpty();
      await seedDaypartsIfEmpty();
    })().catch((err) => {
      // Reset so a subsequent request can retry after a transient failure.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

async function ensure() {
  await ready();
}

// ---- Typed query helpers (all async) ----
export const queries = {
  // clients
  listClients: async (): Promise<Client[]> => {
    await ensure();
    return all<Client>("SELECT * FROM clients ORDER BY name");
  },
  createClient: async (name: string): Promise<number> => {
    await ensure();
    return (await run("INSERT INTO clients (name) VALUES (?)", [name])).lastInsertRowid;
  },
  deleteClient: async (id: number) => {
    await ensure();
    await run("DELETE FROM clients WHERE id = ?", [id]);
  },

  // countries
  listCountries: async (): Promise<Country[]> => {
    await ensure();
    return all<Country>("SELECT * FROM countries ORDER BY name");
  },
  getCountry: async (id: number): Promise<Country | undefined> => {
    await ensure();
    return get<Country>("SELECT * FROM countries WHERE id = ?", [id]);
  },
  createCountry: async (c: Omit<Country, "id">): Promise<number> => {
    await ensure();
    return (
      await run("INSERT INTO countries (name, currency, vatRate, defaultWireFee) VALUES (?, ?, ?, ?)", [
        c.name,
        c.currency,
        c.vatRate,
        c.defaultWireFee,
      ])
    ).lastInsertRowid;
  },
  updateCountry: async (id: number, c: Omit<Country, "id">) => {
    await ensure();
    await run("UPDATE countries SET name=?, currency=?, vatRate=?, defaultWireFee=? WHERE id=?", [
      c.name,
      c.currency,
      c.vatRate,
      c.defaultWireFee,
      id,
    ]);
  },
  deleteCountry: async (id: number) => {
    await ensure();
    await run("DELETE FROM countries WHERE id = ?", [id]);
  },

  // outlets
  listOutlets: async (): Promise<Outlet[]> => {
    await ensure();
    return all<Outlet>("SELECT * FROM outlets ORDER BY name");
  },
  getOutlet: async (id: number): Promise<Outlet | undefined> => {
    await ensure();
    return get<Outlet>("SELECT * FROM outlets WHERE id = ?", [id]);
  },
  createOutlet: async (o: Omit<Outlet, "id">): Promise<number> => {
    await ensure();
    return (
      await run("INSERT INTO outlets (countryId, name, medium, email, phone, popularSlots) VALUES (?, ?, ?, ?, ?, ?)", [
        o.countryId,
        o.name,
        o.medium,
        o.email,
        o.phone,
        o.popularSlots,
      ])
    ).lastInsertRowid;
  },
  updateOutlet: async (id: number, o: Omit<Outlet, "id">) => {
    await ensure();
    await run("UPDATE outlets SET countryId=?, name=?, medium=?, email=?, phone=?, popularSlots=? WHERE id=?", [
      o.countryId,
      o.name,
      o.medium,
      o.email,
      o.phone,
      o.popularSlots,
      id,
    ]);
  },
  deleteOutlet: async (id: number) => {
    await ensure();
    await run("DELETE FROM outlets WHERE id = ?", [id]);
  },

  // products
  listProducts: async (): Promise<Product[]> => {
    await ensure();
    return all<Product>("SELECT * FROM products ORDER BY id");
  },
  listProductsForOutlet: async (outletId: number): Promise<Product[]> => {
    await ensure();
    return all<Product>("SELECT * FROM products WHERE outletId = ? ORDER BY id", [outletId]);
  },
  getProduct: async (id: number): Promise<Product | undefined> => {
    await ensure();
    return get<Product>("SELECT * FROM products WHERE id = ?", [id]);
  },
  createProduct: async (p: Omit<Product, "id">): Promise<number> => {
    await ensure();
    return (
      await run("INSERT INTO products (outletId, name, rackRate, discountPct, agencyCommPct) VALUES (?, ?, ?, ?, ?)", [
        p.outletId,
        p.name,
        p.rackRate,
        p.discountPct,
        p.agencyCommPct,
      ])
    ).lastInsertRowid;
  },
  updateProduct: async (id: number, p: Omit<Product, "id">) => {
    await ensure();
    await run("UPDATE products SET outletId=?, name=?, rackRate=?, discountPct=?, agencyCommPct=? WHERE id=?", [
      p.outletId,
      p.name,
      p.rackRate,
      p.discountPct,
      p.agencyCommPct,
      id,
    ]);
  },
  deleteProduct: async (id: number) => {
    await ensure();
    await run("DELETE FROM products WHERE id = ?", [id]);
  },

  // dayparts
  listDayparts: async (): Promise<Daypart[]> => {
    await ensure();
    return all<Daypart>("SELECT * FROM dayparts ORDER BY id");
  },
  listDaypartsForOutlet: async (outletId: number): Promise<Daypart[]> => {
    await ensure();
    return all<Daypart>("SELECT * FROM dayparts WHERE outletId = ? ORDER BY id", [outletId]);
  },
  createDaypart: async (d: Omit<Daypart, "id">): Promise<number> => {
    await ensure();
    return (
      await run("INSERT INTO dayparts (outletId, name, time) VALUES (?, ?, ?)", [d.outletId, d.name, d.time])
    ).lastInsertRowid;
  },
  updateDaypart: async (id: number, d: Omit<Daypart, "id">) => {
    await ensure();
    await run("UPDATE dayparts SET outletId=?, name=?, time=? WHERE id=?", [d.outletId, d.name, d.time, id]);
  },
  deleteDaypart: async (id: number) => {
    await ensure();
    await run("DELETE FROM dayparts WHERE id = ?", [id]);
  },

  // campaigns
  listCampaigns: async (): Promise<Campaign[]> => {
    await ensure();
    return all<Campaign>("SELECT * FROM campaigns ORDER BY id DESC");
  },
  getCampaign: async (id: number): Promise<Campaign | undefined> => {
    await ensure();
    return get<Campaign>("SELECT * FROM campaigns WHERE id = ?", [id]);
  },
  createCampaign: async (c: Omit<Campaign, "id">): Promise<number> => {
    await ensure();
    return (
      await run(
        "INSERT INTO campaigns (clientId, name, period, gridMode, startDate, endDate, fxRate, notes, jobBag, preparedBy, datePrepared, placementLength) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
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
        ],
      )
    ).lastInsertRowid;
  },
  updateCampaign: async (id: number, c: Omit<Campaign, "id">) => {
    await ensure();
    await run(
      "UPDATE campaigns SET clientId=?, name=?, period=?, gridMode=?, startDate=?, endDate=?, fxRate=?, notes=?, jobBag=?, preparedBy=?, datePrepared=?, placementLength=? WHERE id=?",
      [
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
      ],
    );
  },
  deleteCampaign: async (id: number) => {
    await ensure();
    await run("DELETE FROM campaigns WHERE id = ?", [id]);
  },

  // placements
  listPlacements: async (campaignId: number): Promise<Placement[]> => {
    await ensure();
    return all<Placement>("SELECT * FROM placements WHERE campaignId = ? ORDER BY sortOrder, id", [campaignId]);
  },
  getPlacement: async (id: number): Promise<Placement | undefined> => {
    await ensure();
    return get<Placement>("SELECT * FROM placements WHERE id = ?", [id]);
  },
  createPlacement: async (p: Omit<Placement, "id">): Promise<number> => {
    await ensure();
    return (
      await run(
        `INSERT INTO placements (campaignId, outletId, productId, countryId, medium, daypart, timeSlot, clientUnitCost, agencyUnitCost, wireFee, sortOrder, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
        ],
      )
    ).lastInsertRowid;
  },
  updatePlacement: async (id: number, p: Omit<Placement, "id">) => {
    await ensure();
    await run(
      `UPDATE placements SET outletId=?, productId=?, countryId=?, medium=?, daypart=?, timeSlot=?, clientUnitCost=?, agencyUnitCost=?, wireFee=?, sortOrder=?, notes=? WHERE id=?`,
      [
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
      ],
    );
  },
  deletePlacement: async (id: number) => {
    await ensure();
    await run("DELETE FROM placements WHERE id = ?", [id]);
  },

  // flight cells
  listFlights: async (placementId: number): Promise<FlightCell[]> => {
    await ensure();
    return all<FlightCell>("SELECT * FROM flight_cells WHERE placementId = ?", [placementId]);
  },
  listFlightsForCampaign: async (campaignId: number): Promise<FlightCell[]> => {
    await ensure();
    return all<FlightCell>(
      `SELECT fc.* FROM flight_cells fc
       JOIN placements p ON p.id = fc.placementId
       WHERE p.campaignId = ?`,
      [campaignId],
    );
  },
  upsertFlight: async (placementId: number, periodKey: string, count: number) => {
    await ensure();
    if (count <= 0) {
      await run("DELETE FROM flight_cells WHERE placementId = ? AND periodKey = ?", [placementId, periodKey]);
      return;
    }
    await run(
      `INSERT INTO flight_cells (placementId, periodKey, count) VALUES (?, ?, ?)
       ON CONFLICT(placementId, periodKey) DO UPDATE SET count = excluded.count`,
      [placementId, periodKey, count],
    );
  },
  upsertFlightsBulk: async (
    placementId: number,
    cells: { periodKey: string; count: number }[],
    clearFirst: boolean,
  ) => {
    await ensure();
    const stmts: { sql: string; args: InArgs }[] = [];
    if (clearFirst) {
      stmts.push({ sql: "DELETE FROM flight_cells WHERE placementId = ?", args: [placementId] });
    }
    for (const c of cells) {
      if (c.count <= 0) {
        stmts.push({
          sql: "DELETE FROM flight_cells WHERE placementId = ? AND periodKey = ?",
          args: [placementId, c.periodKey],
        });
      } else {
        stmts.push({
          sql: `INSERT INTO flight_cells (placementId, periodKey, count) VALUES (?, ?, ?)
                ON CONFLICT(placementId, periodKey) DO UPDATE SET count = excluded.count`,
          args: [placementId, c.periodKey, c.count],
        });
      }
    }
    if (stmts.length > 0) await db.batch(stmts, "write");
  },
};
