# Accela Media Schedule Builder

A local web app for building advertising **media schedules & booking orders** across Caribbean
media houses (TV, Radio, Press, Online), with auto-computed financials and one-click export to
template-accurate Excel workbooks (`MS & BOs`).

Reverse-engineered from the source workbooks (Publicis/RFHL, RBEC PMAD, RBEC Christmas Press).

## Features

- **Reference data**: countries with VAT rate / wire fee / currency, media houses per medium with
  contacts and popular slots, and per-outlet rate cards (rack rate, discount %, agency commission %).
- **Campaigns**: client, placement period, flighting grid mode (daily or weekly), and FX rate.
- **Flighting grid editor**: click a calendar cell to add a spot (+1), right-click to remove (-1);
  costs and wire fees are editable inline. Totals recompute live.
- **Two views**: `CLIENT` (marked-up) and `ACCELA` (net cost + margin).
- **Booking Orders**: one per outlet — rack → discount → agency commission → VAT → grand total.
- **Rollups**: Summary and Master Budget by medium and country (XCD + USD).
- **Excel export**: multi-sheet workbook (Popular Media Houses, Media Contact List, per-medium
  schedules, CLIENT, ACCELA, one Booking Order per outlet, Summary Sheet, Master Budget).

## Architecture

| Package  | Stack                                            | Purpose                              |
| -------- | ------------------------------------------------ | ------------------------------------ |
| `shared` | TypeScript                                       | Domain types, financial calc, seeds  |
| `server` | Express + Node built-in SQLite (`node:sqlite`) + ExcelJS | REST API, persistence, Excel export |
| `web`    | Vite + React + TypeScript + Tailwind v4          | UI                                   |

The SQLite database is created automatically at `server/data/media-schedules.db` and seeded with
reference data on first run. No native build step is required.

## Getting started

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4000

`npm run dev` runs the API and web dev server together. The web dev server proxies `/api` to the
API. You can also run them separately with `npm run dev:server` and `npm run dev:web`.

## Financial model

```
subTotal            = clientUnitCost * insertions
tax                 = subTotal * country.vatRate
grandTotal          = subTotal + tax
grandTotalWithWire  = grandTotal + wireFee
usd                 = grandTotalWithWire / campaign.fxRate
agencyUnitCost      = clientUnitCost * (1 - agencyCommission)   // Accela net
```

Booking order per outlet:

```
subTotal      = discountedRate * insertions
agencyComm    = -subTotal * agencyCommission
netSubTotal   = subTotal + agencyComm
vat           = netSubTotal * country.vatRate
grandTotal    = netSubTotal + vat
```
