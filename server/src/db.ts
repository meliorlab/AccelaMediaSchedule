import pg from "pg";
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

const { Pool } = pg;

/**
 * Supabase / Postgres connection.
 * Set DATABASE_URL to your Supabase connection string. For Vercel (serverless)
 * use the "Transaction" pooler string (host ...pooler.supabase.com, port 6543).
 */
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set. Set it to your Supabase Postgres connection string.",
  );
}

const isLocal = !!connectionString && /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  // Supabase requires TLS; its pooler uses a cert that Node won't verify by default.
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : undefined,
  max: 3,
});

// Convert our "?" placeholders to Postgres "$1, $2, ..." positional parameters.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function all<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const res = await pool.query(toPg(sql), args);
  return res.rows as T[];
}
async function get<T>(sql: string, args: unknown[] = []): Promise<T | undefined> {
  const res = await pool.query(toPg(sql), args);
  return (res.rows[0] as T) ?? undefined;
}
async function exec(sql: string, args: unknown[] = []): Promise<void> {
  await pool.query(toPg(sql), args);
}
/** Runs an INSERT that ends with `RETURNING "id"` and returns the new id. */
async function insertId(sql: string, args: unknown[] = []): Promise<number> {
  const res = await pool.query(toPg(sql), args);
  return Number((res.rows[0] as { id: number }).id);
}

// ---- One-time schema + seed, memoized so every request awaits the same promise ----
let readyPromise: Promise<void> | null = null;

async function migrate(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS clients (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS countries (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XCD',
      "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "defaultWireFee" DOUBLE PRECISION NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS outlets (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "countryId" INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      medium TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      "popularSlots" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "outletId" INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      "rackRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "agencyCommPct" DOUBLE PRECISION NOT NULL DEFAULT 0.15
    )`,
    `CREATE TABLE IF NOT EXISTS dayparts (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "outletId" INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "clientId" INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT '',
      "gridMode" TEXT NOT NULL DEFAULT 'daily',
      "startDate" TEXT NOT NULL,
      "endDate" TEXT NOT NULL,
      "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 2.65,
      notes TEXT NOT NULL DEFAULT '',
      "jobBag" TEXT NOT NULL DEFAULT '',
      "preparedBy" TEXT NOT NULL DEFAULT '',
      "datePrepared" TEXT NOT NULL DEFAULT '',
      "placementLength" TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS placements (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "campaignId" INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      "outletId" INTEGER NOT NULL REFERENCES outlets(id),
      "productId" INTEGER REFERENCES products(id),
      "countryId" INTEGER NOT NULL REFERENCES countries(id),
      medium TEXT NOT NULL,
      daypart TEXT NOT NULL DEFAULT '',
      "timeSlot" TEXT NOT NULL DEFAULT '',
      "clientUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "agencyUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "wireFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS flight_cells (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      "placementId" INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
      "periodKey" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      UNIQUE("placementId", "periodKey")
    )`,
    // Idempotent column additions for databases created by earlier versions.
    `ALTER TABLE placements ADD COLUMN IF NOT EXISTS daypart TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "jobBag" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "preparedBy" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "datePrepared" TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "placementLength" TEXT NOT NULL DEFAULT ''`,
  ];
  for (const sql of statements) await pool.query(sql);
}

async function seedIfEmpty(): Promise<void> {
  const row = await get<{ c: string | number }>("SELECT COUNT(*)::int AS c FROM countries");
  if (Number(row?.c ?? 0) > 0) return;

  const countryIdByName = new Map<string, number>();
  for (const c of seedCountries) {
    const id = await insertId(
      `INSERT INTO countries (name, currency, "vatRate", "defaultWireFee") VALUES (?, ?, ?, ?) RETURNING "id"`,
      [c.name, c.currency, c.vatRate, c.defaultWireFee],
    );
    countryIdByName.set(c.name, id);
  }
  for (const o of seedOutlets) {
    const cid = countryIdByName.get(o.country);
    if (!cid) continue;
    const oid = await insertId(
      `INSERT INTO outlets ("countryId", name, medium, email, phone, "popularSlots") VALUES (?, ?, ?, ?, ?, ?) RETURNING "id"`,
      [cid, o.name, o.medium, o.email, o.phone, o.popularSlots],
    );
    for (const p of o.products) {
      await exec(
        `INSERT INTO products ("outletId", name, "rackRate", "discountPct", "agencyCommPct") VALUES (?, ?, ?, ?, ?)`,
        [oid, p.name, p.rackRate, p.discountPct, p.agencyCommPct],
      );
    }
    for (const d of defaultDayparts(o.medium)) {
      await exec(`INSERT INTO dayparts ("outletId", name, time) VALUES (?, ?, ?)`, [oid, d.name, d.time]);
    }
  }
  for (const name of seedClients) await exec("INSERT INTO clients (name) VALUES (?)", [name]);
}

async function seedDaypartsIfEmpty(): Promise<void> {
  const row = await get<{ c: string | number }>("SELECT COUNT(*)::int AS c FROM dayparts");
  if (Number(row?.c ?? 0) > 0) return;
  const outlets = await all<{ id: number; medium: Outlet["medium"] }>("SELECT id, medium FROM outlets");
  for (const o of outlets) {
    for (const d of defaultDayparts(o.medium)) {
      await exec(`INSERT INTO dayparts ("outletId", name, time) VALUES (?, ?, ?)`, [o.id, d.name, d.time]);
    }
  }
}

/** Ensure schema + seed have run. Memoized: safe (and cheap) to await on every request. */
export function ready(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!connectionString) throw new Error("DATABASE_URL is not configured");
      await migrate();
      await seedIfEmpty();
      await seedDaypartsIfEmpty();
    })().catch((err) => {
      readyPromise = null; // allow retry after a transient failure
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
    return insertId(`INSERT INTO clients (name) VALUES (?) RETURNING "id"`, [name]);
  },
  deleteClient: async (id: number) => {
    await ensure();
    await exec("DELETE FROM clients WHERE id = ?", [id]);
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
    return insertId(
      `INSERT INTO countries (name, currency, "vatRate", "defaultWireFee") VALUES (?, ?, ?, ?) RETURNING "id"`,
      [c.name, c.currency, c.vatRate, c.defaultWireFee],
    );
  },
  updateCountry: async (id: number, c: Omit<Country, "id">) => {
    await ensure();
    await exec(`UPDATE countries SET name=?, currency=?, "vatRate"=?, "defaultWireFee"=? WHERE id=?`, [
      c.name,
      c.currency,
      c.vatRate,
      c.defaultWireFee,
      id,
    ]);
  },
  deleteCountry: async (id: number) => {
    await ensure();
    await exec("DELETE FROM countries WHERE id = ?", [id]);
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
    return insertId(
      `INSERT INTO outlets ("countryId", name, medium, email, phone, "popularSlots") VALUES (?, ?, ?, ?, ?, ?) RETURNING "id"`,
      [o.countryId, o.name, o.medium, o.email, o.phone, o.popularSlots],
    );
  },
  updateOutlet: async (id: number, o: Omit<Outlet, "id">) => {
    await ensure();
    await exec(
      `UPDATE outlets SET "countryId"=?, name=?, medium=?, email=?, phone=?, "popularSlots"=? WHERE id=?`,
      [o.countryId, o.name, o.medium, o.email, o.phone, o.popularSlots, id],
    );
  },
  deleteOutlet: async (id: number) => {
    await ensure();
    await exec("DELETE FROM outlets WHERE id = ?", [id]);
  },

  // products
  listProducts: async (): Promise<Product[]> => {
    await ensure();
    return all<Product>("SELECT * FROM products ORDER BY id");
  },
  listProductsForOutlet: async (outletId: number): Promise<Product[]> => {
    await ensure();
    return all<Product>(`SELECT * FROM products WHERE "outletId" = ? ORDER BY id`, [outletId]);
  },
  getProduct: async (id: number): Promise<Product | undefined> => {
    await ensure();
    return get<Product>("SELECT * FROM products WHERE id = ?", [id]);
  },
  createProduct: async (p: Omit<Product, "id">): Promise<number> => {
    await ensure();
    return insertId(
      `INSERT INTO products ("outletId", name, "rackRate", "discountPct", "agencyCommPct") VALUES (?, ?, ?, ?, ?) RETURNING "id"`,
      [p.outletId, p.name, p.rackRate, p.discountPct, p.agencyCommPct],
    );
  },
  updateProduct: async (id: number, p: Omit<Product, "id">) => {
    await ensure();
    await exec(
      `UPDATE products SET "outletId"=?, name=?, "rackRate"=?, "discountPct"=?, "agencyCommPct"=? WHERE id=?`,
      [p.outletId, p.name, p.rackRate, p.discountPct, p.agencyCommPct, id],
    );
  },
  deleteProduct: async (id: number) => {
    await ensure();
    await exec("DELETE FROM products WHERE id = ?", [id]);
  },

  // dayparts
  listDayparts: async (): Promise<Daypart[]> => {
    await ensure();
    return all<Daypart>("SELECT * FROM dayparts ORDER BY id");
  },
  listDaypartsForOutlet: async (outletId: number): Promise<Daypart[]> => {
    await ensure();
    return all<Daypart>(`SELECT * FROM dayparts WHERE "outletId" = ? ORDER BY id`, [outletId]);
  },
  createDaypart: async (d: Omit<Daypart, "id">): Promise<number> => {
    await ensure();
    return insertId(`INSERT INTO dayparts ("outletId", name, time) VALUES (?, ?, ?) RETURNING "id"`, [
      d.outletId,
      d.name,
      d.time,
    ]);
  },
  updateDaypart: async (id: number, d: Omit<Daypart, "id">) => {
    await ensure();
    await exec(`UPDATE dayparts SET "outletId"=?, name=?, time=? WHERE id=?`, [d.outletId, d.name, d.time, id]);
  },
  deleteDaypart: async (id: number) => {
    await ensure();
    await exec("DELETE FROM dayparts WHERE id = ?", [id]);
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
    return insertId(
      `INSERT INTO campaigns ("clientId", name, period, "gridMode", "startDate", "endDate", "fxRate", notes, "jobBag", "preparedBy", "datePrepared", "placementLength")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "id"`,
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
    );
  },
  updateCampaign: async (id: number, c: Omit<Campaign, "id">) => {
    await ensure();
    await exec(
      `UPDATE campaigns SET "clientId"=?, name=?, period=?, "gridMode"=?, "startDate"=?, "endDate"=?, "fxRate"=?, notes=?, "jobBag"=?, "preparedBy"=?, "datePrepared"=?, "placementLength"=? WHERE id=?`,
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
    await exec("DELETE FROM campaigns WHERE id = ?", [id]);
  },

  // placements
  listPlacements: async (campaignId: number): Promise<Placement[]> => {
    await ensure();
    return all<Placement>(`SELECT * FROM placements WHERE "campaignId" = ? ORDER BY "sortOrder", id`, [campaignId]);
  },
  getPlacement: async (id: number): Promise<Placement | undefined> => {
    await ensure();
    return get<Placement>("SELECT * FROM placements WHERE id = ?", [id]);
  },
  createPlacement: async (p: Omit<Placement, "id">): Promise<number> => {
    await ensure();
    return insertId(
      `INSERT INTO placements ("campaignId", "outletId", "productId", "countryId", medium, daypart, "timeSlot", "clientUnitCost", "agencyUnitCost", "wireFee", "sortOrder", notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "id"`,
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
    );
  },
  updatePlacement: async (id: number, p: Omit<Placement, "id">) => {
    await ensure();
    await exec(
      `UPDATE placements SET "outletId"=?, "productId"=?, "countryId"=?, medium=?, daypart=?, "timeSlot"=?, "clientUnitCost"=?, "agencyUnitCost"=?, "wireFee"=?, "sortOrder"=?, notes=? WHERE id=?`,
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
    await exec("DELETE FROM placements WHERE id = ?", [id]);
  },

  // flight cells
  listFlights: async (placementId: number): Promise<FlightCell[]> => {
    await ensure();
    return all<FlightCell>(`SELECT * FROM flight_cells WHERE "placementId" = ?`, [placementId]);
  },
  listFlightsForCampaign: async (campaignId: number): Promise<FlightCell[]> => {
    await ensure();
    return all<FlightCell>(
      `SELECT fc.* FROM flight_cells fc
       JOIN placements p ON p.id = fc."placementId"
       WHERE p."campaignId" = ?`,
      [campaignId],
    );
  },
  upsertFlight: async (placementId: number, periodKey: string, count: number) => {
    await ensure();
    if (count <= 0) {
      await exec(`DELETE FROM flight_cells WHERE "placementId" = ? AND "periodKey" = ?`, [placementId, periodKey]);
      return;
    }
    await exec(
      `INSERT INTO flight_cells ("placementId", "periodKey", count) VALUES (?, ?, ?)
       ON CONFLICT ("placementId", "periodKey") DO UPDATE SET count = excluded.count`,
      [placementId, periodKey, count],
    );
  },
  upsertFlightsBulk: async (
    placementId: number,
    cells: { periodKey: string; count: number }[],
    clearFirst: boolean,
  ) => {
    await ensure();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (clearFirst) {
        await client.query(toPg(`DELETE FROM flight_cells WHERE "placementId" = ?`), [placementId]);
      }
      for (const c of cells) {
        if (c.count <= 0) {
          await client.query(toPg(`DELETE FROM flight_cells WHERE "placementId" = ? AND "periodKey" = ?`), [
            placementId,
            c.periodKey,
          ]);
        } else {
          await client.query(
            toPg(
              `INSERT INTO flight_cells ("placementId", "periodKey", count) VALUES (?, ?, ?)
               ON CONFLICT ("placementId", "periodKey") DO UPDATE SET count = excluded.count`,
            ),
            [placementId, c.periodKey, c.count],
          );
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
