# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Kitchen Display System (KDS) for the Toptech/RestoTech restaurant POS. Next.js 15 (App Router) app that reads orders directly from the POS's SQL Server database and shows them on kitchen/dispatch screens. UI text, domain terms, and most commit messages are in Spanish (orden, mesa, mesero, equipo, terminado, resaltado).

## Commands

```
npm run dev     # dev server on localhost:3000
npm run build   # production build
npm start       # serve production build
npm run lint    # next lint (eslint 8, next/core-web-vitals + next/typescript)
```

There are no tests. Requires a `.env` with `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_PORT`, `DB_DATABASE` (SQL Server via `mssql`), plus `TZ=UTC` and `NEXT_PUBLIC_PRIMARY_COLOR` / `NEXT_PUBLIC_SECONDARY_COLOR` / `NEXT_PUBLIC_DONE_COLOR`. Without a reachable database the app renders a connection error; there is no mock mode.

## Architecture

Data flow: client component polls `/api/*` every 15s → route handler → action (raw SQL) → `processOrders` groups flat rows into orders → render.

- `src/actions/` - server-side data access. `db.ts` exports a module-level singleton `ConnectionPool` (`poolPromise`); every action awaits it. Queries are raw T-SQL strings against POS tables (`DetalleCuenta`, `Visitas`, `Productos`, `TiposProductos`, `Impresoras`, `Meseros`, `Mesas`, `TipoEnvios`, `ParaLlevar`, `Observaciones`, `ProductosCombos`, `KDS_Snooze`). Reads interpolate `nombreEquipo` and date bounds into the string; writes (`actualizarOrden.ts`, `atributosDeOrden.ts`) use parameterized `.input()` calls.
- `src/app/api/` - thin route handlers. `/api/ordenes` overloads HTTP verbs: GET fetch, PUT mark item or whole order `Terminado`, POST snooze, DELETE unsnooze, PATCH highlight. PUT dispatches on body shape: `detalleCuentaId` = single item, `idVisita`+`idOrden` = whole order.
- `src/utils/processOrders.ts` - the DB returns one row per product; this groups rows by (`id` [VisitaID], `orden`) into `Orden` objects with `Producto[]` and parses the comma-joined `productosCombo` string into combo counts (commas inside product names are pre-replaced with `.` in SQL via `REPLACE`).
- `src/app/(pages)/(orders)/(components)/Orders.tsx` - the main screen. All display settings live in `localStorage` (`equipo`, `conDesglose`, `columns`, `rows`, `enableSnooze`, `snoozeType`); if `equipo` is unset it redirects to `/config`. Plays sounds on new order/completion, masonry card grid, `columns*rows` = fetch limit.
- `/history` page shows today's completed/deleted items for the selected equipo.

### The "equipo" concept

Each physical screen is an "equipo" selected on `/config`. Normal equipos map to `Impresoras.NombreFisico` (where `esMonitorDigital = 1`) and filter products by `TiposProductos.kitchenDisplayID`. Four hardcoded pseudo-equipos in `getEquipos.ts` change the SQL shape in `getOrdenesSeparado.ts` / `getHistory.ts`:

- `DespachoToptech` - all products, no printer filter
- `DespachoToptechDelivery` - only `Visitas.MesaID IS NULL`
- `DespachoToptechMesa` - only `Visitas.MesaID IS NOT NULL`
- `VisorCliente` - customer-facing display; entirely different query showing fully finished orders (all items `Terminado`), no snooze/highlight

`actualizarOrden.ts` also branches on `nombreEquipo.startsWith('DespachoToptech')`: despacho screens update without the printer join, normal screens only update rows matching their printer.

### Snooze and highlight

Persisted in the `KDS_Snooze` table (`VisitaID`, `Orden`, `Snoozed`, `Resaltado`) with upsert-style `IF EXISTS` SQL. Two display modes (`SnoozeType` in `src/contants/snoozeType.ts` - note the folder is misspelled "contants", keep it): `separado` returns `{ mainOrders, snoozedOrders }` and shows snoozed orders in a modal; `enCola` (`getOrdenesEnCola.ts`) keeps them in the main list re-ordered to the back. Client detects a snoozed card by `newOrder !== orden`.

### Time handling

Business timezone is hardcoded `America/La_Paz` (moment-timezone) for day bounds and `Terminado` timestamps, while `.env` sets `TZ=UTC` and the mssql pool uses `useUTC: false`. `hora` values get `.replace('Z', '')` on the client before feeding the elapsed-time timer. Be careful changing anything here; it is deliberately balanced.

## Deployment

On-prem Windows machines, not Vercel. `runSetup.bat` → `setup.js` prompts for the DB connection, writes `.env`, builds, and starts PM2 (`pm2.json`, 4 cluster instances). A Windows Scheduled Task (`Pedidos App Tarea Programada.xml` → `tareaProgramada.bat`) runs `pm2 resurrect` at boot. `Instrucciones.txt` and `en Raiz/` hold the installer instructions/files shipped to clients. Root also contains a Node MSI and a zip used for installs; leave them alone.

## Conventions

- Path alias `@/*` → `src/*`. shadcn/ui (new-york style) in `src/components/ui/`, Tailwind, lucide icons, sonner toasts.
- Interfaces in `src/interfaces/`: `OrdenDb` is the flat SQL row, `Orden`/`Producto`/`ProductoCombo` the grouped shape.
- `borrada` and `terminado` items stay in the payload and are rendered struck-through, not filtered out.
