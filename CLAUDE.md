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

### Kitchen stations and "cortes" (2026-08)

A display can also be a **cocina station** instead of an equipo: `/config` lists active
`CocinaEstaciones` rows (POS tables `Cocina*`) in a second select group, stored in
`localStorage.equipo` as the literal marker `estacion:<EstacionCocinaID>`.
`PantallaPrincipal.tsx` routes the home page: marker → `EstacionView` (passive viewer,
one stacked section per "corte": header with the station's aggregate (components, or
products when `MostrarProductos=1`) + timer, inside one card per pedido always showing
that station's products (combo children included, counted per `ProductosCombos` row;
per-pedido fallback to components), plus a grey dashed "En espera" section for orders
after the last separator); anything else → `OrdersPage` unchanged.

A **corte** is derived, never stored: ALL of today's pending orders sorted by hour,
where painting (`KDS_Snooze.Resaltado=1`) acts as a **separator** — each painted
order closes the corte made of itself plus the unpainted orders before it; whatever
follows the last separator is the "en espera" group (grey dashed card in
`EstacionView`). Capacity never splits a corte, it only flags `excedido` as a
warning (`src/utils/derivarCortes.ts`, pure; sanity script
`scripts/test-derivarCortes.ts` run via `npx -y tsx`). All data access lives in
`src/actions/getCocina.ts` (station list with `COL_LENGTH` guard for
`MostrarProductos`, load queries, `getResumenPintado`). Endpoints:
`GET /api/estaciones`, `GET /api/estaciones/carga?estacion=N`. The PATCH highlight
handler returns `{message, resumen}` describing the corte the paint just closed
("Corte cerrado con N órdenes"); the client shows `CorteResumenDialog` (semaforo
header, capacity bars, `N / ∞` for unlimited, 10 s auto-close). If the POS lacks
the `Cocina*` tables everything degrades silently to pre-feature behavior
(`resumen: null`, empty station list). Design doc:
`docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md`.

**Gotcha:** never run `npm run build` while `next dev` is serving — both write `.next/`
and the dev server ends up referencing deleted chunks (blank page, `Cannot find module
'./NNN.js'`). Kill the server on :3000, delete `.next`, restart.

### Inventario (conteos y ajustes) (2026-08)

`/config` acepta un tercer tipo de pantalla además de equipos y estaciones:
`localStorage.equipo = 'inventario'` (constante `EQUIPO_INVENTARIO`), y
`PantallaPrincipal.tsx` enruta ese marcador a `InventarioApp`, así una tablet abre
directo el módulo.

`/inventario` es una app mobile-first, independiente del `equipo`: conteo físico de
stock que se aplica como **ajuste en las tablas del POS**. Auth **stateless por PIN**:
no hay sesión ni cookie — el PIN viaja en cada request (header `x-kds-pin` en los GET,
campo `pin` del body en las mutaciones), se valida contra `Meseros` (`Contrasenha` si es
numérico, o `Codigo`) con igualdad exacta y nunca se guarda en `localStorage` ni se
loguea; la backdoor del POS `15071507` se rechaza antes de tocar la BD. En el cliente
(`InventarioApp.tsx`) el PIN vive solo en `useState` y se borra a los 10 min de
inactividad; aplicar y anular exigen re-tecleo del PIN.

Ciclo de vida en tablas propias `KDS_Conteos` / `KDS_ConteoDetalles` (creadas al vuelo por
`src/actions/inventario/schema.ts`, mismo enfoque que `KDS_Snooze`), estados
`abierto → revision → aplicado | anulado`. Cada transición es un `UPDATE ... WHERE
Estado='<origen>'`: `rowsAffected = 0` significa que otro request ganó la carrera.
**Modelo delta con snapshot**: al capturar un producto se guarda `StockSnapshot` (el
`Productos.Stock<N>` del momento, leído en el mismo batch SQL); al aplicar se escribe
`delta = contado − snapshot`, así las ventas que ocurren durante el conteo no se pisan
(la UI marca esas filas como "deriva"). `aplicarConteo.ts` corre todo en **una
transacción**: gate de estado, `INSERT Ajustes`, `INSERT DetallesAjustes`,
`UPDATE Productos.Stock<N>`, `AjusteID` cruzado; la bitácora `Logg` va fuera (best
effort). El único valor interpolado en SQL es `Stock<N>` con el `AlmacenID` entero de la
cabecera; todo lo demás es `.input()` parametrizado.

Roles hardcodeados en `src/contants/inventario.ts` por `Meseros.TipoUsuarioID`: contar =
1/7/8 (admin, supervisor, almacenero); ver diferencias, aplicar y reabrir = 1/7. La
captura es **ciega** para quien no ve diferencias: el payload viaja con
`stockSnapshot`/`stockVivo`/`costo` en 0 y `ProductoContable.stock` en `null`; para
1/7 la fila muestra el stock del sistema y la diferencia.

Tres cosas que no son obvias leyendo el código:

- **Cola de reintento en la captura.** Un `PUT` de captura que falla por red o 5xx se
  encola y se reintenta con backoff (2/4/8/15 s) y al evento `online`. Los 4xx NO se
  encolan: repetirlos no los arregla. La cola se indexa por producto y cada captura
  lleva un `seq`, para que un reintento viejo no pise una cantidad más nueva. El
  `PUT` del servidor es `UPDATE` + `IF @@ROWCOUNT = 0 INSERT`, con reintento ante
  2627/2601, y el `UNIQUE (ConteoID, ProductoID)` como red final. No se puede cerrar
  un conteo con capturas pendientes.
- **Copiar un conteo anterior.** `copiarDetalles` clona productos y cantidades, pero
  toma el `StockSnapshot` de HOY — heredarlo mediría el delta contra el stock de ayer.
  Las filas quedan con `Copiado = 1` (columna agregada por un `ALTER` guardado con
  `COL_LENGTH` dentro de `ensureTablasConteo`) hasta que alguien las recuenta; la
  revisión las lista aparte porque **se aplican igual** aunque nadie las haya mirado.
- **Presentación, no `UnidadContenido`.** La unidad que se muestra y en la que se
  cuenta es `Productos.Presentacion`. En las bases relevadas `UnidadContenido` repite
  a `Presentacion` en la mayoría de los productos y donde difiere es el empaque de
  compra (ARROBA, CAJA), que induce a contar en la unidad equivocada. Degradación grácil como en `getCocina.ts`:
error SQL 208 (tabla ausente) → lista vacía y el sheet de alta avisa que el POS no tiene
almacenes; `TiposProductos.NoVendibles` y `Productos.CostoBruto` se resuelven con
`COL_LENGTH`. El escáner (`EscanerCodigo.tsx`) baja en 3 capas: `BarcodeDetector` nativo →
`@zxing/browser` → foto con `<input capture>` (la cámara en vivo pide HTTPS o el flag de
Chrome documentado en `en Raiz/Instrucciones.txt`); un lector USB/bluetooth funciona
siempre con Enter en el buscador. Lógica pura de deltas/valorizado en
`src/utils/conteoInventario.ts`, con sanidad en `scripts/test-conteoInventario.ts`
(`npx -y tsx`). Spec: `docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md`.

### Snooze and highlight

Persisted in the `KDS_Snooze` table (`VisitaID`, `Orden`, `Snoozed`, `Resaltado`) with upsert-style `IF EXISTS` SQL. Two display modes (`SnoozeType` in `src/contants/snoozeType.ts` - note the folder is misspelled "contants", keep it): `separado` returns `{ mainOrders, snoozedOrders }` and shows snoozed orders in a modal; `enCola` (`getOrdenesEnCola.ts`) keeps them in the main list re-ordered to the back. Client detects a snoozed card by `newOrder !== orden`.

### Time handling

Business timezone is hardcoded `America/La_Paz` (moment-timezone) for day bounds and `Terminado` timestamps, while `.env` sets `TZ=UTC` and the mssql pool uses `useUTC: false`. `hora` values get `.replace('Z', '')` on the client before feeding the elapsed-time timer. Be careful changing anything here; it is deliberately balanced.

### PWA (2026-08)

`src/app/manifest.ts` (servido en `/manifest.webmanifest`), `public/sw.js` y
`RegistrarServiceWorker.tsx` hacen el KDS instalable. El service worker **solo se
registra en producción y en contexto seguro**: en `next dev` los chunks de
`/_next/static` cambian en cada recompilación y cachearlos reproduce el bug de
"Cannot find module './NNN.js'". Nunca cachea `/api/` — un pedido o un stock viejo es
peor que un error. Navegación: red primero, cache solo si la red falla. Por HTTP plano
Chrome no registra service workers ni ofrece instalar: hace falta HTTPS o el flag
`unsafely-treat-insecure-origin-as-secure`, el mismo que ya pide la cámara del escáner.

## Deployment

On-prem Windows machines, not Vercel. `runSetup.bat` → `setup.js` prompts for the DB connection, writes `.env`, builds, and starts PM2 (`pm2.json`, 4 cluster instances). A Windows Scheduled Task (`Pedidos App Tarea Programada.xml` → `tareaProgramada.bat`) runs `pm2 resurrect` at boot. `Instrucciones.txt` and `en Raiz/` hold the installer instructions/files shipped to clients. Root also contains a Node MSI and a zip used for installs; leave them alone.

## Conventions

- Path alias `@/*` → `src/*`. shadcn/ui (new-york style) in `src/components/ui/`, Tailwind, lucide icons, sonner toasts.
- Interfaces in `src/interfaces/`: `OrdenDb` is the flat SQL row, `Orden`/`Producto`/`ProductoCombo` the grouped shape.
- `borrada` and `terminado` items stay in the payload and are rendered struck-through, not filtered out.
