// Financial calculations, reverse-engineered from the sample workbooks.
// Kept pure and dependency-free so both the server and the web client can use it.

import type {
  Country,
  FlightCell,
  Placement,
  PlacementFinancials,
  Product,
  BookingOrderLine,
} from "./types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum of the flight-grid cells = number of insertions. */
export function sumInsertions(flights: Pick<FlightCell, "count">[]): number {
  return flights.reduce((acc, f) => acc + (Number(f.count) || 0), 0);
}

export interface CalcInput {
  clientUnitCost: number;
  agencyUnitCost: number;
  insertions: number;
  vatRate: number;
  wireFee: number;
  fxRate: number;
}

/**
 * Core placement math confirmed from the sheets:
 *   subTotal          = unitCost * insertions
 *   tax               = subTotal * vatRate
 *   grandTotal        = subTotal + tax
 *   grandTotalWithWire= grandTotal + wireFee
 *   usd               = grandTotalWithWire / fxRate
 */
export function computeFinancials(input: CalcInput): PlacementFinancials {
  const insertions = Number(input.insertions) || 0;
  const vatRate = Number(input.vatRate) || 0;
  const wireFee = Number(input.wireFee) || 0;
  const fxRate = Number(input.fxRate) || 1;

  const subTotal = round2(input.clientUnitCost * insertions);
  const tax = round2(subTotal * vatRate);
  const grandTotal = round2(subTotal + tax);
  const grandTotalWithWire = round2(grandTotal + wireFee);
  const usd = round2(grandTotalWithWire / (fxRate || 1));

  const agencySubTotal = round2(input.agencyUnitCost * insertions);
  const agencyTax = round2(agencySubTotal * vatRate);
  const agencyGrandTotal = round2(agencySubTotal + agencyTax);
  const margin = round2(grandTotal - agencyGrandTotal);

  return {
    insertions,
    subTotal,
    tax,
    grandTotal,
    grandTotalWithWire,
    usd,
    agencySubTotal,
    agencyGrandTotal,
    margin,
  };
}

/** Convenience wrapper that pulls the VAT rate/wire default from the country. */
export function financialsForPlacement(
  placement: Pick<
    Placement,
    "clientUnitCost" | "agencyUnitCost" | "wireFee"
  >,
  flights: Pick<FlightCell, "count">[],
  country: Pick<Country, "vatRate">,
  fxRate: number,
): PlacementFinancials {
  return computeFinancials({
    clientUnitCost: placement.clientUnitCost,
    agencyUnitCost: placement.agencyUnitCost,
    insertions: sumInsertions(flights),
    vatRate: country.vatRate,
    wireFee: placement.wireFee,
    fxRate,
  });
}

/** Derive the agency (net) unit cost from a client cost and commission. */
export function agencyCostFromClient(clientUnitCost: number, agencyCommPct: number): number {
  return round2(clientUnitCost * (1 - (Number(agencyCommPct) || 0)));
}

/** Derive a discounted rate from a rack rate and discount fraction. */
export function discountedRate(rackRate: number, discountPct: number): number {
  return round2(rackRate * (1 - (Number(discountPct) || 0)));
}

/**
 * Booking-order line math sent to a media house, confirmed from the ZIZ BO:
 *   subTotal        = discountedRate * insertions            (2340)
 *   agencyCommission= -subTotal * agencyCommPct              (-351 at 15%)
 *   netSubTotal     = subTotal + agencyCommission            (1989)
 *   vat             = netSubTotal * vatRate                  (338.13 at 17%)
 *   grandTotal      = netSubTotal + vat                      (2327.13)
 */
export function computeBookingOrderLine(params: {
  placementId: number;
  productName: string;
  timeSlot: string;
  rackRate: number;
  discountedRate: number;
  insertions: number;
  agencyCommPct: number;
  vatRate: number;
}): BookingOrderLine {
  const subTotal = round2(params.discountedRate * params.insertions);
  const agencyCommission = round2(-subTotal * (Number(params.agencyCommPct) || 0));
  const netSubTotal = round2(subTotal + agencyCommission);
  const vat = round2(netSubTotal * (Number(params.vatRate) || 0));
  const grandTotal = round2(netSubTotal + vat);
  return {
    placementId: params.placementId,
    productName: params.productName,
    timeSlot: params.timeSlot,
    rackRate: params.rackRate,
    discountedRate: params.discountedRate,
    insertions: params.insertions,
    subTotal,
    agencyCommission,
    netSubTotal,
    vat,
    grandTotal,
  };
}

/** Build the list of period keys/labels for a campaign's flight grid. */
export function buildPeriods(
  startDate: string,
  endDate: string,
  mode: "daily" | "weekly",
): { key: string; label: string; sub: string }[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const periods: { key: string; label: string; sub: string }[] = [];
  const weekdayLetters = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];

  if (mode === "daily") {
    const cur = new Date(start);
    let guard = 0;
    while (cur <= end && guard < 400) {
      const key = cur.toISOString().slice(0, 10);
      periods.push({
        key,
        label: weekdayLetters[cur.getDay()],
        sub: String(cur.getDate()),
      });
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  } else {
    // Weekly: label WK1..WKn by 7-day buckets from the start date.
    const cur = new Date(start);
    let wk = 1;
    let guard = 0;
    while (cur <= end && guard < 200) {
      const key = `WK${wk}`;
      const d = new Date(cur);
      periods.push({
        key,
        label: `WK ${wk}`,
        sub: `${d.getMonth() + 1}/${d.getDate()}`,
      });
      cur.setDate(cur.getDate() + 7);
      wk++;
      guard++;
    }
  }
  return periods;
}
