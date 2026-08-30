# Módulo de Inventario (Conteo y Ajuste) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conteo físico de inventario desde celular/tablet en el KDS, aplicado como ajuste en las tablas del POS Restotech dentro de una transacción.

**Architecture:** Ciclo de vida del conteo en tablas propias `KDS_Conteos`/`KDS_ConteoDetalles`; al aplicar se escribe `Ajustes` + `DetallesAjustes` + `UPDATE Productos.Stock<N>` (modelo delta con snapshot por producto al capturar). Auth stateless: PIN validado contra `Meseros` en cada request. UI mobile-first en `/inventario` según mockups del spec §14.

**Tech Stack:** Next.js 15 App Router, React 18, mssql, Tailwind + shadcn (ui existente), moment-timezone. `@zxing/browser` recién en la Tarea 15.

**Spec:** `docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md` (leerlo entero antes de cualquier tarea).

## Global Constraints

- UI y mensajes de error en español; términos del dominio: conteo, almacén, captura, revisión, aplicar, anular.
- Carpeta de constantes es `src/contants/` (mal escrita a propósito — NO corregir).
- Timestamps de escritura: `moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')` exacto (patrón `actualizarOrden.ts:24-26`).
- SQL SIEMPRE parametrizado con `.input()`; lo único interpolado en strings SQL son enteros ya validados con `Number.isInteger` (`almacenId` en nombres de columna `Stock<N>`).
- El PIN jamás se escribe en `console.*`, en logs ni en `localStorage`.
- La backdoor `15071507` se rechaza antes de consultar la BD.
- Degradación grácil patrón `getCocina.ts`: error SQL `number === 208` (tabla inexistente) → respuesta vacía, módulo oculto.
- NUNCA correr `npm run build` con `next dev` activo (gotcha de CLAUDE.md). Verificación por tarea: `npx tsc --noEmit`. Build completo una sola vez al final de todo (Tarea 14).
- Sin framework de tests en el repo: la lógica pura se verifica con scripts `npx -y tsx scripts/...` (precedente `scripts/test-derivarCortes.ts`).
- Commits en español, prefijo `inventario:`.
- Usar la herramienta Bash (no PowerShell) y agrupar comandos (preferencia global del usuario).

## Estructura de archivos (mapa completo)

```
src/interfaces/Inventario.ts                      tipos de todo el módulo
src/contants/inventario.ts                        roles y estados
src/utils/conteoInventario.ts                     lógica pura (deltas, deriva, valorizado)
scripts/test-conteoInventario.ts                  sanidad de la lógica pura
src/actions/inventario/schema.ts                  creación idempotente de tablas KDS
src/actions/inventario/validarPin.ts              auth stateless
src/actions/inventario/getAlmacenes.ts            almacenes internos visibles
src/actions/inventario/getProductosContables.ts   catálogo contable (ciego según rol)
src/actions/inventario/conteos.ts                 crear / listar / detalle / upsert captura
src/actions/inventario/transiciones.ts            cerrar / reabrir / anular
src/actions/inventario/aplicarConteo.ts           transacción de aplicación
src/app/api/inventario/sesion/route.ts
src/app/api/inventario/almacenes/route.ts
src/app/api/inventario/conteos/route.ts           GET lista, POST crear
src/app/api/inventario/conteos/[id]/route.ts      GET detalle
src/app/api/inventario/conteos/[id]/detalles/route.ts   PUT upsert
src/app/api/inventario/conteos/[id]/cerrar/route.ts
src/app/api/inventario/conteos/[id]/reabrir/route.ts
src/app/api/inventario/conteos/[id]/anular/route.ts
src/app/api/inventario/conteos/[id]/aplicar/route.ts
src/app/(pages)/inventario/page.tsx               entry, solo renderiza InventarioApp
src/app/(pages)/inventario/(components)/InventarioApp.tsx    orquestador + PIN en memoria
src/app/(pages)/inventario/(components)/PinGate.tsx
src/app/(pages)/inventario/(components)/TecladoNumerico.tsx  compartido PIN/cantidad
src/app/(pages)/inventario/(components)/ListaConteos.tsx
src/app/(pages)/inventario/(components)/NuevoConteoSheet.tsx
src/app/(pages)/inventario/(components)/CapturaConteo.tsx
src/app/(pages)/inventario/(components)/RevisionConteo.tsx
src/app/(pages)/inventario/(components)/EscanerCodigo.tsx    (Tarea 15)
src/components/SideMenu.tsx                       modificar: link Inventario
CLAUDE.md                                         modificar: sección del módulo
en Raiz/Instrucciones.txt                         modificar: flag de cámara (Tarea 15)
```

Paleta (de `CorteResumenDialog.tsx`, reutilizar literales): VERDE `#80a76e`, AMBAR `#eac568`, ROJO `#d17f7f`, GRIS `#626e78`, TINTA `#2c3236`, fondo `#eef0f1`. Variantes de texto sobre blanco: verde `#5d8a4a`, rojo `#b85c5c`.

---

### Task 1: Tipos y constantes de roles

**Files:**
- Create: `src/interfaces/Inventario.ts`
- Create: `src/contants/inventario.ts`

**Interfaces:**
- Produces: todos los tipos del módulo y los helpers de rol que consumen las tareas 2-15.

- [ ] **Step 1: Crear `src/contants/inventario.ts`**

```ts
// Roles hardcodeados del modulo de inventario (spec 2026-08-30, seccion 5).
// TipoUsuarioID viene de Meseros.TipoUsuarioID del POS (enum en ctlMeseros.vb).
export const TIPO_USUARIO = {
  administrador: 1,
  cajero: 3,
  supervisor: 7,
  almacenero: 8,
  contador: 13
} as const

const ROLES_CONTAR = [1, 7, 8]
const ROLES_SUPERVISAR = [1, 7]

export const puedeContar = (tipo: number) => ROLES_CONTAR.includes(tipo)
export const puedeVerDiferencias = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
export const puedeAplicar = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
export const puedeReabrir = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
// Anular: supervisores siempre; el dueño solo mientras el conteo esta abierto.
export const puedeAnular = (tipo: number, esDueno: boolean, estado: string) =>
  ROLES_SUPERVISAR.includes(tipo) || (esDueno && estado === 'abierto')

export const ESTADOS_CONTEO = ['abierto', 'revision', 'aplicado', 'anulado'] as const
export type EstadoConteo = (typeof ESTADOS_CONTEO)[number]
```

- [ ] **Step 2: Crear `src/interfaces/Inventario.ts`**

```ts
// Modulo de inventario (conteo y ajuste). Spec:
// docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md
import { EstadoConteo } from '@/contants/inventario'

export interface SesionInventario {
  meseroId: number
  nombre: string
  tipoUsuarioId: number
}

export interface AlmacenInventario {
  almacenId: number
  nombre: string
}

export interface ProductoContable {
  productoId: number
  nombre: string
  codigo: string // Productos.Codigo = codigo de barras; puede ser ''
  presentacion: string
  unidad: string // Productos.UnidadContenido; '' si no tiene
  tipoProducto: string // TiposProductos.Descripcion para agrupar
}

export interface ConteoResumen {
  conteoId: number
  almacenId: number
  almacenNombre: string
  noVendibles: boolean
  estado: EstadoConteo
  meseroId: number
  meseroNombre: string
  observacion: string
  fechaCreacion: string
  fechaAplicacion: string | null
  ajusteId: number | null
  contados: number // filas en KDS_ConteoDetalles
}

// Fila cruda de KDS_ConteoDetalles + joins (sufijo Db, patron OrdenDb).
export interface ConteoDetalleDb {
  productoId: number
  nombre: string
  unidad: string
  tipoProducto: string
  cantidadContada: number
  stockSnapshot: number // solo llega si el rol ve diferencias
  stockVivo: number // idem
  costo: number // idem
  observacion: string
  fechaConteo: string
}

export interface ConteoCompleto {
  conteo: ConteoResumen
  detalles: ConteoDetalleDb[]
  // true cuando el payload trae stockSnapshot/stockVivo/costo reales
  conDiferencias: boolean
}

export interface FilaRevision extends ConteoDetalleDb {
  delta: number // cantidadContada - stockSnapshot, redondeado a 3
  deriva: boolean // stockVivo !== stockSnapshot
  valor: number // delta * costo, redondeado a 2
}

export interface ResumenRevision {
  filas: FilaRevision[]
  sobrante: number // suma de valor > 0
  faltante: number // suma de valor < 0 (negativo)
  neto: number
}

export interface ResultadoAplicar {
  ok: boolean
  ajusteId: number | null
  mensaje: string
}
```

- [ ] **Step 3: Verificar compilación y commit**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (los preexistentes del repo, si los hay, se anotan y no se tocan).

```bash
git add src/interfaces/Inventario.ts src/contants/inventario.ts
git commit -m "inventario: tipos y roles del modulo de conteo"
```

---

### Task 2: Lógica pura de revisión + script de sanidad

**Files:**
- Create: `src/utils/conteoInventario.ts`
- Create: `scripts/test-conteoInventario.ts`

**Interfaces:**
- Consumes: `ConteoDetalleDb`, `FilaRevision`, `ResumenRevision` de `@/interfaces/Inventario`.
- Produces: `derivarRevision(detalles: ConteoDetalleDb[]): ResumenRevision` — la consumen `RevisionConteo.tsx` (Tarea 13) y `aplicarConteo.ts` (Tarea 12) para los deltas.

- [ ] **Step 1: Escribir el script de sanidad (falla primero)**

```ts
// scripts/test-conteoInventario.ts — correr con: npx -y tsx scripts/test-conteoInventario.ts
import { derivarRevision } from '../src/utils/conteoInventario'
import { ConteoDetalleDb } from '../src/interfaces/Inventario'

let fallas = 0
const check = (nombre: string, cond: boolean) => {
  if (!cond) {
    fallas++
    console.error(`FALLA: ${nombre}`)
  } else console.log(`ok: ${nombre}`)
}

const base: Omit<ConteoDetalleDb, 'productoId' | 'cantidadContada' | 'stockSnapshot' | 'stockVivo' | 'costo'> = {
  nombre: 'x',
  unidad: 'und',
  tipoProducto: 'Bebidas',
  observacion: '',
  fechaConteo: '2026-08-30 18:20:00'
}

const detalles: ConteoDetalleDb[] = [
  // faltante: contado 24, sistema 27, costo 10 -> delta -3, valor -30
  { ...base, productoId: 1, cantidadContada: 24, stockSnapshot: 27, stockVivo: 27, costo: 10 },
  // sobrante con deriva: contado 35, snapshot 31, vivo 29 -> delta +4, deriva true
  { ...base, productoId: 2, cantidadContada: 35, stockSnapshot: 31, stockVivo: 29, costo: 5 },
  // sin diferencia: delta 0, valor 0
  { ...base, productoId: 3, cantidadContada: 18, stockSnapshot: 18, stockVivo: 18, costo: 7 },
  // decimales: 9 - 12.5 = -3.5, costo 2 -> -7
  { ...base, productoId: 4, cantidadContada: 9, stockSnapshot: 12.5, stockVivo: 12.5, costo: 2 }
]

const r = derivarRevision(detalles)
check('4 filas', r.filas.length === 4)
check('delta faltante', r.filas[0].delta === -3)
check('delta sobrante', r.filas[1].delta === 4)
check('deriva solo en fila 2', !r.filas[0].deriva && r.filas[1].deriva && !r.filas[2].deriva)
check('delta cero', r.filas[2].delta === 0 && r.filas[2].valor === 0)
check('delta decimal redondeado a 3', r.filas[3].delta === -3.5)
check('sobrante = +20', r.sobrante === 20)
check('faltante = -37', r.faltante === -37)
check('neto = -17', r.neto === -17)
// flotantes sucios: 0.1 + 0.2
const sucio = derivarRevision([
  { ...base, productoId: 5, cantidadContada: 0.3, stockSnapshot: 0.1, stockVivo: 0.1, costo: 1 }
])
check('redondeo flotante', sucio.filas[0].delta === 0.2)

if (fallas > 0) {
  console.error(`${fallas} fallas`)
  process.exit(1)
}
console.log('sanidad OK')
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx -y tsx scripts/test-conteoInventario.ts`
Expected: FALLA por módulo inexistente (`Cannot find module '../src/utils/conteoInventario'`).

- [ ] **Step 3: Implementar `src/utils/conteoInventario.ts`**

```ts
// Logica pura de revision de conteos: sin BD, sin fetch. Spec seccion 7.
import { ConteoDetalleDb, FilaRevision, ResumenRevision } from '@/interfaces/Inventario'

// Mismo redondeo que usa el POS en sus reportes de ajuste (ROUND(...,3)).
const redondear3 = (n: number) => Math.round(n * 1000) / 1000
const redondear2 = (n: number) => Math.round(n * 100) / 100

export function derivarRevision(detalles: ConteoDetalleDb[]): ResumenRevision {
  const filas: FilaRevision[] = detalles.map((d) => {
    const delta = redondear3(d.cantidadContada - d.stockSnapshot)
    return {
      ...d,
      delta,
      deriva: d.stockVivo !== d.stockSnapshot,
      valor: redondear2(delta * d.costo)
    }
  })
  let sobrante = 0
  let faltante = 0
  for (const f of filas) {
    if (f.valor > 0) sobrante += f.valor
    else faltante += f.valor
  }
  sobrante = redondear2(sobrante)
  faltante = redondear2(faltante)
  return { filas, sobrante, faltante, neto: redondear2(sobrante + faltante) }
}
```

- [ ] **Step 4: Correr sanidad y tsc, commit**

Run: `npx -y tsx scripts/test-conteoInventario.ts && npx tsc --noEmit`
Expected: `sanidad OK`, tsc limpio.

```bash
git add src/utils/conteoInventario.ts scripts/test-conteoInventario.ts
git commit -m "inventario: logica pura de revision con script de sanidad"
```

---

### Task 3: Creación idempotente de tablas KDS

**Files:**
- Create: `src/actions/inventario/schema.ts`

**Interfaces:**
- Consumes: `getPool` de `src/actions/db.ts`.
- Produces: `ensureTablasConteo(): Promise<void>` — la llaman todas las actions de escritura de conteos (Tareas 7, 11, 12) antes de tocar `KDS_*`.

- [ ] **Step 1: Implementar**

```ts
import { getPool } from '../db'

// Igual enfoque que KDS_Snooze: el KDS crea sus propias tablas al primer uso.
// Sin FKs fisicas hacia tablas POS (estilo de la BD del POS).
let creadas = false

export async function ensureTablasConteo(): Promise<void> {
  if (creadas) return
  const pool = await getPool()
  await pool.request().query(`
    IF OBJECT_ID('KDS_Conteos', 'U') IS NULL
    CREATE TABLE KDS_Conteos (
      ConteoID int IDENTITY(1,1) PRIMARY KEY,
      AlmacenID int NOT NULL,
      NoVendibles bit NOT NULL,
      Estado varchar(10) NOT NULL,
      MeseroID int NOT NULL,
      Observacion varchar(500) NULL,
      FechaCreacion datetime NOT NULL,
      FechaAplicacion datetime NULL,
      AplicadoPorMeseroID int NULL,
      FechaAnulacion datetime NULL,
      AnuladoPorMeseroID int NULL,
      AjusteID int NULL
    );
    IF OBJECT_ID('KDS_ConteoDetalles', 'U') IS NULL
    CREATE TABLE KDS_ConteoDetalles (
      ConteoDetalleID int IDENTITY(1,1) PRIMARY KEY,
      ConteoID int NOT NULL,
      ProductoID int NOT NULL,
      CantidadContada float NOT NULL,
      StockSnapshot float NOT NULL,
      FechaConteo datetime NOT NULL,
      Observacion varchar(500) NULL,
      CONSTRAINT UQ_KDS_ConteoDetalles UNIQUE (ConteoID, ProductoID)
    );
  `)
  creadas = true
}
```

- [ ] **Step 2: tsc y commit**

Run: `npx tsc --noEmit`

```bash
git add src/actions/inventario/schema.ts
git commit -m "inventario: creacion idempotente de KDS_Conteos y KDS_ConteoDetalles"
```

---

### Task 4: validarPin + endpoint de sesión

**Files:**
- Create: `src/actions/inventario/validarPin.ts`
- Create: `src/app/api/inventario/sesion/route.ts`

**Interfaces:**
- Produces: `validarPin(pin: string): Promise<SesionInventario | null>` — la usan TODAS las rutas API del módulo. `POST /api/inventario/sesion` body `{ pin }` → 200 `SesionInventario` | 401 `{ error }`.

- [ ] **Step 1: Implementar `validarPin.ts`**

```ts
import sql from 'mssql'
import { getPool } from '../db'
import { SesionInventario } from '@/interfaces/Inventario'

// Auth stateless del modulo de inventario. Valida contra Meseros en CADA request.
// - Igualdad exacta (nunca LIKE: el login del POS es inyectable por ahi).
// - La backdoor del POS (15071507) NO entra por web.
// - El PIN jamas se loguea.
export async function validarPin(pin: string): Promise<SesionInventario | null> {
  const limpio = (pin ?? '').trim()
  if (limpio.length === 0 || limpio.length > 50) return null
  if (limpio === '15071507') return null

  try {
    const pool = await getPool()
    const req = pool.request().input('codigo', sql.VarChar, limpio)
    // Contrasenha es int en el POS: solo comparable si el PIN es numerico corto.
    const esPinNumerico = /^[1-9]\d{0,8}$/.test(limpio)
    let where = 'Activo = 1 AND Codigo = @codigo'
    if (esPinNumerico) {
      req.input('pin', sql.Int, parseInt(limpio, 10))
      where = 'Activo = 1 AND (Contrasenha = @pin OR Codigo = @codigo)'
    }
    const result = await req.query(
      `SELECT TOP 1 MeseroID, Nombre, TipoUsuarioID FROM Meseros WHERE ${where}`
    )
    if (result.recordset.length === 0) return null
    const fila = result.recordset[0]
    return {
      meseroId: fila.MeseroID,
      nombre: fila.Nombre ?? '',
      tipoUsuarioId: fila.TipoUsuarioID ?? 0
    }
  } catch (error) {
    console.error('Error al validar credenciales de inventario:', error)
    throw new Error('No se pudo validar el usuario')
  }
}
```

- [ ] **Step 2: Implementar `sesion/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { validarPin } from '@/actions/inventario/validarPin'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'

export async function POST(request: Request) {
  try {
    const { pin } = await request.json()
    if (typeof pin !== 'string') {
      return NextResponse.json({ error: 'pin es requerido' }, { status: 400 })
    }
    const sesion = await validarPin(pin)
    if (!sesion) {
      return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 })
    }
    if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso para inventario' }, { status: 403 })
    }
    return NextResponse.json(sesion, { status: 200 })
  } catch (error) {
    console.error('Error en sesion de inventario:', error)
    return NextResponse.json({ error: 'Error al validar la sesión' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verificar en vivo, tsc y commit**

Con `next dev` corriendo (o levantarlo):
Run: `curl -s -X POST http://localhost:3000/api/inventario/sesion -d "{\"pin\":\"15071507\"}"`
Expected: `{"error":"Código incorrecto"}` (backdoor bloqueada).
Run con un código real de la BD de desarrollo: 200 con `{meseroId, nombre, tipoUsuarioId}`.
Run: `npx tsc --noEmit`

```bash
git add src/actions/inventario/validarPin.ts src/app/api/inventario/sesion/route.ts
git commit -m "inventario: validarPin stateless y endpoint de sesion (backdoor bloqueada)"
```

---

### Task 5: Almacenes internos visibles

**Files:**
- Create: `src/actions/inventario/getAlmacenes.ts`
- Create: `src/app/api/inventario/almacenes/route.ts`

**Interfaces:**
- Consumes: `validarPin`.
- Produces: `getAlmacenes(meseroId: number): Promise<AlmacenInventario[]>`. `GET /api/inventario/almacenes` con header `x-kds-pin` → 200 lista (vacía si el POS no tiene tabla `Almacenes`: módulo apagado).

- [ ] **Step 1: Implementar `getAlmacenes.ts`**

```ts
import sql from 'mssql'
import { getPool } from '../db'
import { AlmacenInventario } from '@/interfaces/Inventario'

// Solo almacenes internos (Interno=1: tienen columna Productos.Stock<N>),
// filtrados con la regla del POS: ResponsableID 0 = todos lo ven.
export async function getAlmacenes(meseroId: number): Promise<AlmacenInventario[]> {
  try {
    const pool = await getPool()
    const result = await pool
      .request()
      .input('meseroId', sql.Int, meseroId)
      .query(`
        SELECT AlmacenID, Nombre
        FROM Almacenes
        WHERE Interno = 1
          AND (COALESCE(ResponsableID, 0) = 0 OR ResponsableID = @meseroId)
        ORDER BY Nombre
      `)
    return result.recordset.map((f) => ({
      almacenId: f.AlmacenID,
      nombre: f.Nombre ?? `Almacén ${f.AlmacenID}`
    }))
  } catch (error) {
    // 208 = tabla inexistente (POS sin modulo de almacenes): modulo apagado.
    const err = error as { number?: number }
    if (err.number === 208) return []
    console.error('Error al obtener almacenes:', error)
    throw new Error('No se pudieron obtener los almacenes')
  }
}
```

- [ ] **Step 2: Implementar `almacenes/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { validarPin } from '@/actions/inventario/validarPin'
import { getAlmacenes } from '@/actions/inventario/getAlmacenes'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'

export async function GET(request: Request) {
  try {
    const sesion = await validarPin(request.headers.get('x-kds-pin') ?? '')
    if (!sesion) return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 })
    if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const almacenes = await getAlmacenes(sesion.meseroId)
    return NextResponse.json(almacenes, { status: 200 })
  } catch (error) {
    console.error('Error al obtener almacenes:', error)
    return NextResponse.json({ error: 'Error al obtener almacenes' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verificar, tsc y commit**

Run: `curl -s http://localhost:3000/api/inventario/almacenes -H "x-kds-pin: <codigo real>"`
Expected: JSON con al menos un almacén interno de la BD de desarrollo.
Run: `npx tsc --noEmit`

```bash
git add src/actions/inventario/getAlmacenes.ts src/app/api/inventario/almacenes/route.ts
git commit -m "inventario: almacenes internos visibles por responsable"
```

---

### Task 6: Catálogo de productos contables

**Files:**
- Create: `src/actions/inventario/getProductosContables.ts`

**Interfaces:**
- Produces: `getProductosContables(noVendibles: boolean): Promise<ProductoContable[]>` — la consume el GET detalle de conteo (Tarea 7/8) para armar la lista de captura. El stock NO se incluye acá (la captura es ciega; el stock viaja solo en el payload de revisión, Tarea 7).

- [ ] **Step 1: Implementar**

```ts
import sql from 'mssql'
import { getPool } from '../db'
import { ProductoContable } from '@/interfaces/Inventario'

// Mismo filtro que frmEntAjustes del POS: solo productos "hoja".
export async function getProductosContables(noVendibles: boolean): Promise<ProductoContable[]> {
  try {
    const pool = await getPool()
    const result = await pool
      .request()
      .input('noVendibles', sql.Int, noVendibles ? 1 : 0)
      .query(`
        SELECT p.ID, p.Nombre, COALESCE(p.Codigo, '') AS Codigo,
               COALESCE(p.Presentacion, '') AS Presentacion,
               COALESCE(p.UnidadContenido, '') AS UnidadContenido,
               COALESCE(tp.Descripcion, 'Sin categoría') AS TipoProducto
        FROM Productos p
        LEFT JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
        WHERE p.Borrado = 0 AND p.TienePreparacion = 0 AND p.esCombo = 0
          AND COALESCE(tp.NoVendibles, 0) = @noVendibles
        ORDER BY tp.Descripcion, p.Nombre
      `)
    return result.recordset.map((f) => ({
      productoId: f.ID,
      nombre: f.Nombre ?? '',
      codigo: String(f.Codigo).trim(),
      presentacion: f.Presentacion ?? '',
      unidad: f.UnidadContenido ?? '',
      tipoProducto: f.TipoProducto ?? 'Sin categoría'
    }))
  } catch (error) {
    const err = error as { number?: number }
    if (err.number === 208) return []
    console.error('Error al obtener productos contables:', error)
    throw new Error('No se pudieron obtener los productos')
  }
}
```

Nota: `TiposProductos.NoVendibles` puede no existir en POS viejos. Si el `COALESCE` da error 207 (columna inválida), envolver igual que 208 → probar primero contra la BD de desarrollo; si la columna falta ahí, usar el guard `COL_LENGTH('TiposProductos','NoVendibles')` con el patrón exacto de `getCocina.ts:66-76` (armar la expresión según exista o no).

- [ ] **Step 2: tsc y commit**

Run: `npx tsc --noEmit`

```bash
git add src/actions/inventario/getProductosContables.ts
git commit -m "inventario: catalogo de productos contables (filtro frmEntAjustes)"
```

---

### Task 7: Actions de conteos (crear, listar, detalle, upsert de captura)

**Files:**
- Create: `src/actions/inventario/conteos.ts`

**Interfaces:**
- Consumes: `ensureTablasConteo`, `getProductosContables`, tipos de Tarea 1.
- Produces (las consumen las rutas de Tarea 8 y transiciones de Tarea 11):
  - `crearConteo(almacenId: number, noVendibles: boolean, observacion: string, meseroId: number): Promise<number>` (devuelve ConteoID)
  - `listarConteos(): Promise<ConteoResumen[]>` (abiertos/revisión siempre + terminados de últimos 7 días)
  - `getConteo(conteoId: number, conDiferencias: boolean): Promise<ConteoCompleto | null>`
  - `upsertDetalle(conteoId: number, productoId: number, cantidad: number, observacion: string, meseroId: number): Promise<string>`
  - `getCabecera(conteoId: number): Promise<{ estado: string; meseroId: number; almacenId: number; noVendibles: boolean } | null>` (guard compartido)

- [ ] **Step 1: Implementar `conteos.ts`**

```ts
import sql from 'mssql'
import moment from 'moment-timezone'
import { getPool } from '../db'
import { ensureTablasConteo } from './schema'
import { getProductosContables } from './getProductosContables'
import { ConteoCompleto, ConteoDetalleDb, ConteoResumen } from '@/interfaces/Inventario'
import { EstadoConteo } from '@/contants/inventario'

const ahoraLaPaz = () => moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')

export async function crearConteo(
  almacenId: number,
  noVendibles: boolean,
  observacion: string,
  meseroId: number
): Promise<number> {
  await ensureTablasConteo()
  const pool = await getPool()
  const result = await pool
    .request()
    .input('almacenId', sql.Int, almacenId)
    .input('noVendibles', sql.Bit, noVendibles)
    .input('observacion', sql.VarChar, observacion.slice(0, 500))
    .input('meseroId', sql.Int, meseroId)
    .input('fecha', sql.VarChar, ahoraLaPaz())
    .query(`
      INSERT INTO KDS_Conteos (AlmacenID, NoVendibles, Estado, MeseroID, Observacion, FechaCreacion)
      OUTPUT INSERTED.ConteoID
      VALUES (@almacenId, @noVendibles, 'abierto', @meseroId, @observacion, @fecha)
    `)
  return result.recordset[0].ConteoID
}

export async function listarConteos(): Promise<ConteoResumen[]> {
  await ensureTablasConteo()
  const pool = await getPool()
  const result = await pool.request().query(`
    SELECT c.ConteoID, c.AlmacenID, COALESCE(a.Nombre, '') AS AlmacenNombre,
           c.NoVendibles, c.Estado, c.MeseroID, COALESCE(m.Nombre, '') AS MeseroNombre,
           COALESCE(c.Observacion, '') AS Observacion,
           CONVERT(varchar(19), c.FechaCreacion, 120) AS FechaCreacion,
           CONVERT(varchar(19), c.FechaAplicacion, 120) AS FechaAplicacion,
           c.AjusteID,
           (SELECT COUNT(*) FROM KDS_ConteoDetalles d WHERE d.ConteoID = c.ConteoID) AS Contados
    FROM KDS_Conteos c
    LEFT JOIN Almacenes a ON a.AlmacenID = c.AlmacenID
    LEFT JOIN Meseros m ON m.MeseroID = c.MeseroID
    WHERE c.Estado IN ('abierto', 'revision')
       OR c.FechaCreacion >= DATEADD(day, -7, GETDATE())
    ORDER BY CASE c.Estado WHEN 'abierto' THEN 0 WHEN 'revision' THEN 1 ELSE 2 END,
             c.FechaCreacion DESC
  `)
  return result.recordset.map((f) => ({
    conteoId: f.ConteoID,
    almacenId: f.AlmacenID,
    almacenNombre: f.AlmacenNombre,
    noVendibles: !!f.NoVendibles,
    estado: f.Estado as EstadoConteo,
    meseroId: f.MeseroID,
    meseroNombre: f.MeseroNombre,
    observacion: f.Observacion,
    fechaCreacion: f.FechaCreacion,
    fechaAplicacion: f.FechaAplicacion,
    ajusteId: f.AjusteID,
    contados: f.Contados
  }))
}

export async function getCabecera(conteoId: number) {
  await ensureTablasConteo()
  const pool = await getPool()
  const result = await pool.request().input('conteoId', sql.Int, conteoId).query(`
    SELECT Estado, MeseroID, AlmacenID, NoVendibles FROM KDS_Conteos WHERE ConteoID = @conteoId
  `)
  if (result.recordset.length === 0) return null
  const f = result.recordset[0]
  return {
    estado: f.Estado as string,
    meseroId: f.MeseroID as number,
    almacenId: f.AlmacenID as number,
    noVendibles: !!f.NoVendibles
  }
}

// Payload completo de un conteo. conDiferencias=false -> captura CIEGA:
// stockSnapshot/stockVivo/costo van en 0 y no se consultan.
export async function getConteo(conteoId: number, conDiferencias: boolean): Promise<ConteoCompleto | null> {
  const cab = await getCabecera(conteoId)
  if (cab === null) return null
  const pool = await getPool()
  // almacenId es int validado: el nombre de columna Stock<N> se interpola, jamas un string del cliente.
  const colStock = `Stock${cab.almacenId}`
  const columnasStock = conDiferencias
    ? `d.StockSnapshot, COALESCE(p.${colStock}, 0) AS StockVivo, COALESCE(p.Costo, 0) AS Costo`
    : `0 AS StockSnapshot, 0 AS StockVivo, 0 AS Costo`
  const detallesResult = await pool.request().input('conteoId', sql.Int, conteoId).query(`
    SELECT d.ProductoID, COALESCE(p.Nombre, '') AS Nombre,
           COALESCE(p.UnidadContenido, '') AS Unidad,
           COALESCE(tp.Descripcion, 'Sin categoría') AS TipoProducto,
           d.CantidadContada, ${columnasStock},
           COALESCE(d.Observacion, '') AS Observacion,
           CONVERT(varchar(19), d.FechaConteo, 120) AS FechaConteo
    FROM KDS_ConteoDetalles d
    INNER JOIN Productos p ON p.ID = d.ProductoID
    LEFT JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
    WHERE d.ConteoID = @conteoId
    ORDER BY tp.Descripcion, p.Nombre
  `)
  const lista = await listarConteos()
  const conteo = lista.find((c) => c.conteoId === conteoId)
  if (!conteo) return null
  const detalles: ConteoDetalleDb[] = detallesResult.recordset.map((f) => ({
    productoId: f.ProductoID,
    nombre: f.Nombre,
    unidad: f.Unidad,
    tipoProducto: f.TipoProducto,
    cantidadContada: f.CantidadContada,
    stockSnapshot: f.StockSnapshot,
    stockVivo: f.StockVivo,
    costo: f.Costo,
    observacion: f.Observacion,
    fechaConteo: f.FechaConteo
  }))
  return { conteo, detalles, conDiferencias }
}

// Guarda/reemplaza la captura de UN producto tomando el snapshot de stock
// EN EL MISMO batch SQL (ventana de segundos, spec seccion 7).
export async function upsertDetalle(
  conteoId: number,
  productoId: number,
  cantidad: number,
  observacion: string,
  meseroId: number
): Promise<string> {
  const cab = await getCabecera(conteoId)
  if (cab === null) return 'Conteo inexistente'
  if (cab.estado !== 'abierto') return 'El conteo no está abierto'
  if (cab.meseroId !== meseroId) return 'El conteo pertenece a otro usuario'
  if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > 999999999) return 'Cantidad inválida'

  const pool = await getPool()
  const colStock = `Stock${cab.almacenId}` // int validado en getCabecera
  await pool
    .request()
    .input('conteoId', sql.Int, conteoId)
    .input('productoId', sql.Int, productoId)
    .input('cantidad', sql.Float, cantidad)
    .input('observacion', sql.VarChar, observacion.slice(0, 500))
    .input('fecha', sql.VarChar, ahoraLaPaz())
    .query(`
      DECLARE @snap float = (SELECT COALESCE(${colStock}, 0) FROM Productos WHERE ID = @productoId);
      IF @snap IS NULL SET @snap = 0;
      IF EXISTS (SELECT 1 FROM KDS_ConteoDetalles WHERE ConteoID = @conteoId AND ProductoID = @productoId)
        UPDATE KDS_ConteoDetalles
        SET CantidadContada = @cantidad, StockSnapshot = @snap, FechaConteo = @fecha, Observacion = @observacion
        WHERE ConteoID = @conteoId AND ProductoID = @productoId
      ELSE
        INSERT INTO KDS_ConteoDetalles (ConteoID, ProductoID, CantidadContada, StockSnapshot, FechaConteo, Observacion)
        VALUES (@conteoId, @productoId, @cantidad, @snap, @fecha, @observacion);
    `)
  return 'ok'
}

export { getProductosContables }
```

- [ ] **Step 2: tsc y commit**

Run: `npx tsc --noEmit`

```bash
git add src/actions/inventario/conteos.ts
git commit -m "inventario: actions de conteo (crear, listar, detalle ciego/completo, captura con snapshot)"
```

---

### Task 8: Rutas API de conteos

**Files:**
- Create: `src/app/api/inventario/conteos/route.ts`
- Create: `src/app/api/inventario/conteos/[id]/route.ts`
- Create: `src/app/api/inventario/conteos/[id]/detalles/route.ts`
- Create: `src/actions/inventario/authRoute.ts` (helper compartido de las rutas)

**Interfaces:**
- Consumes: actions de Tarea 7, `validarPin`, helpers de rol.
- Produces:
  - `GET /api/inventario/conteos` (header `x-kds-pin`) → `ConteoResumen[]`
  - `POST /api/inventario/conteos` body `{ pin, almacenId, noVendibles, observacion }` → 201 `{ conteoId }`
  - `GET /api/inventario/conteos/[id]` (header) → `ConteoCompleto` + `productos: ProductoContable[]` cuando `estado==='abierto'` (para la lista de captura)
  - `PUT /api/inventario/conteos/[id]/detalles` body `{ pin, productoId, cantidad, observacion }` → 200 `{ message }`
  - Helper `autenticar(request, opts): Promise<{ sesion } | { error: NextResponse }>`

- [ ] **Step 1: Implementar `authRoute.ts`**

```ts
import { NextResponse } from 'next/server'
import { validarPin } from './validarPin'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'
import { SesionInventario } from '@/interfaces/Inventario'

// Autentica una ruta del modulo: PIN por header (GET) o por body (mutaciones).
export async function autenticar(
  pin: string | null | undefined
): Promise<{ sesion: SesionInventario } | { error: NextResponse }> {
  if (typeof pin !== 'string' || pin.length === 0) {
    return { error: NextResponse.json({ error: 'pin es requerido' }, { status: 400 }) }
  }
  const sesion = await validarPin(pin)
  if (!sesion) {
    return { error: NextResponse.json({ error: 'Código incorrecto' }, { status: 401 }) }
  }
  if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
    return { error: NextResponse.json({ error: 'Sin permiso para inventario' }, { status: 403 }) }
  }
  return { sesion }
}
```

- [ ] **Step 2: Implementar `conteos/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { crearConteo, listarConteos } from '@/actions/inventario/conteos'
import { getAlmacenes } from '@/actions/inventario/getAlmacenes'
import { puedeContar } from '@/contants/inventario'

export async function GET(request: Request) {
  try {
    const auth = await autenticar(request.headers.get('x-kds-pin'))
    if ('error' in auth) return auth.error
    return NextResponse.json(await listarConteos(), { status: 200 })
  } catch (error) {
    console.error('Error al listar conteos:', error)
    return NextResponse.json({ error: 'Error al listar conteos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { pin, almacenId, noVendibles, observacion } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    if (!puedeContar(auth.sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso para crear conteos' }, { status: 403 })
    }
    if (!Number.isInteger(almacenId) || almacenId <= 0) {
      return NextResponse.json({ error: 'almacenId es requerido' }, { status: 400 })
    }
    // El almacen debe ser visible para este usuario (regla ResponsableID).
    const visibles = await getAlmacenes(auth.sesion.meseroId)
    if (!visibles.some((a) => a.almacenId === almacenId)) {
      return NextResponse.json({ error: 'Almacén no disponible' }, { status: 403 })
    }
    const conteoId = await crearConteo(
      almacenId,
      noVendibles === true,
      typeof observacion === 'string' ? observacion : '',
      auth.sesion.meseroId
    )
    return NextResponse.json({ conteoId }, { status: 201 })
  } catch (error) {
    console.error('Error al crear conteo:', error)
    return NextResponse.json({ error: 'Error al crear el conteo' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Implementar `conteos/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { getConteo, getProductosContables } from '@/actions/inventario/conteos'
import { puedeVerDiferencias } from '@/contants/inventario'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const auth = await autenticar(request.headers.get('x-kds-pin'))
    if ('error' in auth) return auth.error
    const conDiferencias = puedeVerDiferencias(auth.sesion.tipoUsuarioId)
    const conteo = await getConteo(conteoId, conDiferencias)
    if (!conteo) return NextResponse.json({ error: 'Conteo inexistente' }, { status: 404 })
    // La lista completa de productos contables solo hace falta durante la captura.
    const productos =
      conteo.conteo.estado === 'abierto'
        ? await getProductosContables(conteo.conteo.noVendibles)
        : []
    return NextResponse.json({ ...conteo, productos }, { status: 200 })
  } catch (error) {
    console.error('Error al obtener conteo:', error)
    return NextResponse.json({ error: 'Error al obtener el conteo' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Implementar `conteos/[id]/detalles/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { upsertDetalle } from '@/actions/inventario/conteos'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin, productoId, cantidad, observacion } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    if (!Number.isInteger(productoId) || productoId <= 0 || typeof cantidad !== 'number') {
      return NextResponse.json({ error: 'productoId y cantidad son requeridos' }, { status: 400 })
    }
    const resultado = await upsertDetalle(
      conteoId,
      productoId,
      cantidad,
      typeof observacion === 'string' ? observacion : '',
      auth.sesion.meseroId
    )
    if (resultado !== 'ok') return NextResponse.json({ error: resultado }, { status: 409 })
    return NextResponse.json({ message: 'Captura guardada' }, { status: 200 })
  } catch (error) {
    console.error('Error al guardar captura:', error)
    return NextResponse.json({ error: 'Error al guardar la captura' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Verificación en vivo (curl), tsc y commit**

Con dev server y un PIN real:
1. `POST /api/inventario/conteos` con `{pin, almacenId:<interno>, noVendibles:false, observacion:"prueba"}` → 201 `{conteoId}`.
2. `PUT /api/inventario/conteos/<id>/detalles` con `{pin, productoId:<hoja>, cantidad:5}` → 200; repetir con cantidad 7 → 200 (reemplaza).
3. `GET /api/inventario/conteos/<id>` con header de PIN de un supervisor → `detalles[0].stockSnapshot` con valor real; con PIN de rol no supervisor (si hay) → snapshot en 0.
4. En SQL: `SELECT * FROM KDS_ConteoDetalles WHERE ConteoID=<id>` → una sola fila, `StockSnapshot` = stock vivo del momento.
Run: `npx tsc --noEmit`

```bash
git add src/app/api/inventario src/actions/inventario/authRoute.ts
git commit -m "inventario: rutas API de conteos con auth por PIN"
```

---

### Task 9: UI — página, orquestador, gate PIN y teclado

**Files:**
- Create: `src/app/(pages)/inventario/page.tsx`
- Create: `src/app/(pages)/inventario/(components)/InventarioApp.tsx`
- Create: `src/app/(pages)/inventario/(components)/PinGate.tsx`
- Create: `src/app/(pages)/inventario/(components)/TecladoNumerico.tsx`

**Interfaces:**
- Consumes: `POST /api/inventario/sesion`.
- Produces:
  - `TecladoNumerico({ onTecla, onBorrar, onLimpiar, conComa }: { onTecla: (d: string) => void; onBorrar: () => void; onLimpiar?: () => void; conComa?: boolean })` — lo reutiliza la captura (Tarea 10).
  - `InventarioApp` mantiene `pin` y `sesion` SOLO en `useState` (nunca localStorage), timer de 10 min de inactividad que borra ambos, y una vista `{ tipo: 'lista' } | { tipo: 'captura', conteoId } | { tipo: 'revision', conteoId }`.
  - `pedirPin(): Promise<string | null>` interno: modal que exige re-tecleo (lo usan aplicar/anular en Tareas 11-13 vía prop `onPedirPin`).

- [ ] **Step 1: `page.tsx`** (patrón exacto de `config/page.tsx`)

```tsx
import { InventarioApp } from './(components)/InventarioApp'

const InventarioPage = () => {
  return <InventarioApp />
}

export default InventarioPage
```

- [ ] **Step 2: `TecladoNumerico.tsx`**

```tsx
'use client'

import { Delete } from 'lucide-react'

// Teclado 3x4 del mockup (spec seccion 14): teclas >= 44px.
export const TecladoNumerico = ({
  onTecla,
  onBorrar,
  onLimpiar,
  conComa = false
}: {
  onTecla: (d: string) => void
  onBorrar: () => void
  onLimpiar?: () => void
  conComa?: boolean
}) => {
  const abajoIzquierda = conComa ? ',' : 'C'
  return (
    <div className='grid grid-cols-3 gap-2.5'>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          onClick={() => onTecla(d)}
          className='flex h-[58px] items-center justify-center rounded-lg bg-[#eef0f1] text-2xl font-bold text-[#2c3236] active:bg-[#dde0e3]'
        >
          {d}
        </button>
      ))}
      <button
        onClick={() => (abajoIzquierda === ',' ? onTecla(',') : onLimpiar?.())}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#e5e8ea] text-2xl font-bold text-[#626e78] active:bg-[#dde0e3]'
      >
        {abajoIzquierda}
      </button>
      <button
        onClick={() => onTecla('0')}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#eef0f1] text-2xl font-bold text-[#2c3236] active:bg-[#dde0e3]'
      >
        0
      </button>
      <button
        onClick={onBorrar}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#e5e8ea] text-[#626e78] active:bg-[#dde0e3]'
      >
        <Delete className='h-6 w-6' />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: `PinGate.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { TecladoNumerico } from './TecladoNumerico'
import { SesionInventario } from '@/interfaces/Inventario'

export const PinGate = ({
  titulo = 'Ingresá tu código',
  onSesion
}: {
  titulo?: string
  onSesion: (pin: string, sesion: SesionInventario) => void
}) => {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [validando, setValidando] = useState(false)

  const entrar = async () => {
    if (pin.length === 0 || validando) return
    setValidando(true)
    setError('')
    try {
      const resp = await fetch('/api/inventario/sesion', {
        method: 'POST',
        body: JSON.stringify({ pin })
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Código incorrecto')
        setPin('')
        return
      }
      onSesion(pin, data)
    } catch {
      setError('Sin conexión con el servidor')
    } finally {
      setValidando(false)
    }
  }

  return (
    <div className='flex flex-1 flex-col justify-center gap-5 px-6'>
      <div className='flex flex-col items-center gap-2.5 text-center'>
        <p className='text-xl font-bold text-[#2c3236]'>{titulo}</p>
        <div className='flex gap-3.5'>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={
                i < Math.min(pin.length, 4)
                  ? 'h-4 w-4 rounded-full bg-[#2c3236]'
                  : 'h-4 w-4 rounded-full border-2 border-[#b6bcc1] bg-white'
              }
            />
          ))}
        </div>
        {error !== '' && <p className='text-sm font-semibold text-[#b85c5c]'>{error}</p>}
      </div>
      <TecladoNumerico
        onTecla={(d) => setPin((p) => (p.length < 20 ? p + d : p))}
        onBorrar={() => setPin((p) => p.slice(0, -1))}
        onLimpiar={() => setPin('')}
      />
      <button
        onClick={entrar}
        disabled={validando}
        className='flex h-14 items-center justify-center rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
      >
        {validando ? 'Validando…' : 'Entrar'}
      </button>
      <p className='text-center text-[13px] leading-relaxed text-[#8b949b]'>
        Mismo código que usás en el POS.
        <br />
        El PIN no se guarda en el dispositivo.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: `InventarioApp.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PinGate } from './PinGate'
import { SesionInventario } from '@/interfaces/Inventario'

const INACTIVIDAD_MS = 10 * 60 * 1000

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'captura'; conteoId: number }
  | { tipo: 'revision'; conteoId: number }

export const InventarioApp = () => {
  // PIN y sesion SOLO en memoria: refresh o 10 min de inactividad = re-login.
  const [pin, setPin] = useState<string | null>(null)
  const [sesion, setSesion] = useState<SesionInventario | null>(null)
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cerrarSesion = useCallback(() => {
    setPin(null)
    setSesion(null)
    setVista({ tipo: 'lista' })
  }, [])

  const tocarActividad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(cerrarSesion, INACTIVIDAD_MS)
  }, [cerrarSesion])

  useEffect(() => {
    if (pin === null) return
    tocarActividad()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pin, tocarActividad])

  return (
    <div
      className='mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#eef0f1]'
      onPointerDown={tocarActividad}
      onKeyDown={tocarActividad}
    >
      <header className='bg-[#626e78] px-5 py-4 text-white'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold uppercase leading-none tracking-wide'>Inventario</h1>
            <p className='mt-1 text-sm font-semibold opacity-75'>Restotech KDS</p>
          </div>
          {sesion && (
            <button
              onClick={cerrarSesion}
              className='rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold'
            >
              {sesion.nombre}
            </button>
          )}
        </div>
      </header>

      {pin === null || sesion === null ? (
        <PinGate
          onSesion={(nuevoPin, nuevaSesion) => {
            setPin(nuevoPin)
            setSesion(nuevaSesion)
          }}
        />
      ) : (
        // Las vistas se completan en las Tareas 10 y 13; por ahora placeholder funcional.
        <VistaActual pin={pin} sesion={sesion} vista={vista} setVista={setVista} />
      )}
    </div>
  )
}

const VistaActual = ({
  pin,
  sesion,
  vista,
  setVista
}: {
  pin: string
  sesion: SesionInventario
  vista: Vista
  setVista: (v: Vista) => void
}) => {
  void pin
  void sesion
  void vista
  void setVista
  return <div className='p-6 text-[#626e78]'>Lista de conteos (Tarea 10)</div>
}

export type { Vista }
```

- [ ] **Step 5: Verificar en navegador, tsc y commit**

Con dev server: abrir `http://localhost:3000/inventario` en viewport móvil.
Expected: gate con teclado, PIN malo → "Código incorrecto", PIN real → header con nombre y placeholder de lista.
Run: `npx tsc --noEmit`

```bash
git add "src/app/(pages)/inventario"
git commit -m "inventario: pagina, orquestador con PIN en memoria y gate de entrada"
```

---

### Task 10: UI — lista de conteos, nuevo conteo y captura

**Files:**
- Create: `src/app/(pages)/inventario/(components)/ListaConteos.tsx`
- Create: `src/app/(pages)/inventario/(components)/NuevoConteoSheet.tsx`
- Create: `src/app/(pages)/inventario/(components)/CapturaConteo.tsx`
- Modify: `src/app/(pages)/inventario/(components)/InventarioApp.tsx` (reemplazar `VistaActual`)

**Interfaces:**
- Consumes: rutas de Tareas 5 y 8, `TecladoNumerico`, tipos de Tarea 1.
- Produces: navegación completa lista ↔ captura. La revisión queda como botón que llama `setVista({tipo:'revision',...})` (pantalla en Tarea 13).

- [ ] **Step 1: `ListaConteos.tsx`**

Estados con colores del spec §14: abierto=`#80a76e`, revision=`#eac568`, aplicado=`#626e78`, anulado=`#d17f7f`. Antigüedad con `moment(fechaCreacion).fromNow()` requiere locale: usar texto simple `HH:mm` del día o fecha corta (sin dependencia nueva).

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { ConteoResumen, SesionInventario } from '@/interfaces/Inventario'
import { puedeVerDiferencias } from '@/contants/inventario'

const COLOR_ESTADO: Record<string, string> = {
  abierto: '#80a76e',
  revision: '#eac568',
  aplicado: '#626e78',
  anulado: '#d17f7f'
}

export const ListaConteos = ({
  pin,
  sesion,
  onAbrirCaptura,
  onAbrirRevision,
  onNuevo
}: {
  pin: string
  sesion: SesionInventario
  onAbrirCaptura: (conteoId: number) => void
  onAbrirRevision: (conteoId: number) => void
  onNuevo: () => void
}) => {
  const [conteos, setConteos] = useState<ConteoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch('/api/inventario/conteos', {
        headers: { 'x-kds-pin': pin }
      })
      if (!resp.ok) throw new Error()
      setConteos(await resp.json())
      setError('')
    } catch {
      setError('No se pudieron cargar los conteos')
    } finally {
      setCargando(false)
    }
  }, [pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activos = conteos.filter((c) => c.estado === 'abierto' || c.estado === 'revision')
  const historicos = conteos.filter((c) => c.estado === 'aplicado' || c.estado === 'anulado')
  const esSupervisor = puedeVerDiferencias(sesion.tipoUsuarioId)

  const abrir = (c: ConteoResumen) => {
    if (c.estado === 'abierto' && c.meseroId === sesion.meseroId) onAbrirCaptura(c.conteoId)
    else if (esSupervisor || c.estado !== 'abierto') onAbrirRevision(c.conteoId)
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div className='flex-1 space-y-4 overflow-y-auto px-4 pt-4'>
        {cargando && <p className='text-center text-[#8b949b]'>Cargando…</p>}
        {error !== '' && <p className='text-center font-semibold text-[#b85c5c]'>{error}</p>}

        {activos.length > 0 && (
          <section className='space-y-2.5'>
            <h2 className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>En curso</h2>
            {activos.map((c) => (
              <button
                key={c.conteoId}
                onClick={() => abrir(c)}
                className='w-full rounded-[10px] bg-white p-4 text-left shadow-sm'
              >
                <div className='flex items-center justify-between gap-2.5'>
                  <span className='text-lg font-bold text-[#2c3236]'>{c.almacenNombre}</span>
                  <span
                    className='rounded-full px-3 py-1 text-xs font-bold uppercase text-[#2c3236]'
                    style={{ backgroundColor: COLOR_ESTADO[c.estado] }}
                  >
                    {c.estado === 'revision' ? 'Revisión' : c.estado}
                  </span>
                </div>
                <p className='mt-1.5 text-sm font-semibold text-[#8b949b]'>
                  {c.noVendibles ? 'No vendibles' : 'Vendibles'} · Conteo #{c.conteoId} ·{' '}
                  {c.meseroNombre} · {c.contados} contados
                </p>
              </button>
            ))}
          </section>
        )}

        {historicos.length > 0 && (
          <section className='space-y-2.5'>
            <h2 className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>Últimos 7 días</h2>
            <div className='divide-y divide-[#eef0f1] rounded-[10px] bg-white shadow-sm'>
              {historicos.map((c) => (
                <button
                  key={c.conteoId}
                  onClick={() => abrir(c)}
                  className='flex w-full items-center gap-3 px-4 py-3.5 text-left'
                >
                  <span
                    className='h-2.5 w-2.5 shrink-0 rounded-full'
                    style={{ backgroundColor: COLOR_ESTADO[c.estado] }}
                  />
                  <span className='flex-1'>
                    <span className='block text-[15px] font-bold text-[#2c3236]'>
                      {c.almacenNombre}
                      {c.noVendibles ? ' · No vendibles' : ''}
                    </span>
                    <span className='block text-[13px] font-semibold text-[#8b949b]'>
                      {c.estado === 'aplicado'
                        ? `Aplicado ${c.fechaAplicacion ?? ''}${c.ajusteId ? ` · Ajuste #${c.ajusteId}` : ''}`
                        : `Anulado · por ${c.meseroNombre}`}
                    </span>
                  </span>
                  <ChevronRight className='h-4 w-4 text-[#b6bcc1]' />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className='px-4 pb-5 pt-3.5'>
        <button
          onClick={onNuevo}
          className='flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] shadow-md'
        >
          <Plus className='h-5 w-5' strokeWidth={2.5} />
          Nuevo conteo
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `NuevoConteoSheet.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { AlmacenInventario } from '@/interfaces/Inventario'

// Sheet inferior para crear conteo: almacen (si hay >1), tipo, observacion.
export const NuevoConteoSheet = ({
  pin,
  onCreado,
  onCerrar
}: {
  pin: string
  onCreado: (conteoId: number) => void
  onCerrar: () => void
}) => {
  const [almacenes, setAlmacenes] = useState<AlmacenInventario[]>([])
  const [almacenId, setAlmacenId] = useState<number | null>(null)
  const [noVendibles, setNoVendibles] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    fetch('/api/inventario/almacenes', { headers: { 'x-kds-pin': pin } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((lista: AlmacenInventario[]) => {
        setAlmacenes(lista)
        if (lista.length >= 1) setAlmacenId(lista[0].almacenId)
      })
      .catch(() => setError('No se pudieron cargar los almacenes'))
  }, [pin])

  const crear = async () => {
    if (almacenId === null || creando) return
    setCreando(true)
    try {
      const resp = await fetch('/api/inventario/conteos', {
        method: 'POST',
        body: JSON.stringify({ pin, almacenId, noVendibles, observacion })
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Error al crear el conteo')
        return
      }
      onCreado(data.conteoId)
    } catch {
      setError('Sin conexión con el servidor')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/35' onClick={onCerrar}>
      <div
        className='w-full space-y-4 rounded-t-2xl bg-white p-4 pb-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mx-auto h-1.5 w-11 rounded-full bg-[#dde0e3]' />
        <h2 className='text-lg font-bold text-[#2c3236]'>Nuevo conteo</h2>
        {error !== '' && <p className='text-sm font-semibold text-[#b85c5c]'>{error}</p>}

        {almacenes.length > 1 && (
          <div className='space-y-2'>
            <p className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>Almacén</p>
            <div className='flex flex-wrap gap-2'>
              {almacenes.map((a) => (
                <button
                  key={a.almacenId}
                  onClick={() => setAlmacenId(a.almacenId)}
                  className={
                    a.almacenId === almacenId
                      ? 'h-11 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                      : 'h-11 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
                  }
                >
                  {a.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className='space-y-2'>
          <p className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>Tipo</p>
          <div className='flex gap-2'>
            <button
              onClick={() => setNoVendibles(false)}
              className={
                !noVendibles
                  ? 'h-11 flex-1 rounded-lg bg-[#626e78] text-sm font-bold text-white'
                  : 'h-11 flex-1 rounded-lg border border-[#dde0e3] text-sm font-bold text-[#626e78]'
              }
            >
              Vendibles
            </button>
            <button
              onClick={() => setNoVendibles(true)}
              className={
                noVendibles
                  ? 'h-11 flex-1 rounded-lg bg-[#626e78] text-sm font-bold text-white'
                  : 'h-11 flex-1 rounded-lg border border-[#dde0e3] text-sm font-bold text-[#626e78]'
              }
            >
              No vendibles
            </button>
          </div>
        </div>

        <input
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder='Observación (opcional)'
          className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
        />

        <button
          onClick={crear}
          disabled={almacenId === null || creando}
          className='flex h-14 w-full items-center justify-center rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
        >
          {creando ? 'Creando…' : 'Empezar a contar'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `CapturaConteo.tsx`**

Captura CIEGA (sin stock), buscador con soporte de lector físico (Enter = match exacto por `codigo`), agrupado por `tipoProducto` con headers sticky, sheet de cantidad con `TecladoNumerico` (`conComa`), guardado optimista + toast de sonner con el patrón del repo.

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Search, ScanBarcode, Check, MessageSquare, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { TecladoNumerico } from './TecladoNumerico'
import { ConteoDetalleDb, ProductoContable, SesionInventario } from '@/interfaces/Inventario'

interface PayloadConteo {
  conteo: { conteoId: number; almacenNombre: string; noVendibles: boolean; estado: string }
  detalles: ConteoDetalleDb[]
  productos: ProductoContable[]
}

export const CapturaConteo = ({
  pin,
  sesion,
  conteoId,
  onVolver,
  onTerminar
}: {
  pin: string
  sesion: SesionInventario
  conteoId: number
  onVolver: () => void
  onTerminar: () => void
}) => {
  void sesion
  const [datos, setDatos] = useState<PayloadConteo | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [activo, setActivo] = useState<ProductoContable | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [observacion, setObservacion] = useState('')
  const [conObservacion, setConObservacion] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}`, {
      headers: { 'x-kds-pin': pin }
    })
    if (resp.ok) setDatos(await resp.json())
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const contadosPorProducto = useMemo(() => {
    const mapa = new Map<number, number>()
    datos?.detalles.forEach((d) => mapa.set(d.productoId, d.cantidadContada))
    return mapa
  }, [datos])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = datos?.productos ?? []
    if (q === '') return lista
    return lista.filter(
      (p) => p.nombre.toLowerCase().includes(q) || (p.codigo !== '' && p.codigo.toLowerCase().includes(q))
    )
  }, [datos, busqueda])

  const grupos = useMemo(() => {
    const mapa = new Map<string, ProductoContable[]>()
    filtrados.forEach((p) => {
      const lista = mapa.get(p.tipoProducto) ?? []
      lista.push(p)
      mapa.set(p.tipoProducto, lista)
    })
    return Array.from(mapa.entries())
  }, [filtrados])

  const abrirProducto = (p: ProductoContable) => {
    setActivo(p)
    const previa = contadosPorProducto.get(p.productoId)
    setCantidad(previa !== undefined ? String(previa).replace('.', ',') : '')
    setObservacion('')
    setConObservacion(false)
  }

  // Lector fisico (keyboard wedge): Enter en el buscador = match exacto por Codigo.
  const onEnterBuscador = () => {
    const codigo = busqueda.trim().toLowerCase()
    if (codigo === '') return
    const matches = (datos?.productos ?? []).filter((p) => p.codigo.toLowerCase() === codigo)
    if (matches.length === 1) {
      abrirProducto(matches[0])
      setBusqueda('')
    } else if (matches.length === 0) {
      toast.error(`Código no registrado: ${busqueda.trim()}`)
      setBusqueda('')
    }
    // matches > 1: se deja la lista filtrada para elegir a mano.
  }

  const guardar = async () => {
    if (activo === null) return
    const valor = parseFloat(cantidad.replace(',', '.'))
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Cantidad inválida')
      return
    }
    const resp = await fetch(`/api/inventario/conteos/${conteoId}/detalles`, {
      method: 'PUT',
      body: JSON.stringify({ pin, productoId: activo.productoId, cantidad: valor, observacion })
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      toast.error(data.error ?? 'No se pudo guardar la captura')
      return
    }
    setActivo(null)
    buscadorRef.current?.focus()
    await cargar()
  }

  if (datos === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  const total = datos.productos.length
  const contados = contadosPorProducto.size

  return (
    <div className='relative flex flex-1 flex-col overflow-hidden'>
      <div className='flex items-center gap-2 bg-[#626e78] py-3 pl-2 pr-3 text-white'>
        <button onClick={onVolver} className='flex h-11 w-11 items-center justify-center rounded-lg'>
          <ChevronLeft className='h-6 w-6' strokeWidth={2.5} />
        </button>
        <div className='flex-1'>
          <p className='text-lg font-bold leading-tight'>{datos.conteo.almacenNombre}</p>
          <p className='text-[13px] font-semibold opacity-75'>
            {datos.conteo.noVendibles ? 'No vendibles' : 'Vendibles'} · Conteo #{conteoId}
          </p>
        </div>
        <div className='text-right'>
          <p className='text-lg font-bold tabular-nums'>
            {contados} / {total}
          </p>
          <p className='text-xs font-semibold opacity-75'>contados</p>
        </div>
      </div>
      <div className='h-1.5 bg-[#4d575f]'>
        <div
          className='h-full bg-[#80a76e] transition-all'
          style={{ width: total > 0 ? `${(contados / total) * 100}%` : '0%' }}
        />
      </div>

      <div className='flex gap-2.5 px-4 py-3'>
        <div className='flex h-[52px] flex-1 items-center gap-2.5 rounded-lg border border-[#dde0e3] bg-white px-3.5'>
          <Search className='h-5 w-5 shrink-0 text-[#8b949b]' />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnterBuscador()
            }}
            placeholder='Buscar o escanear código…'
            className='w-full text-base font-semibold text-[#2c3236] outline-none placeholder:text-[#8b949b]'
          />
        </div>
        <button className='flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-[#626e78] text-white'>
          <ScanBarcode className='h-6 w-6' />
        </button>
      </div>

      <div className='flex-1 space-y-2 overflow-y-auto px-4 pb-24'>
        {grupos.map(([grupo, productos]) => {
          const contadosGrupo = productos.filter((p) => contadosPorProducto.has(p.productoId)).length
          return (
            <div key={grupo} className='space-y-2'>
              <p className='sticky top-0 bg-[#eef0f1] py-1 text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>
                {grupo} · {contadosGrupo} de {productos.length}
              </p>
              {productos.map((p) => {
                const contado = contadosPorProducto.get(p.productoId)
                return (
                  <button
                    key={p.productoId}
                    onClick={() => abrirProducto(p)}
                    className='flex w-full items-center gap-3 rounded-[10px] border border-[#e5e8ea] bg-white px-4 py-3.5 text-left'
                  >
                    <span className='flex-1'>
                      <span className='block text-[16px] font-bold text-[#2c3236]'>{p.nombre}</span>
                      <span className='block text-sm font-semibold text-[#8b949b]'>
                        {[p.presentacion, p.unidad, p.codigo].filter((x) => x !== '').join(' · ')}
                      </span>
                    </span>
                    {contado !== undefined ? (
                      <span className='flex items-center gap-2 rounded-full bg-[#80a76e] px-3.5 py-2'>
                        <span className='text-[17px] font-bold tabular-nums text-[#2c3236]'>
                          {String(contado).replace('.', ',')}
                        </span>
                        <Check className='h-4 w-4 text-[#2c3236]' strokeWidth={3} />
                      </span>
                    ) : (
                      <span className='h-[34px] w-[34px] rounded-full border-2 border-dashed border-[#b6bcc1]' />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className='absolute inset-x-0 bottom-0 p-4'>
        <button
          onClick={onTerminar}
          disabled={contados === 0}
          className='flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2c3236] text-base font-bold text-white shadow-lg disabled:opacity-40'
        >
          Terminar conteo
          <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
        </button>
      </div>

      {activo !== null && (
        <div className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/35' onClick={() => setActivo(null)}>
          <div
            className='w-full space-y-3 rounded-t-2xl bg-white px-4 pb-6 pt-2.5 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mx-auto h-1.5 w-11 rounded-full bg-[#dde0e3]' />
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-lg font-bold text-[#2c3236]'>{activo.nombre}</p>
                <p className='text-[13px] font-semibold text-[#8b949b]'>
                  Cantidad{activo.unidad !== '' ? ` en ${activo.unidad}` : ''}
                </p>
              </div>
              <p className='border-b-[3px] border-[#80a76e] px-1.5 text-4xl font-bold tabular-nums text-[#2c3236]'>
                {cantidad === '' ? '0' : cantidad}
              </p>
            </div>
            <TecladoNumerico
              conComa
              onTecla={(d) =>
                setCantidad((c) => {
                  if (d === ',' && (c.includes(',') || c === '')) return c
                  return c.length < 12 ? c + d : c
                })
              }
              onBorrar={() => setCantidad((c) => c.slice(0, -1))}
            />
            {conObservacion && (
              <input
                autoFocus
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder='Observación'
                className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
              />
            )}
            <div className='flex gap-2.5'>
              <button
                onClick={() => setConObservacion((v) => !v)}
                className='flex h-14 w-14 items-center justify-center rounded-lg border border-[#dde0e3] text-[#626e78]'
              >
                <MessageSquare className='h-5 w-5' />
              </button>
              <button
                onClick={guardar}
                disabled={cantidad === ''}
                className='flex h-14 flex-1 items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
              >
                Guardar y siguiente
                <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Cablear `InventarioApp.tsx`**

Reemplazar el componente `VistaActual` placeholder por el real (mismo archivo):

```tsx
const VistaActual = ({
  pin,
  sesion,
  vista,
  setVista
}: {
  pin: string
  sesion: SesionInventario
  vista: Vista
  setVista: (v: Vista) => void
}) => {
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  if (vista.tipo === 'captura') {
    return (
      <CapturaConteo
        pin={pin}
        sesion={sesion}
        conteoId={vista.conteoId}
        onVolver={() => setVista({ tipo: 'lista' })}
        onTerminar={async () => {
          // Cerrar pasa a revision (endpoint de la Tarea 11); hasta entonces solo navega.
          await fetch(`/api/inventario/conteos/${vista.conteoId}/cerrar`, {
            method: 'POST',
            body: JSON.stringify({ pin })
          }).catch(() => null)
          setVista({ tipo: 'revision', conteoId: vista.conteoId })
        }}
      />
    )
  }
  if (vista.tipo === 'revision') {
    return (
      <RevisionConteo
        pin={pin}
        sesion={sesion}
        conteoId={vista.conteoId}
        onVolver={() => setVista({ tipo: 'lista' })}
      />
    )
  }
  return (
    <>
      <ListaConteos
        pin={pin}
        sesion={sesion}
        onAbrirCaptura={(conteoId) => setVista({ tipo: 'captura', conteoId })}
        onAbrirRevision={(conteoId) => setVista({ tipo: 'revision', conteoId })}
        onNuevo={() => setNuevoAbierto(true)}
      />
      {nuevoAbierto && (
        <NuevoConteoSheet
          pin={pin}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={(conteoId) => {
            setNuevoAbierto(false)
            setVista({ tipo: 'captura', conteoId })
          }}
        />
      )}
    </>
  )
}
```

(Imports nuevos: `ListaConteos`, `NuevoConteoSheet`, `CapturaConteo`, `RevisionConteo` — hasta la Tarea 13 crear un stub `RevisionConteo.tsx` que muestre "Revisión (Tarea 13)" con un botón Volver, para que compile.)

- [ ] **Step 5: Prueba manual completa, tsc y commit**

En navegador móvil: login → nuevo conteo → capturar 3 productos (uno con coma decimal, uno recontado) → verificar check verde y progreso → buscar por nombre → tipear un código exacto + Enter → sheet directo.
En SQL: `SELECT * FROM KDS_ConteoDetalles WHERE ConteoID=<id>` → snapshots correctos.
Run: `npx tsc --noEmit`

```bash
git add "src/app/(pages)/inventario"
git commit -m "inventario: lista de conteos, alta y captura ciega con lector fisico"
```

---

### Task 11: Transiciones cerrar / reabrir / anular

**Files:**
- Create: `src/actions/inventario/transiciones.ts`
- Create: `src/app/api/inventario/conteos/[id]/cerrar/route.ts`
- Create: `src/app/api/inventario/conteos/[id]/reabrir/route.ts`
- Create: `src/app/api/inventario/conteos/[id]/anular/route.ts`

**Interfaces:**
- Consumes: `getCabecera` (Tarea 7), `autenticar` (Tarea 8), helpers de rol (Tarea 1).
- Produces: `cerrarConteo`, `reabrirConteo`, `anularConteo` — todas `(conteoId, sesion) => Promise<{ ok: boolean; mensaje: string }>`; transiciones con UPDATE condicional por estado (nunca lectura-luego-escritura).

- [ ] **Step 1: Implementar `transiciones.ts`**

```ts
import sql from 'mssql'
import moment from 'moment-timezone'
import { getPool } from '../db'
import { ensureTablasConteo } from './schema'
import { getCabecera } from './conteos'
import { puedeAnular, puedeReabrir } from '@/contants/inventario'
import { SesionInventario } from '@/interfaces/Inventario'

const ahoraLaPaz = () => moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')

// Todas las transiciones usan UPDATE ... WHERE Estado='<origen>' como gate:
// rowsAffected=0 significa que otro request gano la carrera.
export async function cerrarConteo(conteoId: number, sesion: SesionInventario) {
  await ensureTablasConteo()
  const cab = await getCabecera(conteoId)
  if (!cab) return { ok: false, mensaje: 'Conteo inexistente' }
  if (cab.meseroId !== sesion.meseroId) return { ok: false, mensaje: 'El conteo pertenece a otro usuario' }
  const pool = await getPool()
  const result = await pool
    .request()
    .input('conteoId', sql.Int, conteoId)
    .query(`UPDATE KDS_Conteos SET Estado = 'revision' WHERE ConteoID = @conteoId AND Estado = 'abierto'`)
  return result.rowsAffected[0] > 0
    ? { ok: true, mensaje: 'Conteo cerrado, listo para revisión' }
    : { ok: false, mensaje: 'El conteo no está abierto' }
}

export async function reabrirConteo(conteoId: number, sesion: SesionInventario) {
  await ensureTablasConteo()
  if (!puedeReabrir(sesion.tipoUsuarioId)) return { ok: false, mensaje: 'Sin permiso para reabrir' }
  const pool = await getPool()
  const result = await pool
    .request()
    .input('conteoId', sql.Int, conteoId)
    .query(`UPDATE KDS_Conteos SET Estado = 'abierto' WHERE ConteoID = @conteoId AND Estado = 'revision'`)
  return result.rowsAffected[0] > 0
    ? { ok: true, mensaje: 'Conteo reabierto' }
    : { ok: false, mensaje: 'El conteo no está en revisión' }
}

export async function anularConteo(conteoId: number, sesion: SesionInventario) {
  await ensureTablasConteo()
  const cab = await getCabecera(conteoId)
  if (!cab) return { ok: false, mensaje: 'Conteo inexistente' }
  const esDueno = cab.meseroId === sesion.meseroId
  if (!puedeAnular(sesion.tipoUsuarioId, esDueno, cab.estado)) {
    return { ok: false, mensaje: 'Sin permiso para anular' }
  }
  const pool = await getPool()
  const result = await pool
    .request()
    .input('conteoId', sql.Int, conteoId)
    .input('meseroId', sql.Int, sesion.meseroId)
    .input('fecha', sql.VarChar, ahoraLaPaz())
    .query(`
      UPDATE KDS_Conteos
      SET Estado = 'anulado', FechaAnulacion = @fecha, AnuladoPorMeseroID = @meseroId
      WHERE ConteoID = @conteoId AND Estado IN ('abierto', 'revision')
    `)
  return result.rowsAffected[0] > 0
    ? { ok: true, mensaje: 'Conteo anulado' }
    : { ok: false, mensaje: 'El conteo ya no se puede anular' }
}
```

- [ ] **Step 2: Las tres rutas (misma forma, cambia la action)**

`cerrar/route.ts` (reabrir y anular idénticas cambiando el import y la función):

```ts
import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { cerrarConteo } from '@/actions/inventario/transiciones'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    const resultado = await cerrarConteo(conteoId, auth.sesion)
    if (!resultado.ok) return NextResponse.json({ error: resultado.mensaje }, { status: 409 })
    return NextResponse.json({ message: resultado.mensaje }, { status: 200 })
  } catch (error) {
    console.error('Error al cerrar conteo:', error)
    return NextResponse.json({ error: 'Error al cerrar el conteo' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verificar con curl (cerrar dos veces → segunda 409), tsc y commit**

```bash
git add src/actions/inventario/transiciones.ts "src/app/api/inventario/conteos/[id]/cerrar" "src/app/api/inventario/conteos/[id]/reabrir" "src/app/api/inventario/conteos/[id]/anular"
git commit -m "inventario: transiciones de estado con gate condicional"
```

---

### Task 12: Aplicar — la transacción

**Files:**
- Create: `src/actions/inventario/aplicarConteo.ts`
- Create: `src/app/api/inventario/conteos/[id]/aplicar/route.ts`

**Interfaces:**
- Consumes: `getCabecera`, `derivarRevision`, `puedeAplicar`, `autenticar`.
- Produces: `aplicarConteo(conteoId: number, sesion: SesionInventario): Promise<ResultadoAplicar>`. `POST .../aplicar` body `{ pin }` → 200 `{ message, ajusteId }` | 409.

- [ ] **Step 1: Implementar `aplicarConteo.ts`** (orden EXACTO del spec §7)

```ts
import sql from 'mssql'
import moment from 'moment-timezone'
import { getPool } from '../db'
import { ensureTablasConteo } from './schema'
import { getCabecera } from './conteos'
import { puedeAplicar } from '@/contants/inventario'
import { ResultadoAplicar, SesionInventario } from '@/interfaces/Inventario'

const ahoraLaPaz = () => moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')
const redondear3 = (n: number) => Math.round(n * 1000) / 1000

// Aplica el conteo como ajuste del POS dentro de UNA transaccion (spec seccion 7):
// gate de estado -> INSERT Ajustes -> INSERT DetallesAjustes -> UPDATE stock -> AjusteID.
// Logg va fuera de la transaccion (best effort: su falla no revierte el ajuste).
export async function aplicarConteo(
  conteoId: number,
  sesion: SesionInventario
): Promise<ResultadoAplicar> {
  if (!puedeAplicar(sesion.tipoUsuarioId)) {
    return { ok: false, ajusteId: null, mensaje: 'Sin permiso para aplicar ajustes' }
  }
  await ensureTablasConteo()
  const cab = await getCabecera(conteoId)
  if (!cab) return { ok: false, ajusteId: null, mensaje: 'Conteo inexistente' }
  const colStock = `Stock${cab.almacenId}` // int validado

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  await transaction.begin()
  let ajusteId = 0
  try {
    // 1) Gate anti doble aplicacion.
    const gate = await new sql.Request(transaction)
      .input('conteoId', sql.Int, conteoId)
      .input('fecha', sql.VarChar, ahoraLaPaz())
      .input('meseroId', sql.Int, sesion.meseroId)
      .query(`
        UPDATE KDS_Conteos
        SET Estado = 'aplicado', FechaAplicacion = @fecha, AplicadoPorMeseroID = @meseroId
        WHERE ConteoID = @conteoId AND Estado = 'revision'
      `)
    if (gate.rowsAffected[0] === 0) {
      await transaction.rollback()
      return { ok: false, ajusteId: null, mensaje: 'El conteo no está en revisión (¿ya aplicado?)' }
    }

    // 2) Detalles contados + costos vivos (CostoBruto puede no existir en Productos).
    const colCostoBruto = await new sql.Request(transaction).query(
      `SELECT COL_LENGTH('Productos', 'CostoBruto') AS len`
    )
    const exprCostoBruto =
      colCostoBruto.recordset[0]?.len != null ? 'COALESCE(p.CostoBruto, 0)' : '0'
    const dets = await new sql.Request(transaction).input('conteoId', sql.Int, conteoId).query(`
      SELECT d.ProductoID, d.CantidadContada, d.StockSnapshot,
             COALESCE(d.Observacion, '') AS Observacion,
             COALESCE(p.Costo, 0) AS Costo, ${exprCostoBruto} AS CostoBruto
      FROM KDS_ConteoDetalles d
      INNER JOIN Productos p ON p.ID = d.ProductoID
      WHERE d.ConteoID = @conteoId
    `)
    if (dets.recordset.length === 0) {
      await transaction.rollback()
      return { ok: false, ajusteId: null, mensaje: 'El conteo no tiene productos capturados' }
    }

    // 3) Cabecera en Ajustes. Observacion compatible con los filtros LIKE del POS.
    const obs =
      `Conteo KDS #${conteoId}${cab.noVendibles ? '' : ''}` +
      (cab.noVendibles ? ' (No Vendibles)' : '')
    const identidad = await new sql.Request(transaction).query(
      `SELECT COLUMNPROPERTY(OBJECT_ID('Ajustes'), 'AjusteID', 'IsIdentity') AS esIdentity`
    )
    const esIdentity = identidad.recordset[0]?.esIdentity === 1
    if (esIdentity) {
      const ins = await new sql.Request(transaction)
        .input('fecha', sql.VarChar, ahoraLaPaz())
        .input('obs', sql.VarChar, obs)
        .input('almacenId', sql.Int, cab.almacenId)
        .query(`
          INSERT INTO Ajustes (Fecha, Observacion, AlmacenID, FechaRegistro)
          OUTPUT INSERTED.AjusteID
          VALUES (@fecha, @obs, @almacenId, @fecha)
        `)
      ajusteId = ins.recordset[0].AjusteID
    } else {
      // Cliente viejo max()+1: lock de aplicacion para no colisionar con una caja POS.
      const ins = await new sql.Request(transaction)
        .input('fecha', sql.VarChar, ahoraLaPaz())
        .input('obs', sql.VarChar, obs)
        .input('almacenId', sql.Int, cab.almacenId)
        .query(`
          EXEC sp_getapplock @Resource = 'Ajustes', @LockMode = 'Exclusive',
                             @LockOwner = 'Transaction', @LockTimeout = 5000;
          DECLARE @nuevoId int = (SELECT COALESCE(MAX(AjusteID), 0) + 1 FROM Ajustes);
          INSERT INTO Ajustes (AjusteID, Fecha, Observacion, AlmacenID, FechaRegistro)
          VALUES (@nuevoId, @fecha, @obs, @almacenId, @fecha);
          SELECT @nuevoId AS AjusteID;
        `)
      ajusteId = ins.recordset[0].AjusteID
    }

    // 4) Detalle + 5) stock, producto por producto dentro de la transaccion.
    for (const d of dets.recordset) {
      const delta = redondear3(d.CantidadContada - d.StockSnapshot)
      await new sql.Request(transaction)
        .input('cantidad', sql.Float, delta)
        .input('cantidadFinal', sql.Float, d.CantidadContada)
        .input('obs', sql.VarChar, d.Observacion)
        .input('ajusteId', sql.Int, ajusteId)
        .input('productoId', sql.Int, d.ProductoID)
        .input('costo', sql.Float, d.Costo)
        .input('costoBruto', sql.Float, d.CostoBruto)
        .query(`
          INSERT INTO DetallesAjustes (Cantidad, CantidadFinal, Observacion, AjusteID, ProductoID, Costo, CostoBruto)
          VALUES (@cantidad, @cantidadFinal, @obs, @ajusteId, @productoId, @costo, @costoBruto)
        `)
      if (delta !== 0) {
        await new sql.Request(transaction)
          .input('delta', sql.Float, delta)
          .input('productoId', sql.Int, d.ProductoID)
          .query(`
            UPDATE Productos
            SET ${colStock} = COALESCE(${colStock}, 0) + @delta
            WHERE ID = @productoId
          `)
      }
    }

    // 6) Referencia cruzada en el conteo.
    await new sql.Request(transaction)
      .input('conteoId', sql.Int, conteoId)
      .input('ajusteId', sql.Int, ajusteId)
      .query(`UPDATE KDS_Conteos SET AjusteID = @ajusteId WHERE ConteoID = @conteoId`)

    await transaction.commit()
  } catch (error) {
    try {
      await transaction.rollback()
    } catch {
      /* transaccion ya abortada */
    }
    console.error('Error al aplicar conteo (rollback completo):', error)
    return { ok: false, ajusteId: null, mensaje: 'Error al aplicar: no se movió nada de stock' }
  }

  // 7) Bitacora del POS, fuera de la transaccion (best effort).
  try {
    const pool2 = await getPool()
    await pool2
      .request()
      .input('fecha', sql.VarChar, ahoraLaPaz())
      .input('accion', sql.VarChar, `Aplicó ajuste ${ajusteId} del conteo KDS #${conteoId} (almacén ${cab.almacenId})`.slice(0, 199))
      .input('userId', sql.Int, sesion.meseroId)
      .query(`INSERT INTO Logg (Fecha, Accion, Formulario, UserID) VALUES (@fecha, @accion, 'KDS Inventario', @userId)`)
  } catch (error) {
    console.error('No se pudo escribir la bitácora Logg del ajuste:', error)
  }

  return { ok: true, ajusteId, mensaje: `Ajuste #${ajusteId} aplicado` }
}
```

- [ ] **Step 2: Implementar `aplicar/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { aplicarConteo } from '@/actions/inventario/aplicarConteo'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    const resultado = await aplicarConteo(conteoId, auth.sesion)
    if (!resultado.ok) return NextResponse.json({ error: resultado.mensaje }, { status: 409 })
    return NextResponse.json({ message: resultado.mensaje, ajusteId: resultado.ajusteId }, { status: 200 })
  } catch (error) {
    console.error('Error al aplicar conteo:', error)
    return NextResponse.json({ error: 'Error al aplicar el conteo' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verificación de integridad en la BD de desarrollo**

Guion completo con curl + SQL:
1. Crear conteo, capturar 2 productos (uno con delta +, otro −), cerrar.
2. Anotar `SELECT Stock<N> FROM Productos WHERE ID IN (...)`.
3. Aplicar → 200 con `ajusteId`.
4. Verificar: `Ajustes` tiene la fila con `Observacion = 'Conteo KDS #<id>'`; `DetallesAjustes` 2 filas con `Cantidad`=delta y `CantidadFinal`=contado; `Productos.Stock<N>` movido exactamente delta; `KDS_Conteos.Estado='aplicado'` y `AjusteID` seteado; `Logg` con la acción.
5. Aplicar de nuevo → 409 y CERO filas nuevas.
6. Abrir el ajuste en el POS (frmAjustes → Ver) → se lista y abre normal.

- [ ] **Step 4: tsc y commit**

```bash
git add src/actions/inventario/aplicarConteo.ts "src/app/api/inventario/conteos/[id]/aplicar"
git commit -m "inventario: aplicacion transaccional del ajuste en tablas POS"
```

---

### Task 13: UI — pantalla de revisión

**Files:**
- Create: `src/app/(pages)/inventario/(components)/RevisionConteo.tsx` (reemplaza el stub)

**Interfaces:**
- Consumes: `GET conteos/[id]`, `derivarRevision`, rutas aplicar/reabrir/anular, `PinGate` (modo modal de re-tecleo), helpers de rol.
- Produces: pantalla según mockup `Revision.dc.html`: strip Sobrante/Faltante/Neto, chips Todos/Con diferencia/Deriva, columnas alineadas (anchos fijos 60/62/44px, text-right), badge deriva, acciones con re-PIN.

- [ ] **Step 1: Implementar `RevisionConteo.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Lock, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { derivarRevision } from '@/utils/conteoInventario'
import { puedeAplicar, puedeReabrir, puedeAnular } from '@/contants/inventario'
import { ConteoDetalleDb, ConteoResumen, SesionInventario } from '@/interfaces/Inventario'
import { PinGate } from './PinGate'

type Filtro = 'todos' | 'diferencia' | 'deriva'

export const RevisionConteo = ({
  pin,
  sesion,
  conteoId,
  onVolver
}: {
  pin: string
  sesion: SesionInventario
  conteoId: number
  onVolver: () => void
}) => {
  const [conteo, setConteo] = useState<ConteoResumen | null>(null)
  const [detalles, setDetalles] = useState<ConteoDetalleDb[]>([])
  const [conDiferencias, setConDiferencias] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  // accion pendiente que exige re-tecleo de PIN
  const [confirmando, setConfirmando] = useState<'aplicar' | 'anular' | null>(null)

  const cargar = useCallback(async () => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}`, {
      headers: { 'x-kds-pin': pin }
    })
    if (!resp.ok) return
    const data = await resp.json()
    setConteo(data.conteo)
    setDetalles(data.detalles)
    setConDiferencias(data.conDiferencias)
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const revision = useMemo(() => derivarRevision(detalles), [detalles])
  const filas = useMemo(() => {
    if (filtro === 'diferencia') return revision.filas.filter((f) => f.delta !== 0)
    if (filtro === 'deriva') return revision.filas.filter((f) => f.deriva)
    return revision.filas
  }, [revision, filtro])
  const conDif = revision.filas.filter((f) => f.delta !== 0).length
  const conDeriva = revision.filas.filter((f) => f.deriva).length

  const ejecutar = async (accion: 'aplicar' | 'anular' | 'reabrir', pinConfirmado?: string) => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}/${accion}`, {
      method: 'POST',
      body: JSON.stringify({ pin: pinConfirmado ?? pin })
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      toast.error(data.error ?? `No se pudo ${accion}`)
      return
    }
    toast.success(data.message ?? 'Listo')
    if (accion === 'reabrir') onVolver()
    else await cargar()
  }

  if (conteo === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  const fmtBs = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}Bs ${Math.abs(n).toFixed(2)}`
  const fmtNum = (n: number) => String(n).replace('.', ',')
  const enRevision = conteo.estado === 'revision'

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div
        className='flex items-center gap-2 py-3 pl-2 pr-3'
        style={{ backgroundColor: enRevision ? '#eac568' : '#626e78', color: enRevision ? '#2c3236' : '#ffffff' }}
      >
        <button onClick={onVolver} className='flex h-11 w-11 items-center justify-center rounded-lg'>
          <ChevronLeft className='h-6 w-6' strokeWidth={2.5} />
        </button>
        <div className='flex-1'>
          <p className='text-lg font-bold uppercase leading-tight tracking-wide'>
            {conteo.estado === 'aplicado' ? `Ajuste #${conteo.ajusteId ?? ''}` : conteo.estado === 'anulado' ? 'Anulado' : 'Revisión'}
          </p>
          <p className='text-[13px] font-semibold opacity-80'>
            {conteo.almacenNombre} · Conteo #{conteoId} · {conteo.meseroNombre}
          </p>
        </div>
        <span className='rounded-full bg-[#2c3236] px-3 py-1.5 text-[13px] font-bold tabular-nums text-white'>
          {detalles.length} contados
        </span>
      </div>

      {conDiferencias && (
        <div className='flex gap-px bg-[#dde0e3]'>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Sobrante</p>
            <p className='text-xl font-bold tabular-nums text-[#5d8a4a]'>{fmtBs(revision.sobrante)}</p>
          </div>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Faltante</p>
            <p className='text-xl font-bold tabular-nums text-[#b85c5c]'>{fmtBs(revision.faltante)}</p>
          </div>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Neto</p>
            <p className='text-xl font-bold tabular-nums text-[#2c3236]'>{fmtBs(revision.neto)}</p>
          </div>
        </div>
      )}

      {conDiferencias && (
        <div className='flex gap-2 px-4 pb-1 pt-3'>
          {(
            [
              ['todos', `Todos (${revision.filas.length})`],
              ['diferencia', `Con diferencia (${conDif})`],
              ['deriva', `Deriva (${conDeriva})`]
            ] as [Filtro, string][]
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setFiltro(clave)}
              className={
                filtro === clave
                  ? 'h-11 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                  : 'h-11 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      {conDiferencias && (
        <div className='flex justify-end px-8 pt-1.5 text-xs font-bold uppercase tracking-wider text-[#8b949b]'>
          <span className='w-[60px] text-right'>Sistema</span>
          <span className='w-[62px] text-right'>Contado</span>
          <span className='w-[44px] text-right'>Dif</span>
        </div>
      )}

      <div className='flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-1.5'>
        {filas.map((f) => (
          <div key={f.productoId} className='space-y-2 rounded-[10px] border border-[#e5e8ea] bg-white px-4 py-3'>
            <div className='flex items-center gap-3'>
              <div className='flex-1'>
                <p className='text-[16px] font-bold text-[#2c3236]'>{f.nombre}</p>
                <p className='text-[13px] font-semibold text-[#8b949b]'>
                  {[f.unidad, f.fechaConteo.slice(11, 16), f.observacion !== '' ? `"${f.observacion}"` : '']
                    .filter((x) => x !== '')
                    .join(' · ')}
                </p>
              </div>
              {conDiferencias ? (
                <div className='flex items-baseline tabular-nums'>
                  <span className='w-[60px] text-right text-[17px] font-semibold text-[#8b949b]'>{fmtNum(f.stockSnapshot)}</span>
                  <span className='w-[62px] text-right text-[17px] font-bold text-[#2c3236]'>{fmtNum(f.cantidadContada)}</span>
                  <span
                    className='w-[44px] text-right text-[17px] font-bold'
                    style={{ color: f.delta > 0 ? '#5d8a4a' : f.delta < 0 ? '#b85c5c' : '#8b949b' }}
                  >
                    {f.delta > 0 ? `+${fmtNum(f.delta)}` : fmtNum(f.delta)}
                  </span>
                </div>
              ) : (
                <span className='text-[17px] font-bold tabular-nums text-[#2c3236]'>{fmtNum(f.cantidadContada)}</span>
              )}
            </div>
            {conDiferencias && f.deriva && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-[#f7ecd2] px-3 py-1 text-xs font-bold text-[#8a6d1f]'>
                <TriangleAlert className='h-3.5 w-3.5' />
                Movió desde la captura (sistema hoy: {fmtNum(f.stockVivo)})
              </span>
            )}
          </div>
        ))}
      </div>

      {enRevision && conDiferencias && (
        <div className='space-y-2.5 bg-white p-4 pb-5 shadow-[0_-2px_12px_rgba(44,50,54,0.12)]'>
          {puedeAplicar(sesion.tipoUsuarioId) && (
            <button
              onClick={() => setConfirmando('aplicar')}
              className='flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236]'
            >
              <Lock className='h-5 w-5' />
              Aplicar ajuste · pide PIN
            </button>
          )}
          <div className='flex gap-2.5'>
            {puedeReabrir(sesion.tipoUsuarioId) && (
              <button
                onClick={() => ejecutar('reabrir')}
                className='h-12 flex-1 rounded-lg border border-[#dde0e3] text-base font-bold text-[#2c3236]'
              >
                Reabrir conteo
              </button>
            )}
            {puedeAnular(sesion.tipoUsuarioId, conteo.meseroId === sesion.meseroId, conteo.estado) && (
              <button
                onClick={() => setConfirmando('anular')}
                className='h-12 flex-1 rounded-lg border border-[#e6c9c9] text-base font-bold text-[#b85c5c]'
              >
                Anular
              </button>
            )}
          </div>
        </div>
      )}

      {confirmando !== null && (
        <div className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/50' onClick={() => setConfirmando(null)}>
          <div className='w-full rounded-t-2xl bg-white pb-4 pt-2' onClick={(e) => e.stopPropagation()}>
            <PinGate
              titulo={confirmando === 'aplicar' ? 'Confirmá con tu PIN para aplicar' : 'Confirmá con tu PIN para anular'}
              onSesion={(pinConfirmado) => {
                const accion = confirmando
                setConfirmando(null)
                ejecutar(accion, pinConfirmado)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Prueba manual del ciclo completo, tsc y commit**

Login supervisor → conteo → captura → terminar → revisión: verificar strip valorizado, filtros, deriva (vender algo desde el POS entre captura y revisión para provocarla), aplicar con re-PIN → header pasa a "Ajuste #N"; verificar en el POS. Anular otro conteo. Reabrir un tercero.
Run: `npx tsc --noEmit`

```bash
git add "src/app/(pages)/inventario/(components)/RevisionConteo.tsx" "src/app/(pages)/inventario/(components)/InventarioApp.tsx"
git commit -m "inventario: pantalla de revision con diferencias, deriva y acciones con re-PIN"
```

---

### Task 14: SideMenu, degradación, docs y build final

**Files:**
- Modify: `src/components/SideMenu.tsx`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md` (marcar estado implementado etapas 1-4)

**Interfaces:**
- Consumes: `GET /api/inventario/almacenes` NO sirve para gating (requiere PIN) → gating por `GET /api/estaciones`-style: agregar en `almacenes/route.ts` la variante sin PIN NO se hace; en su lugar el link se muestra siempre y la degradación real está en la página (si `getAlmacenes` devuelve `[]`, `NuevoConteoSheet` muestra "El POS no tiene almacenes configurados").

- [ ] **Step 1: Agregar link en `SideMenu.tsx`**

Seguir el patrón de los `<Link>` existentes (líneas ~56-79): agregar entrada "Inventario" hacia `/inventario` con ícono `Package` de lucide, visible siempre (el gate PIN ya protege el contenido).

- [ ] **Step 2: Documentar en `CLAUDE.md`**

Agregar subsección "### Inventario (conteos y ajustes) (2026-08)" después de la sección de cocina, con: marker de auth stateless por PIN, tablas `KDS_Conteos`/`KDS_ConteoDetalles`, aplicación transaccional en `Ajustes`/`DetallesAjustes`/`Stock<N>`, roles hardcodeados, backdoor bloqueada, referencia al spec.

- [ ] **Step 3: Build final único**

Matar `next dev` si corre. Run: `rm -rf .next && npm run build`
Expected: build limpio. Después relevantar dev si hace falta.

- [ ] **Step 4: Commit**

```bash
git add src/components/SideMenu.tsx CLAUDE.md docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md
git commit -m "inventario: entrada en menu, docs y build verificado"
```

---

### Task 15: Escáner con cámara (Etapa 5)

**Files:**
- Create: `src/app/(pages)/inventario/(components)/EscanerCodigo.tsx`
- Modify: `src/app/(pages)/inventario/(components)/CapturaConteo.tsx` (cablear botón escáner)
- Modify: `package.json` (dependencia `@zxing/browser`)
- Modify: `en Raiz/Instrucciones.txt` (flag de Chrome para cámara por HTTP)

**Interfaces:**
- Consumes: `abrirProducto`-flow de `CapturaConteo` vía prop `onCodigo: (codigo: string) => void`.
- Produces: `EscanerCodigo({ abierto, onCodigo, onCerrar })` — overlay con 3 capas: `BarcodeDetector` nativo → `@zxing/browser` → `<input type="file" capture>` + decode de foto.

- [ ] **Step 1: `npm i @zxing/browser` (pin exacto en package.json)**

- [ ] **Step 2: Implementar `EscanerCodigo.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'

// Escaner de codigos de barras en 3 capas (spec seccion 11):
// 1. BarcodeDetector nativo (Chrome/Android) — requiere isSecureContext.
// 2. @zxing/browser sobre getUserMedia — idem.
// 3. Foto con <input capture> decodificada por zxing — funciona por HTTP.
type Capa = 'nativo' | 'zxing' | 'foto'

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
    }
  }
}

export const EscanerCodigo = ({
  abierto,
  onCodigo,
  onCerrar
}: {
  abierto: boolean
  onCodigo: (codigo: string) => void
  onCerrar: () => void
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pararRef = useRef<(() => void) | null>(null)
  const [capa, setCapa] = useState<Capa | null>(null)
  const [error, setError] = useState('')

  const detener = useCallback(() => {
    pararRef.current?.()
    pararRef.current = null
  }, [])

  useEffect(() => {
    if (!abierto) {
      detener()
      return
    }
    let cancelado = false

    const arrancar = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCapa('foto')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        if (window.BarcodeDetector) {
          setCapa('nativo')
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code']
          })
          const intervalo = setInterval(async () => {
            try {
              const codigos = await detector.detect(video)
              if (codigos.length > 0) {
                onCodigo(codigos[0].rawValue)
              }
            } catch {
              /* frame no listo */
            }
          }, 300)
          pararRef.current = () => {
            clearInterval(intervalo)
            stream.getTracks().forEach((t) => t.stop())
          }
        } else {
          setCapa('zxing')
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const lector = new BrowserMultiFormatReader()
          const controles = await lector.decodeFromStream(stream, video, (resultado) => {
            if (resultado) onCodigo(resultado.getText())
          })
          pararRef.current = () => {
            controles.stop()
            stream.getTracks().forEach((t) => t.stop())
          }
        }
      } catch {
        setCapa('foto')
      }
    }
    arrancar()
    return () => {
      cancelado = true
      detener()
    }
  }, [abierto, onCodigo, detener])

  const decodificarFoto = async (archivo: File) => {
    setError('')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const lector = new BrowserMultiFormatReader()
      const url = URL.createObjectURL(archivo)
      try {
        const resultado = await lector.decodeFromImageUrl(url)
        onCodigo(resultado.getText())
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      setError('No se pudo leer el código en la foto. Probá de nuevo, más cerca.')
    }
  }

  if (!abierto) return null

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-[#2c3236]'>
      <div className='flex items-center justify-between p-4 text-white'>
        <p className='text-lg font-bold'>Escanear código</p>
        <button onClick={onCerrar} className='flex h-11 w-11 items-center justify-center rounded-full bg-white/15'>
          <X className='h-6 w-6' />
        </button>
      </div>
      {capa === 'foto' ? (
        <div className='flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-white'>
          <Camera className='h-12 w-12 opacity-60' />
          <p className='text-sm opacity-80'>
            La cámara en vivo necesita HTTPS o el flag de Chrome (ver Instrucciones.txt). Mientras tanto: sacá una
            foto del código.
          </p>
          {error !== '' && <p className='text-sm font-bold text-[#eac568]'>{error}</p>}
          <label className='flex h-14 cursor-pointer items-center justify-center rounded-lg bg-[#80a76e] px-8 text-lg font-bold text-[#2c3236]'>
            Tomar foto
            <input
              type='file'
              accept='image/*'
              capture='environment'
              className='hidden'
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (archivo) decodificarFoto(archivo)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      ) : (
        <div className='relative flex-1'>
          <video ref={videoRef} className='h-full w-full object-cover' muted playsInline />
          <div className='pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-[#d17f7f]' />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Cablear en `CapturaConteo.tsx`**

Estado `const [escanerAbierto, setEscanerAbierto] = useState(false)`; el botón del ícono `ScanBarcode` hace `setEscanerAbierto(true)`; render al final:

```tsx
<EscanerCodigo
  abierto={escanerAbierto}
  onCerrar={() => setEscanerAbierto(false)}
  onCodigo={(codigo) => {
    const matches = (datos?.productos ?? []).filter(
      (p) => p.codigo !== '' && p.codigo.toLowerCase() === codigo.trim().toLowerCase()
    )
    if (matches.length === 1) {
      setEscanerAbierto(false)
      abrirProducto(matches[0])
    } else if (matches.length === 0) {
      toast.error(`Código no registrado: ${codigo}`)
    } else {
      setEscanerAbierto(false)
      setBusqueda(codigo)
    }
  }}
/>
```

Modo ráfaga: tras `guardar()` exitoso, si el escáner estaba abierto al elegir el producto, reabrirlo (`setEscanerAbierto(true)`).

- [ ] **Step 4: Documentar el flag en `en Raiz/Instrucciones.txt`**

Agregar sección: para cámara en vivo por HTTP, en cada tablet abrir `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, poner `http://<ip-del-servidor>:3000`, Enabled, relanzar Chrome. Sin el flag funciona el modo foto.

- [ ] **Step 5: Prueba en dispositivo real, tsc, build final y commit**

Probar en Android real: con flag (cámara en vivo) y sin flag (foto). Verificar modo ráfaga.
Run: `npx tsc --noEmit`; matar dev, `rm -rf .next && npm run build`.

```bash
git add "src/app/(pages)/inventario/(components)/EscanerCodigo.tsx" "src/app/(pages)/inventario/(components)/CapturaConteo.tsx" package.json package-lock.json "en Raiz/Instrucciones.txt"
git commit -m "inventario: escaner de codigos con camara (BarcodeDetector/zxing/foto)"
```
