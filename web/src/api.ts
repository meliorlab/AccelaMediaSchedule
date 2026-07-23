import type {
  BookingOrder,
  Campaign,
  Client,
  Country,
  Daypart,
  Outlet,
  Placement,
  Product,
} from "@shared/types";

export interface OutletWithProducts extends Outlet {
  products: Product[];
  dayparts: Daypart[];
}

export interface EnrichedPlacement extends Placement {
  flights: { id: number; placementId: number; periodKey: string; count: number }[];
  financials: {
    insertions: number;
    subTotal: number;
    tax: number;
    grandTotal: number;
    grandTotalWithWire: number;
    usd: number;
    agencySubTotal: number;
    agencyGrandTotal: number;
    margin: number;
  };
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
  periods: Period[];
  placements: EnrichedPlacement[];
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

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // clients
  listClients: () => req<Client[]>("/api/clients"),
  createClient: (name: string) => req<{ id: number }>("/api/clients", { method: "POST", body: JSON.stringify({ name }) }),
  deleteClient: (id: number) => req(`/api/clients/${id}`, { method: "DELETE" }),

  // countries
  listCountries: () => req<Country[]>("/api/countries"),
  createCountry: (c: Omit<Country, "id">) => req<{ id: number }>("/api/countries", { method: "POST", body: JSON.stringify(c) }),
  updateCountry: (id: number, c: Omit<Country, "id">) => req(`/api/countries/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCountry: (id: number) => req(`/api/countries/${id}`, { method: "DELETE" }),

  // outlets + products
  listOutlets: () => req<OutletWithProducts[]>("/api/outlets"),
  createOutlet: (o: Omit<Outlet, "id">) => req<{ id: number }>("/api/outlets", { method: "POST", body: JSON.stringify(o) }),
  updateOutlet: (id: number, o: Omit<Outlet, "id">) => req(`/api/outlets/${id}`, { method: "PUT", body: JSON.stringify(o) }),
  deleteOutlet: (id: number) => req(`/api/outlets/${id}`, { method: "DELETE" }),
  createProduct: (p: Omit<Product, "id">) => req<{ id: number }>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: number, p: Omit<Product, "id">) => req(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: number) => req(`/api/products/${id}`, { method: "DELETE" }),
  createDaypart: (d: Omit<Daypart, "id">) => req<{ id: number }>("/api/dayparts", { method: "POST", body: JSON.stringify(d) }),
  updateDaypart: (id: number, d: Omit<Daypart, "id">) => req(`/api/dayparts/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDaypart: (id: number) => req(`/api/dayparts/${id}`, { method: "DELETE" }),

  // campaigns
  listCampaigns: () => req<Campaign[]>("/api/campaigns"),
  getCampaign: (id: number) => req<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (c: Partial<Campaign>) => req<{ id: number }>("/api/campaigns", { method: "POST", body: JSON.stringify(c) }),
  updateCampaign: (id: number, c: Partial<Campaign>) => req(`/api/campaigns/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCampaign: (id: number) => req(`/api/campaigns/${id}`, { method: "DELETE" }),

  getBundle: (id: number) => req<CampaignBundle>(`/api/campaigns/${id}/bundle`),
  getBookingOrders: (id: number) => req<BookingOrder[]>(`/api/campaigns/${id}/booking-orders`),
  getSummary: (id: number) => req<CampaignSummary>(`/api/campaigns/${id}/summary`),

  // placements
  createPlacement: (campaignId: number, body: Record<string, unknown>) =>
    req<{ id: number }>(`/api/campaigns/${campaignId}/placements`, { method: "POST", body: JSON.stringify(body) }),
  updatePlacement: (id: number, body: Partial<Placement>) => req(`/api/placements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePlacement: (id: number) => req(`/api/placements/${id}`, { method: "DELETE" }),
  setFlight: (placementId: number, periodKey: string, count: number) =>
    req(`/api/placements/${placementId}/flights`, { method: "PUT", body: JSON.stringify({ periodKey, count }) }),
  setFlightsBulk: (placementId: number, cells: { periodKey: string; count: number }[], clearFirst: boolean) =>
    req(`/api/placements/${placementId}/flights/bulk`, { method: "PUT", body: JSON.stringify({ cells, clearFirst }) }),

  exportUrl: (id: number) => `/api/campaigns/${id}/export.xlsx`,
  bookingOrdersUrl: (id: number) => `/api/campaigns/${id}/booking-orders.xlsx`,
};

export function money(n: number): string {
  return (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
