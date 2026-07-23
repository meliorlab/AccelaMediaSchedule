// Seed reference data parsed from the three sample workbooks.
// These are starting defaults; users can edit everything in the Reference Data UI.

import type { Medium } from "./types";

export interface SeedProduct {
  name: string;
  rackRate: number;
  discountPct: number;
  agencyCommPct: number;
}

export interface SeedOutlet {
  country: string;
  name: string;
  medium: Medium;
  email: string;
  phone: string;
  popularSlots: string;
  products: SeedProduct[];
}

export interface SeedCountry {
  name: string;
  currency: string;
  vatRate: number;
  defaultWireFee: number;
}

export const seedCountries: SeedCountry[] = [
  { name: "Dominica", currency: "XCD", vatRate: 0.15, defaultWireFee: 40 },
  { name: "St. Kitts & Nevis", currency: "XCD", vatRate: 0.17, defaultWireFee: 40 },
  { name: "Saint Lucia", currency: "XCD", vatRate: 0.125, defaultWireFee: 0 },
  { name: "St. Vincent & the Grenadines", currency: "XCD", vatRate: 0.16, defaultWireFee: 40 },
  { name: "St. Maarten", currency: "XCD", vatRate: 0.05, defaultWireFee: 80 },
  { name: "Antigua & Barbuda", currency: "XCD", vatRate: 0.15, defaultWireFee: 40 },
  { name: "Grenada", currency: "XCD", vatRate: 0.15, defaultWireFee: 40 },
  { name: "Anguilla", currency: "XCD", vatRate: 0.0, defaultWireFee: 40 },
];

const D = 0.15; // typical discount off rack
const C = 0.15; // typical agency commission

export const seedOutlets: SeedOutlet[] = [
  // ---- Dominica ----
  {
    country: "Dominica", name: "Marpin2k4", medium: "TV", email: "", phone: "",
    popularSlots: "Evening News", products: [{ name: "30 Sec", rackRate: 150, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Dominica", name: "FLOW", medium: "TV", email: "", phone: "",
    popularSlots: "Prime Time", products: [
      { name: "30 Sec", rackRate: 150, discountPct: D, agencyCommPct: C },
      { name: "45-Sec TVC", rackRate: 185, discountPct: D, agencyCommPct: C },
    ],
  },
  {
    country: "Dominica", name: "DBS Radio", medium: "Radio", email: "dbsradio@cwdom.dm", phone: "",
    popularSlots: "5am - 9am / 12pm - 5pm", products: [{ name: "30 Second Advert", rackRate: 45, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Dominica", name: "Q95 FM", medium: "Radio", email: "q95fmradio@gmail.com", phone: "",
    popularSlots: "5am - 9am / 9am - 12pm", products: [{ name: "30 Second Advert", rackRate: 40, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Dominica", name: "DA Vibes", medium: "Radio", email: "davibes@cwdom.dm", phone: "",
    popularSlots: "Drive Time", products: [{ name: "30 Second Advert", rackRate: 40, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Dominica", name: "The Chronicle", medium: "Press", email: "chroniclereporters2@gmail.com", phone: "767-448-7887",
    popularSlots: "Fri (Wkly)", products: [
      { name: "Full Page, Full Colour", rackRate: 1750, discountPct: D, agencyCommPct: C },
      { name: "Half Page", rackRate: 950, discountPct: D, agencyCommPct: C },
    ],
  },
  {
    country: "Dominica", name: "The Sun", medium: "Press", email: "editorial@sundominica.com", phone: "767-448-4501",
    popularSlots: "Wkly", products: [{ name: "Full Page, Full Colour", rackRate: 1600, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Dominica", name: "Dominica News Online", medium: "Online", email: "dominicanewsonline@gmail.com", phone: "",
    popularSlots: "Facebook / Website", products: [
      { name: "Graphic & Video", rackRate: 47.95, discountPct: 0, agencyCommPct: C },
      { name: "Graphic (1 month)", rackRate: 1200, discountPct: 0, agencyCommPct: C },
    ],
  },

  // ---- St. Kitts & Nevis ----
  {
    country: "St. Kitts & Nevis", name: "ZIZ Channel 5", medium: "TV", email: "abs.news@ab.go.ag", phone: "",
    popularSlots: "7pm - 8pm / Evening News", products: [
      { name: "30 Sec", rackRate: 66, discountPct: D, agencyCommPct: C },
      { name: "45-Sec TVC", rackRate: 130, discountPct: 0.38, agencyCommPct: C },
    ],
  },
  {
    country: "St. Kitts & Nevis", name: "ZIZ 96FM", medium: "Radio", email: "info@freedomskn.com", phone: "",
    popularSlots: "5am - 9am / 12pm - 5pm", products: [{ name: "30 Second Advert", rackRate: 42, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Kitts & Nevis", name: "VON Radio", medium: "Radio", email: "info@vonradio.com", phone: "",
    popularSlots: "5am - 9am", products: [{ name: "30 Second Advert", rackRate: 42, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Kitts & Nevis", name: "SKN Observer", medium: "Press", email: "thesknobserver@yahoo.com", phone: "",
    popularSlots: "Fri (Wkly)", products: [{ name: "Full Page, Spot Colour", rackRate: 1765, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Kitts & Nevis", name: "SKN Vibes", medium: "Online", email: "newsroom@sknvibes.com", phone: "",
    popularSlots: "Facebook / Website", products: [{ name: "Graphic & Video", rackRate: 47.95, discountPct: 0, agencyCommPct: C }],
  },

  // ---- Saint Lucia ----
  {
    country: "Saint Lucia", name: "DBS", medium: "TV", email: "", phone: "",
    popularSlots: "7pm - 8pm / Evening News", products: [
      { name: "30 Sec", rackRate: 240, discountPct: D, agencyCommPct: C },
      { name: "45-Sec TVC", rackRate: 270, discountPct: D, agencyCommPct: C },
    ],
  },
  {
    country: "Saint Lucia", name: "HTS", medium: "TV", email: "", phone: "",
    popularSlots: "7pm - 8pm", products: [{ name: "30 Sec", rackRate: 220, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Saint Lucia", name: "Choice TV", medium: "TV", email: "", phone: "",
    popularSlots: "8pm - 9pm", products: [{ name: "30 Sec", rackRate: 168.75, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Saint Lucia", name: "Hot FM", medium: "Radio", email: "", phone: "",
    popularSlots: "5am - 9am / 9am - 12pm", products: [{ name: "30 Second Advert", rackRate: 55, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Saint Lucia", name: "The Voice", medium: "Press", email: "", phone: "",
    popularSlots: "Sat", products: [{ name: "Full Page, Spot Colour", rackRate: 1670, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Saint Lucia", name: "The Star", medium: "Press", email: "", phone: "",
    popularSlots: "Sat", products: [{ name: "Full Page, Full Colour", rackRate: 1600, discountPct: D, agencyCommPct: C }],
  },

  // ---- St. Vincent & the Grenadines ----
  {
    country: "St. Vincent & the Grenadines", name: "SVG TV", medium: "TV", email: "svgbcnews@vincysurf.com", phone: "",
    popularSlots: "7pm - 8pm / Evening News", products: [
      { name: "30 Sec", rackRate: 51.75, discountPct: D, agencyCommPct: C },
      { name: "45-Sec TVC", rackRate: 85, discountPct: D, agencyCommPct: C },
    ],
  },
  {
    country: "St. Vincent & the Grenadines", name: "HOT 97", medium: "Radio", email: "advertising@hot97svg.com", phone: "",
    popularSlots: "5am - 9am / 12pm - 5pm", products: [{ name: "30 Second Advert", rackRate: 50, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Vincent & the Grenadines", name: "NBC SVG", medium: "Radio", email: "nbcsvgnews@vincysurf.com", phone: "",
    popularSlots: "Drive Time", products: [{ name: "30 Second Advert", rackRate: 48, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Vincent & the Grenadines", name: "Searchlight", medium: "Press", email: "editor@searchlight.vc", phone: "",
    popularSlots: "Fri (Wkly)", products: [{ name: "Full Page, Full Colour", rackRate: 1700, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Vincent & the Grenadines", name: "The News", medium: "Press", email: "news784svg@gmail.com", phone: "",
    popularSlots: "Fri (Wkly)", products: [{ name: "Full Page, Full Colour", rackRate: 1500, discountPct: D, agencyCommPct: C }],
  },

  // ---- St. Maarten ----
  {
    country: "St. Maarten", name: "Cable TV", medium: "TV", email: "", phone: "",
    popularSlots: "Night", products: [{ name: "45-Sec TVC, Mon-Fri", rackRate: 80, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "St. Maarten", name: "The Daily Herald", medium: "Press", email: "", phone: "",
    popularSlots: "Daily", products: [{ name: "Full Page, Spot Colour", rackRate: 2205.48, discountPct: D, agencyCommPct: C }],
  },

  // ---- Antigua & Barbuda ----
  {
    country: "Antigua & Barbuda", name: "Antigua Broadcasting Services (ABS)", medium: "TV", email: "abs.news@ab.go.ag", phone: "",
    popularSlots: "7pm - 8pm", products: [{ name: "30 Sec", rackRate: 120, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Antigua & Barbuda", name: "91.1 Observer Radio", medium: "Radio", email: "editor@antiguaobserver.com", phone: "",
    popularSlots: "7am - 11am", products: [{ name: "30 Second Advert", rackRate: 50, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Antigua & Barbuda", name: "The Daily Observer", medium: "Press", email: "editor@antiguaobserver.com", phone: "",
    popularSlots: "Wkly", products: [{ name: "Full Page, Full Colour", rackRate: 1650, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Antigua & Barbuda", name: "Antigua News Room", medium: "Online", email: "antiguanewsroom@gmail.com", phone: "",
    popularSlots: "Facebook / Website", products: [{ name: "Graphic & Video", rackRate: 47.95, discountPct: 0, agencyCommPct: C }],
  },

  // ---- Grenada ----
  {
    country: "Grenada", name: "Grenada Broadcasting Network", medium: "TV", email: "", phone: "",
    popularSlots: "Evening News", products: [{ name: "30 Sec", rackRate: 130, discountPct: D, agencyCommPct: C }],
  },
  {
    country: "Grenada", name: "Facebook", medium: "Online", email: "", phone: "",
    popularSlots: "Website / Social", products: [
      { name: "Graphic & Video", rackRate: 47.95, discountPct: 0, agencyCommPct: C },
      { name: "Graphic (1 month)", rackRate: 1725, discountPct: 0, agencyCommPct: C },
    ],
  },

  // ---- Anguilla ----
  {
    country: "Anguilla", name: "The Anguillian", medium: "Press", email: "", phone: "",
    popularSlots: "Fri (Wkly)", products: [{ name: "Full Page, Full Colour", rackRate: 2140.92, discountPct: D, agencyCommPct: C }],
  },
];

export const seedClients: string[] = ["Publicis / RFHL", "RBEC", "Accela House"];

/** Starter dayparts/time bands per medium; users can edit/add per media house. */
export function defaultDayparts(medium: Medium): { name: string; time: string }[] {
  if (medium === "TV") {
    return [
      { name: "Evening News", time: "6:00pm - 7:00pm" },
      { name: "Peak-Time", time: "7:00pm - 8:00pm" },
      { name: "Prime Time", time: "8:00pm - 10:00pm" },
      { name: "Daytime", time: "12:00pm - 5:00pm" },
    ];
  }
  if (medium === "Radio") {
    return [
      { name: "Morning", time: "5:00am - 9:00am" },
      { name: "Mid-Morning", time: "9:00am - 12:00pm" },
      { name: "Afternoon", time: "12:00pm - 4:00pm" },
      { name: "Drive Time", time: "4:00pm - 7:00pm" },
    ];
  }
  return [];
}
