import { queries } from "./db.js";
import {
  buildPeriods,
  computeBookingOrderLine,
  financialsForPlacement,
  sumInsertions,
} from "@msb/shared";
import type {
  BookingOrder,
  Campaign,
  Country,
  FlightCell,
  Medium,
  Outlet,
  Placement,
  PlacementFinancials,
  Product,
} from "@msb/shared";

export interface EnrichedPlacement extends Placement {
  flights: FlightCell[];
  financials: PlacementFinancials;
  outlet: Outlet | undefined;
  country: Country | undefined;
  product: Product | undefined;
  outletName: string;
  countryName: string;
  productName: string;
}

export interface Period {
  key: string;
  label: string;
  sub: string;
}

export interface CampaignBundle {
  campaign: Campaign;
  clientName: string;
  periods: Period[];
  placements: EnrichedPlacement[];
}

export async function getCampaignBundle(campaignId: number): Promise<CampaignBundle | null> {
  const campaign = await queries.getCampaign(campaignId);
  if (!campaign) return null;

  const [clients, countriesList, outletsList, productsList, placementRows] = await Promise.all([
    queries.listClients(),
    queries.listCountries(),
    queries.listOutlets(),
    queries.listProducts(),
    queries.listPlacements(campaignId),
  ]);

  const countries = new Map(countriesList.map((c) => [c.id, c]));
  const outlets = new Map(outletsList.map((o) => [o.id, o]));
  const products = new Map(productsList.map((p) => [p.id, p]));
  const clientName = clients.find((c) => c.id === campaign.clientId)?.name ?? "";

  const periods = buildPeriods(campaign.startDate, campaign.endDate, campaign.gridMode as "daily" | "weekly");

  const flightsByPlacement = await Promise.all(placementRows.map((p) => queries.listFlights(p.id)));

  const placements: EnrichedPlacement[] = placementRows.map((p, i) => {
    const flights = flightsByPlacement[i];
    const country = countries.get(p.countryId);
    const outlet = outlets.get(p.outletId);
    const product = p.productId ? products.get(p.productId) : undefined;
    const financials = financialsForPlacement(
      p,
      flights,
      { vatRate: country?.vatRate ?? 0 },
      campaign.fxRate,
    );
    return {
      ...p,
      flights,
      financials,
      outlet,
      country,
      product,
      outletName: outlet?.name ?? "(unknown)",
      countryName: country?.name ?? "",
      productName: product?.name ?? p.timeSlot ?? "",
    };
  });

  return { campaign, clientName, periods, placements };
}

/** Group placements by outlet and produce a Booking Order for each. */
export function buildBookingOrders(bundle: CampaignBundle): BookingOrder[] {
  const byOutlet = new Map<number, EnrichedPlacement[]>();
  for (const p of bundle.placements) {
    if (!byOutlet.has(p.outletId)) byOutlet.set(p.outletId, []);
    byOutlet.get(p.outletId)!.push(p);
  }

  const orders: BookingOrder[] = [];
  for (const [outletId, placements] of byOutlet) {
    const first = placements[0];
    const vatRate = first.country?.vatRate ?? 0;
    const lines = placements.map((p) => {
      const rackRate = p.product?.rackRate ?? p.clientUnitCost;
      const insertions = sumInsertions(p.flights);
      const agencyCommPct = p.product?.agencyCommPct ?? 0.15;
      // Booking order is rack-based: the 15% agency commission is the only reduction.
      return computeBookingOrderLine({
        placementId: p.id,
        productName: p.productName,
        timeSlot: p.timeSlot,
        rackRate,
        discountedRate: rackRate,
        insertions,
        agencyCommPct,
        vatRate,
      });
    });
    const totalNetSubTotal = round(lines.reduce((a, l) => a + l.netSubTotal, 0));
    const totalVat = round(lines.reduce((a, l) => a + l.vat, 0));
    const grandTotal = round(lines.reduce((a, l) => a + l.grandTotal, 0));
    orders.push({
      outletId,
      outletName: first.outletName,
      medium: first.medium,
      countryName: first.countryName,
      vatRate,
      lines,
      totalNetSubTotal,
      totalVat,
      grandTotal,
    });
  }
  orders.sort((a, b) => a.countryName.localeCompare(b.countryName) || a.outletName.localeCompare(b.outletName));
  return orders;
}

export interface SummaryRow {
  key: string;
  clientTotal: number;
  agencyTotal: number;
  margin: number;
  usd: number;
  insertions: number;
}

export interface CampaignSummary {
  byMedium: SummaryRow[];
  byCountry: SummaryRow[];
  grand: SummaryRow;
}

export function buildSummary(bundle: CampaignBundle): CampaignSummary {
  const media = new Map<string, SummaryRow>();
  const countries = new Map<string, SummaryRow>();
  const grand: SummaryRow = { key: "TOTAL", clientTotal: 0, agencyTotal: 0, margin: 0, usd: 0, insertions: 0 };

  const add = (map: Map<string, SummaryRow>, key: string, p: EnrichedPlacement) => {
    const row = map.get(key) ?? { key, clientTotal: 0, agencyTotal: 0, margin: 0, usd: 0, insertions: 0 };
    row.clientTotal = round(row.clientTotal + p.financials.grandTotalWithWire);
    row.agencyTotal = round(row.agencyTotal + p.financials.agencyGrandTotal);
    row.margin = round(row.margin + p.financials.margin);
    row.usd = round(row.usd + p.financials.usd);
    row.insertions += p.financials.insertions;
    map.set(key, row);
  };

  for (const p of bundle.placements) {
    add(media, p.medium as Medium, p);
    add(countries, p.countryName || "(none)", p);
    grand.clientTotal = round(grand.clientTotal + p.financials.grandTotalWithWire);
    grand.agencyTotal = round(grand.agencyTotal + p.financials.agencyGrandTotal);
    grand.margin = round(grand.margin + p.financials.margin);
    grand.usd = round(grand.usd + p.financials.usd);
    grand.insertions += p.financials.insertions;
  }

  return {
    byMedium: [...media.values()],
    byCountry: [...countries.values()].sort((a, b) => a.key.localeCompare(b.key)),
    grand,
  };
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
