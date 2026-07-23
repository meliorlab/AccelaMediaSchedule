// Core domain types for the Media Schedule Builder.
// Shared between the Express server and the React web client.

export type Medium = "TV" | "Radio" | "Press" | "Online";

export const MEDIA: Medium[] = ["TV", "Radio", "Press", "Online"];

export type GridMode = "daily" | "weekly";

/** Named time-of-day bands (dayparts) used mainly for TV/Radio placements. */
export const DAYPARTS: string[] = [
  "Peak-Time",
  "Prime Time",
  "Morning",
  "Mid-Morning",
  "Afternoon",
  "Drive Time",
  "Evening",
  "Evening News",
  "Night",
  "Run of Station",
];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface Client {
  id: number;
  name: string;
}

export interface Country {
  id: number;
  name: string;
  /** ISO-ish currency code for the local currency, usually XCD. */
  currency: string;
  /** VAT / tax rate as a fraction, e.g. 0.17 for 17%. */
  vatRate: number;
  /** Default wire-transfer fee applied to placements in this country (local currency). */
  defaultWireFee: number;
}

export interface Outlet {
  id: number;
  countryId: number;
  name: string;
  medium: Medium;
  email: string;
  phone: string;
  /** Popular time slots (TV/Radio) or edition/day (Press/Online). */
  popularSlots: string;
}

/** A named time band for a media house, e.g. { name: "Peak-Time", time: "7pm - 8pm" }. */
export interface Daypart {
  id: number;
  outletId: number;
  name: string;
  time: string;
}

export interface Product {
  id: number;
  outletId: number;
  /** e.g. "30 Sec", "45-Sec TVC", "Full Page, Full Colour". */
  name: string;
  /** Rack rate (published/undiscounted rate) in local currency. */
  rackRate: number;
  /** Discount off rack rate as a fraction, e.g. 0.15. */
  discountPct: number;
  /** Agency commission as a fraction, e.g. 0.15. */
  agencyCommPct: number;
}

export interface Campaign {
  id: number;
  clientId: number;
  name: string;
  /** Human label for placement period, e.g. "June - July 2026". */
  period: string;
  gridMode: GridMode;
  /** ISO date (yyyy-mm-dd). */
  startDate: string;
  /** ISO date (yyyy-mm-dd). */
  endDate: string;
  /** Local-currency units per 1 USD (e.g. 2.65 XCD per USD). */
  fxRate: number;
  notes: string;
  /** Job bag / reference number shown in the schedule header (e.g. "8209"). */
  jobBag?: string;
  /** Name of the person who prepared the schedule. */
  preparedBy?: string;
  /** ISO date (yyyy-mm-dd) the schedule was prepared. */
  datePrepared?: string;
  /** Optional human label for placement length (e.g. "Two (2) Months"); derived from dates if empty. */
  placementLength?: string;
}

export interface Placement {
  id: number;
  campaignId: number;
  outletId: number;
  productId: number | null;
  /** Denormalised for convenience/ordering; derived from outlet. */
  countryId: number;
  medium: Medium;
  /** Named time-of-day band (e.g. "Peak-Time", "Morning"). Mainly for TV/Radio. */
  daypart: string;
  /** Product/time-slot label shown on the schedule (e.g. "Evening News"). */
  timeSlot: string;
  /** Client-facing unit cost in local currency. */
  clientUnitCost: number;
  /** Net/agency unit cost in local currency (before commission markup). */
  agencyUnitCost: number;
  /** Wire fee for this line in local currency. */
  wireFee: number;
  sortOrder: number;
  notes: string;
}

export interface FlightCell {
  id: number;
  placementId: number;
  /** Date (yyyy-mm-dd) in daily mode, or a week label like "WK2" in weekly mode. */
  periodKey: string;
  count: number;
}

/** A placement with its flight cells attached. */
export interface PlacementWithFlights extends Placement {
  flights: FlightCell[];
}

/** Fully-computed financial figures for a placement. */
export interface PlacementFinancials {
  insertions: number;
  subTotal: number;
  tax: number;
  grandTotal: number;
  grandTotalWithWire: number;
  usd: number;
  /** Agency (net) equivalents. */
  agencySubTotal: number;
  agencyGrandTotal: number;
  /** Agency margin = client grand total - agency grand total. */
  margin: number;
}

/** A single line inside a Booking Order for one outlet. */
export interface BookingOrderLine {
  placementId: number;
  productName: string;
  timeSlot: string;
  rackRate: number;
  discountedRate: number;
  insertions: number;
  subTotal: number;
  agencyCommission: number;
  netSubTotal: number;
  vat: number;
  grandTotal: number;
}

export interface BookingOrder {
  outletId: number;
  outletName: string;
  medium: Medium;
  countryName: string;
  vatRate: number;
  lines: BookingOrderLine[];
  totalNetSubTotal: number;
  totalVat: number;
  grandTotal: number;
}
