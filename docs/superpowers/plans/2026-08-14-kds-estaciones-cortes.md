# Pantallas-estacion y cortes por pintado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El KDS deriva "cortes" de produccion de las ordenes pintadas y agrega dos superficies nuevas: un popup de carga por estacion al pintar, y pantallas-estacion pasivas que muestran cuanto preparar por corte.

**Architecture:** Cero estado nuevo: el corte se deriva (funcion pura `derivarCortes`) de `KDS_Snooze.Resaltado` + `DetalleCuenta` pendiente + tablas `Cocina*` del POS. Un modulo servidor (`getCocina.ts`) alimenta dos endpoints nuevos y la respuesta ampliada del PATCH de resaltar. El POS solo suma una columna `MostrarProductos` a `CocinaEstaciones`.

**Tech Stack:** ordersDisplay: Next.js 15.3.1 App Router, React 18, TypeScript strict, mssql 11, Tailwind + shadcn (new-york), moment-timezone, use-sound, react-masonry-css. POS: VB.NET 4.8 WinForms (repo Restotech).

**Spec:** `docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md` (mismo repo). Contraparte POS: `Restotech\docs\superpowers\specs\2026-08-14-cocina-estaciones-componentes-design.md`.

## Global Constraints

- **NO ROMPER LO EXISTENTE (pedido explicito del usuario).** Pantallas de equipo, despachos, VisorCliente, snooze, historial y el flujo de despacho quedan con comportamiento identico. Solo se modifican 5 archivos existentes del KDS, todos con cambios aditivos: `src/app/api/ordenes/route.ts` (PATCH devuelve un campo mas), `Orders.tsx` (solo `handleHighlight` + montar un dialog), `FormConfig.tsx` (select agrupado), `SideMenu.tsx` (conteo), `src/app/page.tsx` (wrapper). Todo lo demas es archivo nuevo.
- Repos: tareas KDS en `C:\Toptech\Codigos\GitHub\ordersDisplay` (branch master); Tarea 1 en `C:\Toptech\Codigos\GitHub\Restotech` (branch master). Sin branches nuevos.
- Sin dependencias nuevas en package.json. El script de sanidad corre con `npx -y tsx` (descarga efimera, no se instala).
- Texto de UI y dominio en español. La carpeta `src/contants/` se llama asi a proposito, no corregir.
- Escrituras SQL con `.input()` parametrizado; en strings solo se interpolan fragmentos cerrados calculados por el codigo (patron existente `${despachoStr}`).
- No tocar el balance de timezone (`America/La_Paz` + `TZ=UTC` + `useUTC:false`); las horas viajan como ISO y el cliente hace `.replace('Z','')` antes del timer, igual que hoy.
- VB (Tarea 1): comentarios estilo `'Claude 14agosto2026:` de max 2 lineas; los archivos `Cocina\*.vb` son UTF-8 BOM (seguros para Edit); `MsgBox` nunca `MessageBox.Show`; verificar con MSBuild y revertir el `.vbproj` si MSBuild le quita `<SubType>`.
- Ninguna tarea toca `getOrdenesSeparado.ts`, `getOrdenesEnCola.ts`, `getHistory.ts`, `actualizarOrden.ts` ni `processOrders.ts`.

---

### Task 1: POS — columna `MostrarProductos` en CocinaEstaciones

Repo: `C:\Toptech\Codigos\GitHub\Restotech`. Todo en encoding UTF-8 BOM (los archivos ya lo son).

**Files:**
- Modify: `Restotech\Cocina\clsCocinaEstaciones.vb`
- Modify: `Restotech\Cocina\ctlCocina.vb`
- Modify: `SistemaControlBoliche\Cocina\frmEntCocinaEstacion.vb`
- Modify: `SistemaControlBoliche\Cocina\frmEntCocinaEstacion.Designer.vb`
- Modify: `SistemaControlBoliche\Cocina\frmCocinaEstaciones.vb`

**Interfaces:**
- Consumes: modulo Cocina existente (ctlCocina, clsCocinaEstaciones, ABMs).
- Produces: columna `CocinaEstaciones.MostrarProductos` (BIT/YESNO, default 0) que la Tarea 3 del KDS lee con guarda `COL_LENGTH`. `ctlCocina.GuardarEstacion` gana el parametro `mostrarProductos As Boolean` (antes de `ByRef nuevoID`).

- [ ] **Step 1: clsCocinaEstaciones — atributo, propiedad, lecturas y escrituras**

En `Restotech\Cocina\clsCocinaEstaciones.vb`:

1. En `#Region "Atributos"`, despues de `Private Activo As Boolean` agregar:
```vb
    Private MostrarProductos As Boolean
```
2. En `#Region "Propiedades"`, despues de la propiedad `_Activo` agregar:
```vb
    Public Property _MostrarProductos As Boolean
        Get
            Return MostrarProductos
        End Get
        Set(value As Boolean)
            MostrarProductos = value
        End Set
    End Property
```
3. En `Devolver`, el primer argumento de `BD.ConsultaVer` pasa a:
```vb
        Return BD.ConsultaVer("CocinaEstaciones.EstacionCocinaID, CocinaEstaciones.Nombre, " &
                              "CocinaEstaciones.Capacidad, CocinaEstaciones.Orden, CocinaEstaciones.Activo, " &
                              "CocinaEstaciones.MostrarProductos",
                              "CocinaEstaciones", filtro,
                              " CocinaEstaciones.Nombre")
```
4. En `DevolverPorID`, la lista de columnas pasa a `"EstacionCocinaID, Nombre, Capacidad, Orden, Activo, MostrarProductos"`.
5. En `Insertar`, los valores y columnas pasan a:
```vb
        BD.ConsultaInsertar3("" &
                             "'" & NZ(Nombre, "").ToString.Replace("'", "`") & "'," &
                             "" & Capacidad & "," &
                             "" & Orden & "," &
                             "" & armarBolean(Activo) & "," &
                             "" & armarBolean(MostrarProductos),
                             "CocinaEstaciones(Nombre,Capacidad,Orden,Activo,MostrarProductos)", EstacionCocinaID)
```
6. En `Modificar`, el set pasa a:
```vb
        BD.ConsultaModificar("CocinaEstaciones",
                             "Nombre='" & NZ(Nombre, "").ToString.Replace("'", "`") & "'," &
                             "Capacidad=" & Capacidad & "," &
                             "Orden=" & Orden & "," &
                             "Activo=" & armarBolean(Activo) & "," &
                             "MostrarProductos=" & armarBolean(MostrarProductos),
                             "EstacionCocinaID=" & EstacionCocinaID.ToString)
```

- [ ] **Step 2: ctlCocina — CREATE actualizado, ALTER perezoso y GuardarEstacion**

En `Restotech\Cocina\ctlCocina.vb`:

1. En `AsegurarTablas`, el CREATE de `CocinaEstaciones` rama Access pasa a incluir la columna:
```vb
                If BD.ConsultWithOutAlerts("CREATE TABLE CocinaEstaciones (EstacionCocinaID AUTOINCREMENT PRIMARY KEY, " &
                                           "Nombre TEXT(100) NOT NULL, Capacidad INTEGER NOT NULL, " &
                                           "Orden INTEGER NOT NULL, Activo YESNO, MostrarProductos YESNO)") = 0 Then ok = False
```
   y la rama SQL Server:
```vb
                If BD.ConsultWithOutAlerts("CREATE TABLE CocinaEstaciones (EstacionCocinaID INT IDENTITY(1,1) NOT NULL PRIMARY KEY, " &
                                           "Nombre VARCHAR(100) NOT NULL, Capacidad INT NOT NULL, " &
                                           "Orden INT NOT NULL DEFAULT 0, Activo BIT NOT NULL DEFAULT 1, " &
                                           "MostrarProductos BIT NOT NULL DEFAULT 0)") = 0 Then ok = False
```
2. Inmediatamente despues de ese `End If` del bloque CocinaEstaciones (antes del sondeo de `CocinaComponentes`), agregar el ALTER perezoso para bases que ya tenian la tabla:
```vb
        'Claude 14agosto2026: columna nueva para estaciones tipo Armado (el KDS muestra productos, no componentes).
        If BD.ConsultWithOutAlerts("select top 1 MostrarProductos from CocinaEstaciones") Then
        Else
            If gMODO_ACCESS = 1 Then
                If BD.ConsultWithOutAlerts("ALTER TABLE CocinaEstaciones ADD COLUMN MostrarProductos YESNO") = 0 Then ok = False
            Else
                If BD.ConsultWithOutAlerts("ALTER TABLE CocinaEstaciones ADD MostrarProductos BIT NOT NULL DEFAULT 0") = 0 Then ok = False
            End If
        End If
```
3. `GuardarEstacion` gana el parametro antes del ByRef y setea la clase:
```vb
    Public Function GuardarEstacion(estacionID As Integer, nombre1 As String, capacidad As Integer,
                                    orden As Integer, activo As Boolean, mostrarProductos As Boolean,
                                    ByRef nuevoID As Integer) As String
```
   y despues de `clsEst._Activo = activo` agregar:
```vb
        clsEst._MostrarProductos = mostrarProductos
```

- [ ] **Step 3: frmEntCocinaEstacion — checkbox en Designer y code-behind**

En `SistemaControlBoliche\Cocina\frmEntCocinaEstacion.Designer.vb`:

1. Tras `Me.lblAyudaCapacidad = New System.Windows.Forms.Label()` agregar:
```vb
        Me.chbMostrarProductos = New System.Windows.Forms.CheckBox()
```
2. Tras el bloque `'chbActivo'` agregar:
```vb
        '
        'chbMostrarProductos
        '
        Me.chbMostrarProductos.AutoSize = True
        Me.chbMostrarProductos.Location = New System.Drawing.Point(108, 195)
        Me.chbMostrarProductos.Name = "chbMostrarProductos"
        Me.chbMostrarProductos.Size = New System.Drawing.Size(250, 17)
        Me.chbMostrarProductos.TabIndex = 5
        Me.chbMostrarProductos.Text = "Mostrar productos a armar en vez de componentes"
        Me.chbMostrarProductos.UseVisualStyleBackColor = True
```
3. Cambiar `Me.ClientSize = New System.Drawing.Size(380, 240)` por `Me.ClientSize = New System.Drawing.Size(380, 265)`.
4. Tras `Me.Controls.Add(Me.chbActivo)` agregar `Me.Controls.Add(Me.chbMostrarProductos)`.
5. Tras `Me.Controls.SetChildIndex(Me.chbActivo, 0)` agregar `Me.Controls.SetChildIndex(Me.chbMostrarProductos, 0)`.
6. En las declaraciones del final, tras `chbActivo` agregar:
```vb
    Friend WithEvents chbMostrarProductos As System.Windows.Forms.CheckBox
```

En `SistemaControlBoliche\Cocina\frmEntCocinaEstacion.vb`:

7. En `CargarDatos`, tras `chbActivo.Checked = True` agregar `chbMostrarProductos.Checked = False`, y tras `chbActivo.Checked = NZ(fila("Activo"), True)` agregar:
```vb
        chbMostrarProductos.Checked = NZ(fila("MostrarProductos"), False)
```
8. En `Guardar`, la llamada pasa a:
```vb
            Dim error1 As String = ctlCoc.GuardarEstacion(estacionID, txtNombre.Text,
                                                          CInt(NZ(txtCapacidad.Text, 0)),
                                                          CInt(NZ(txtOrden.Text, 0)),
                                                          chbActivo.Checked, chbMostrarProductos.Checked, nuevoID)
```
9. En `deshabilitarComponete`, agregar `chbMostrarProductos.Enabled = False`.

- [ ] **Step 4: frmCocinaEstaciones — ocultar la columna cruda en la grilla**

En `SistemaControlBoliche\Cocina\frmCocinaEstaciones.vb`, inmediatamente despues de la linea `dgvGrilla.Columns("EstacionCocinaID").Visible = False` agregar:
```vb
        dgvGrilla.Columns("MostrarProductos").Visible = False
```

- [ ] **Step 5: Compilar con MSBuild y verificar**

En PowerShell:
```powershell
$msbuild = & "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -find "MSBuild\**\Bin\MSBuild.exe"
& $msbuild "C:\Toptech\Codigos\GitHub\Restotech\SistemaControlBoliche\ControlConsumo.vbproj" /nologo /v:q /t:Build /p:Configuration=Debug 2>&1 | Select-String "error BC"
```
Expected: exit 0 y cero lineas `error BC`. Luego `git -C C:\Toptech\Codigos\GitHub\Restotech diff --stat` — si aparece tocado `ControlConsumo.vbproj` (MSBuild a veces le quita `<SubType>`), revertirlo con `git checkout -- SistemaControlBoliche/ControlConsumo.vbproj`.

- [ ] **Step 6: Commit (repo Restotech)**

```powershell
git -C C:\Toptech\Codigos\GitHub\Restotech add "Restotech/Cocina/clsCocinaEstaciones.vb" "Restotech/Cocina/ctlCocina.vb" "SistemaControlBoliche/Cocina/frmEntCocinaEstacion.vb" "SistemaControlBoliche/Cocina/frmEntCocinaEstacion.Designer.vb" "SistemaControlBoliche/Cocina/frmCocinaEstaciones.vb"
git -C C:\Toptech\Codigos\GitHub\Restotech commit -m "cocina: MostrarProductos en estaciones (vista por producto para armado en KDS)"
```

---

### Task 2: KDS — tipos + `derivarCortes` puro + script de sanidad

Repo: `C:\Toptech\Codigos\GitHub\ordersDisplay` (todas las tareas restantes).

**Files:**
- Create: `src/interfaces/Cocina.ts`
- Create: `src/utils/derivarCortes.ts`
- Create: `scripts/test-derivarCortes.ts`

**Interfaces:**
- Consumes: nada (funcion pura).
- Produces: todos los tipos del modulo y `derivarCortes(ordenes: OrdenCarga[], estaciones: EstacionCapacidad[]): Corte[]`. La Tarea 3 los importa. IMPORTANTE: `derivarCortes.ts` importa los tipos con ruta RELATIVA `../interfaces/Cocina` (no `@/`) para que el script de sanidad corra con `npx tsx` sin resolver el alias.

- [ ] **Step 1: Crear `src/interfaces/Cocina.ts`**

```ts
// Tipos del modulo de estaciones de cocina y cortes derivados.
// Spec: docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md

export interface Estacion {
  estacionCocinaId: number
  nombre: string
  capacidad: number // 0 = ilimitada
  orden: number
  mostrarProductos: boolean
}

export interface EstacionCapacidad {
  estacionCocinaId: number
  capacidad: number // 0 = ilimitada
}

// Carga total de una orden pintada pendiente, por estacion.
export interface OrdenCarga {
  visitaId: number
  orden: number
  horaEfectiva: string // ISO; wall clock La_Paz, mismo convenio que 'hora' en Orden
  ocupacionPorEstacion: Record<number, number>
}

export interface Corte {
  horaEtiqueta: string // 'HH:mm' del pedido mas viejo del corte
  horaInicio: string // ISO del pedido mas viejo (para el timer)
  ordenes: { visitaId: number; orden: number }[]
  ocupacionPorEstacion: Record<number, number>
  excedido: boolean // una orden sobredimensionada supero la capacidad
}

export interface ItemCorteEstacion {
  nombre: string
  cantidad: number
}

export interface CorteEstacion {
  horaEtiqueta: string
  horaInicio: string
  items: ItemCorteEstacion[]
}

export interface CargaEstacionResponse {
  estacion: { nombre: string; mostrarProductos: boolean } | null
  cortes: CorteEstacion[]
}

export interface ResumenEstacionPintado {
  nombre: string
  unidades: number
  ocupacion: number
  capacidad: number // 0 = ilimitada
}

export interface ResumenPintado {
  generaTrabajo: boolean
  abreCorteNuevo: boolean
  excedido: boolean
  horaEtiqueta: string
  estaciones: ResumenEstacionPintado[]
}
```

- [ ] **Step 2: Crear `scripts/test-derivarCortes.ts` (el test primero)**

```ts
// Sanidad de derivarCortes. Correr con: npx -y tsx scripts/test-derivarCortes.ts
// No hay test runner en el repo; node:assert alcanza para la unica pieza algoritmica.
import assert from 'node:assert/strict'
import { derivarCortes } from '../src/utils/derivarCortes'
import { EstacionCapacidad, OrdenCarga } from '../src/interfaces/Cocina'

const PLANCHA = 1
const FRITURA = 2
const ARMADO = 3
const estaciones: EstacionCapacidad[] = [
  { estacionCocinaId: PLANCHA, capacidad: 25 },
  { estacionCocinaId: FRITURA, capacidad: 20 },
  { estacionCocinaId: ARMADO, capacidad: 0 }
]

const orden = (
  visitaId: number,
  hora: string,
  ocupacion: Record<number, number>
): OrdenCarga => ({
  visitaId,
  orden: 1,
  horaEfectiva: `2026-08-14T${hora}:00.000Z`,
  ocupacionPorEstacion: ocupacion
})

// 1. Dos ordenes llenan la plancha justo: un solo corte, etiqueta de la mas vieja.
{
  const cortes = derivarCortes(
    [orden(2, '12:05', { [PLANCHA]: 10 }), orden(1, '12:03', { [PLANCHA]: 15 })],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.equal(cortes[0].horaEtiqueta, '12:03')
  assert.equal(cortes[0].ocupacionPorEstacion[PLANCHA], 25)
  assert.equal(cortes[0].excedido, false)
  assert.deepEqual(cortes[0].ordenes[0], { visitaId: 1, orden: 1 })
}

// 2. La tercera no cabe: abre el segundo corte con su propia hora.
{
  const cortes = derivarCortes(
    [
      orden(1, '12:03', { [PLANCHA]: 15 }),
      orden(2, '12:05', { [PLANCHA]: 10 }),
      orden(3, '12:10', { [PLANCHA]: 5 })
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.equal(cortes[1].horaEtiqueta, '12:10')
  assert.equal(cortes[1].ocupacionPorEstacion[PLANCHA], 5)
}

// 3. Capacidad 0 nunca limita.
{
  const cortes = derivarCortes(
    [orden(1, '12:00', { [ARMADO]: 500 }), orden(2, '12:01', { [ARMADO]: 500 })],
    estaciones
  )
  assert.equal(cortes.length, 1)
}

// 4. Orden sin configuracion de cocina: no ocupa ni abre cortes.
{
  const cortes = derivarCortes([orden(1, '12:00', {})], estaciones)
  assert.equal(cortes.length, 0)
}

// 5. Sobredimensionada: corte propio marcado excedido.
{
  const cortes = derivarCortes(
    [orden(1, '12:00', { [PLANCHA]: 10 }), orden(2, '12:01', { [PLANCHA]: 30 })],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.equal(cortes[0].excedido, false)
  assert.equal(cortes[1].excedido, true)
}

// 6. Multi-estacion: no cabe si excede en UNA sola de sus estaciones.
{
  const cortes = derivarCortes(
    [
      orden(1, '12:00', { [PLANCHA]: 5, [FRITURA]: 10 }),
      orden(2, '12:01', { [PLANCHA]: 10, [FRITURA]: 15 }) // Plancha cabria, Fritura no
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
}

// 7. Desempate estable a hora igual: por visitaId.
{
  const cortes = derivarCortes(
    [orden(9, '12:00', { [PLANCHA]: 20 }), orden(1, '12:00', { [PLANCHA]: 20 })],
    estaciones
  )
  assert.deepEqual(cortes[0].ordenes[0], { visitaId: 1, orden: 1 })
  assert.equal(cortes.length, 2)
}

console.log('derivarCortes: 7/7 casos OK')
```

- [ ] **Step 3: Correr el script y verificar que falla**

Run: `npx -y tsx scripts/test-derivarCortes.ts`
Expected: FAIL con "Cannot find module '../src/utils/derivarCortes'".

- [ ] **Step 4: Crear `src/utils/derivarCortes.ts`**

```ts
// Import relativo a proposito: el script de sanidad corre con npx tsx fuera de Next.
import { Corte, EstacionCapacidad, OrdenCarga } from '../interfaces/Cocina'

// Llenado greedy secuencial: cada orden pintada pendiente entra al corte en
// construccion si cabe entera en TODAS sus estaciones con capacidad; si no,
// abre el corte siguiente. Deterministico: mismo input, mismos cortes.
export function derivarCortes(
  ordenes: OrdenCarga[],
  estaciones: EstacionCapacidad[]
): Corte[] {
  const capacidades = new Map(
    estaciones.map((e) => [e.estacionCocinaId, e.capacidad])
  )

  const ordenadas = [...ordenes].sort((a, b) => {
    if (a.horaEfectiva !== b.horaEfectiva)
      return a.horaEfectiva < b.horaEfectiva ? -1 : 1
    if (a.visitaId !== b.visitaId) return a.visitaId - b.visitaId
    return a.orden - b.orden
  })

  const cortes: Corte[] = []
  let actual: Corte | null = null

  for (const ordenCarga of ordenadas) {
    const entradas = Object.entries(ordenCarga.ocupacionPorEstacion)
    if (entradas.length === 0) continue // sin configuracion de cocina

    const cabe =
      actual !== null &&
      entradas.every(([estacionId, ocupacion]) => {
        const capacidad = capacidades.get(Number(estacionId)) ?? 0
        if (capacidad === 0) return true
        const acumulada = actual!.ocupacionPorEstacion[Number(estacionId)] ?? 0
        return acumulada + ocupacion <= capacidad
      })

    if (!cabe) {
      actual = {
        horaEtiqueta: ordenCarga.horaEfectiva.substring(11, 16),
        horaInicio: ordenCarga.horaEfectiva,
        ordenes: [],
        ocupacionPorEstacion: {},
        excedido: false
      }
      cortes.push(actual)
    }

    actual!.ordenes.push({
      visitaId: ordenCarga.visitaId,
      orden: ordenCarga.orden
    })
    for (const [estacionId, ocupacion] of entradas) {
      const id = Number(estacionId)
      actual!.ocupacionPorEstacion[id] =
        (actual!.ocupacionPorEstacion[id] ?? 0) + ocupacion
    }
    actual!.excedido = Object.entries(actual!.ocupacionPorEstacion).some(
      ([estacionId, ocupacion]) => {
        const capacidad = capacidades.get(Number(estacionId)) ?? 0
        return capacidad > 0 && ocupacion > capacidad
      }
    )
  }

  return cortes
}
```

- [ ] **Step 5: Correr el script y verificar que pasa**

Run: `npx -y tsx scripts/test-derivarCortes.ts`
Expected: `derivarCortes: 7/7 casos OK`

- [ ] **Step 6: Lint + build + commit**

Run: `npm run lint` y `npm run build` — expected: sin errores (warnings preexistentes se ignoran).
```bash
git add src/interfaces/Cocina.ts src/utils/derivarCortes.ts scripts/test-derivarCortes.ts
git commit -m "cocina: tipos y derivacion pura de cortes con script de sanidad"
```

---

### Task 3: KDS — accion `getCocina.ts` y endpoints `/api/estaciones`

**Files:**
- Create: `src/actions/getCocina.ts`
- Create: `src/app/api/estaciones/route.ts`
- Create: `src/app/api/estaciones/carga/route.ts`

**Interfaces:**
- Consumes: `derivarCortes` (Task 2), tipos de `@/interfaces/Cocina`, `getPool`/`sql` de `./db`.
- Produces (importado por Tasks 5 y 6 via rutas):
  - `getEstacionesDb(): Promise<Estacion[]>` — [] si faltan tablas `Cocina*`.
  - `getCargaEstacionDb(estacionId: number): Promise<CargaEstacionResponse>`
  - `getResumenPintado(visitaId: number, orden: number): Promise<ResumenPintado | null>` — null si faltan tablas.
  - `GET /api/estaciones` → `Estacion[]`
  - `GET /api/estaciones/carga?estacion=N` → `CargaEstacionResponse`

- [ ] **Step 1: Crear `src/actions/getCocina.ts`**

```ts
// Modulo de cocina: estaciones del POS + derivacion de cortes de las ordenes
// pintadas pendientes. Unica fuente para /api/estaciones/* y el resumen del PATCH.
// Spec: docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md
import moment from 'moment-timezone'
import { getPool, sql } from './db'
import {
  CargaEstacionResponse,
  Corte,
  CorteEstacion,
  Estacion,
  OrdenCarga,
  ResumenPintado
} from '@/interfaces/Cocina'
import { derivarCortes } from '@/utils/derivarCortes'

// Fila cruda: carga agregada por (orden, estacion, componente).
export interface CargaFilaDb {
  visitaId: number
  orden: number
  horaEfectiva: Date
  estacionCocinaId: number
  componente: string
  unidades: number
  ocupacion: number
}

// Fila cruda: producto pendiente por (orden, estacion), para MostrarProductos.
export interface ProductoFilaDb {
  visitaId: number
  orden: number
  estacionCocinaId: number
  producto: string
  cantidad: number
}

export interface ResultadoCortes {
  estaciones: Estacion[]
  cortes: Corte[]
  filas: CargaFilaDb[]
  productos: ProductoFilaDb[]
}

// CTEs compartidos: ordenes pintadas con items pendientes de hoy.
// Misma ventana temporal y COALESCE que el resto del KDS.
const CTE_PENDIENTES = `
WITH Pintadas AS (
  SELECT VisitaID, Orden FROM KDS_Snooze WHERE Resaltado = 1
),
Pendientes AS (
  SELECT dc.VisitaID, dc.Orden, dc.ID AS DetalleCuentaID, dc.ProductoID, dc.Cantidad,
         COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva
  FROM DetalleCuenta dc
  INNER JOIN Pintadas pi ON pi.VisitaID = dc.VisitaID AND pi.Orden = dc.Orden
  INNER JOIN Visitas v ON v.ID = dc.VisitaID
  LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
  WHERE dc.Terminado IS NULL
    AND COALESCE(dc.Borrada, 0) = 0
    AND COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN @startOfToday AND @startOfTomorrow
)`

export async function getEstacionesDb(): Promise<Estacion[]> {
  try {
    const pool = await getPool()
    // COL_LENGTH: tolera bases donde el POS todavia no agrego MostrarProductos.
    const col = await pool
      .request()
      .query(`SELECT COL_LENGTH('CocinaEstaciones', 'MostrarProductos') AS len`)
    const mostrarExpr =
      col.recordset[0]?.len != null
        ? 'CAST(MostrarProductos AS INT)'
        : 'CAST(0 AS INT)'
    const result = await pool.request().query(`
      SELECT EstacionCocinaID AS estacionCocinaId, Nombre AS nombre,
             Capacidad AS capacidad, Orden AS orden, ${mostrarExpr} AS mostrarProductos
      FROM CocinaEstaciones
      WHERE Activo = 1
      ORDER BY Orden, Nombre`)
    return result.recordset.map((r) => ({
      ...r,
      mostrarProductos: !!r.mostrarProductos
    }))
  } catch {
    // Tablas Cocina* ausentes (POS viejo): el modulo entero se apaga en silencio.
    return []
  }
}

export async function getCortesCocina(): Promise<ResultadoCortes> {
  const estaciones = await getEstacionesDb()
  if (estaciones.length === 0)
    return { estaciones: [], cortes: [], filas: [], productos: [] }

  const now = moment().tz('America/La_Paz')
  const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss')
  const startOfTomorrow = now
    .clone()
    .add(1, 'day')
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
  const pool = await getPool()

  // Componentes inactivos SI computan (la relacion vigente es trabajo real);
  // el hijo de combo cuenta por fila de ProductosCombos, igual que el string visible.
  const filasResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES},
CargasItem AS (
  SELECT pe.VisitaID, pe.Orden, pe.HoraEfectiva, cc.EstacionCocinaID, cc.Nombre AS Componente,
         pe.Cantidad * ccp.Cantidad AS Unidades,
         pe.Cantidad * ccp.Cantidad * cc.Espacios AS Ocupacion
  FROM Pendientes pe
  INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pe.ProductoID
  INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
  UNION ALL
  SELECT pe.VisitaID, pe.Orden, pe.HoraEfectiva, cc.EstacionCocinaID, cc.Nombre,
         ccp.Cantidad,
         ccp.Cantidad * cc.Espacios
  FROM Pendientes pe
  INNER JOIN ProductosCombos pc ON pc.DetalleCuentaID = pe.DetalleCuentaID
  INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pc.ProductoID
  INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
)
SELECT ci.VisitaID AS visitaId, ci.Orden AS orden,
       CAST(MIN(ci.HoraEfectiva) AS DATETIME) AS horaEfectiva,
       ci.EstacionCocinaID AS estacionCocinaId, ci.Componente AS componente,
       SUM(ci.Unidades) AS unidades, SUM(ci.Ocupacion) AS ocupacion
FROM CargasItem ci
GROUP BY ci.VisitaID, ci.Orden, ci.EstacionCocinaID, ci.Componente`)
  const filas = filasResult.recordset as CargaFilaDb[]

  // Vista por producto (estaciones MostrarProductos): productos de la linea con
  // configuracion directa en la estacion. Hijos de combo fuera en v1 (decision spec).
  const productosResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES},
ItemEstacion AS (
  SELECT DISTINCT pe.VisitaID, pe.Orden, pe.DetalleCuentaID, pe.ProductoID, pe.Cantidad,
         cc.EstacionCocinaID
  FROM Pendientes pe
  INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pe.ProductoID
  INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
)
SELECT ie.VisitaID AS visitaId, ie.Orden AS orden, ie.EstacionCocinaID AS estacionCocinaId,
       p.Nombre AS producto, SUM(ie.Cantidad) AS cantidad
FROM ItemEstacion ie
INNER JOIN Productos p ON p.ID = ie.ProductoID
GROUP BY ie.VisitaID, ie.Orden, ie.EstacionCocinaID, p.Nombre`)
  const productos = productosResult.recordset as ProductoFilaDb[]

  const porOrden = new Map<string, OrdenCarga>()
  for (const fila of filas) {
    const key = `${fila.visitaId}|${fila.orden}`
    const iso = fila.horaEfectiva.toISOString()
    let ordenCarga = porOrden.get(key)
    if (!ordenCarga) {
      ordenCarga = {
        visitaId: fila.visitaId,
        orden: fila.orden,
        horaEfectiva: iso,
        ocupacionPorEstacion: {}
      }
      porOrden.set(key, ordenCarga)
    }
    if (iso < ordenCarga.horaEfectiva) ordenCarga.horaEfectiva = iso
    ordenCarga.ocupacionPorEstacion[fila.estacionCocinaId] =
      (ordenCarga.ocupacionPorEstacion[fila.estacionCocinaId] ?? 0) +
      fila.ocupacion
  }

  const cortes = derivarCortes([...porOrden.values()], estaciones)
  return { estaciones, cortes, filas, productos }
}

export async function getCargaEstacionDb(
  estacionId: number
): Promise<CargaEstacionResponse> {
  const { estaciones, cortes, filas, productos } = await getCortesCocina()
  const estacion = estaciones.find((e) => e.estacionCocinaId === estacionId)
  if (!estacion) return { estacion: null, cortes: [] }

  const cortesEstacion: CorteEstacion[] = []
  for (const corte of cortes) {
    const claves = new Set(
      corte.ordenes.map((o) => `${o.visitaId}|${o.orden}`)
    )
    const items = new Map<string, number>()
    if (estacion.mostrarProductos) {
      for (const p of productos) {
        if (p.estacionCocinaId !== estacionId) continue
        if (!claves.has(`${p.visitaId}|${p.orden}`)) continue
        items.set(p.producto, (items.get(p.producto) ?? 0) + p.cantidad)
      }
    } else {
      for (const f of filas) {
        if (f.estacionCocinaId !== estacionId) continue
        if (!claves.has(`${f.visitaId}|${f.orden}`)) continue
        items.set(f.componente, (items.get(f.componente) ?? 0) + f.unidades)
      }
    }
    if (items.size === 0) continue
    cortesEstacion.push({
      horaEtiqueta: corte.horaEtiqueta,
      horaInicio: corte.horaInicio,
      items: [...items.entries()].map(([nombre, cantidad]) => ({
        nombre,
        cantidad
      }))
    })
  }
  return {
    estacion: {
      nombre: estacion.nombre,
      mostrarProductos: estacion.mostrarProductos
    },
    cortes: cortesEstacion
  }
}

export async function getResumenPintado(
  visitaId: number,
  orden: number
): Promise<ResumenPintado | null> {
  const { estaciones, cortes, filas } = await getCortesCocina()
  if (estaciones.length === 0) return null

  const corteIdx = cortes.findIndex((c) =>
    c.ordenes.some((o) => o.visitaId === visitaId && o.orden === orden)
  )
  if (corteIdx === -1) {
    // Pintada pero sin carga: sin configuracion de cocina (o ya sin items pendientes).
    return {
      generaTrabajo: false,
      abreCorteNuevo: false,
      excedido: false,
      horaEtiqueta: '',
      estaciones: []
    }
  }

  const corte = cortes[corteIdx]
  const claves = new Set(corte.ordenes.map((o) => `${o.visitaId}|${o.orden}`))
  const resumenEstaciones = estaciones
    .filter((e) => (corte.ocupacionPorEstacion[e.estacionCocinaId] ?? 0) > 0)
    .map((e) => ({
      nombre: e.nombre,
      unidades: filas
        .filter(
          (f) =>
            f.estacionCocinaId === e.estacionCocinaId &&
            claves.has(`${f.visitaId}|${f.orden}`)
        )
        .reduce((total, f) => total + f.unidades, 0),
      ocupacion: corte.ocupacionPorEstacion[e.estacionCocinaId] ?? 0,
      capacidad: e.capacidad
    }))

  const primera = corte.ordenes[0]
  const abreCorteNuevo =
    corteIdx > 0 && primera.visitaId === visitaId && primera.orden === orden

  return {
    generaTrabajo: true,
    abreCorteNuevo,
    excedido: corte.excedido,
    horaEtiqueta: corte.horaEtiqueta,
    estaciones: resumenEstaciones
  }
}
```

- [ ] **Step 2: Crear `src/app/api/estaciones/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getEstacionesDb } from '@/actions/getCocina'

// Lista de estaciones activas para /config. [] si el POS no tiene el modulo.
export async function GET() {
  const estaciones = await getEstacionesDb()
  return NextResponse.json(estaciones, { status: 200 })
}
```

- [ ] **Step 3: Crear `src/app/api/estaciones/carga/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getCargaEstacionDb } from '@/actions/getCocina'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const estacionId = parseInt(searchParams.get('estacion') ?? '', 10)
    if (!Number.isFinite(estacionId) || estacionId <= 0) {
      return NextResponse.json({ error: 'estacion es requerida' }, { status: 400 })
    }
    const carga = await getCargaEstacionDb(estacionId)
    return NextResponse.json(carga, { status: 200 })
  } catch (error) {
    console.error('Error al obtener la carga de la estacion:', error)
    return NextResponse.json(
      { error: 'Error al obtener la carga de la estacion' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint` y `npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/actions/getCocina.ts src/app/api/estaciones/route.ts src/app/api/estaciones/carga/route.ts
git commit -m "cocina: accion getCocina y endpoints de estaciones y carga"
```

---

### Task 4: KDS — /config con grupo de estaciones + SideMenu

**Files:**
- Modify: `src/app/(pages)/config/(components)/FormConfig.tsx`
- Modify: `src/components/SideMenu.tsx`

**Interfaces:**
- Consumes: `GET /api/estaciones` (Task 3), tipo `Estacion` de `@/interfaces/Cocina`.
- Produces: `localStorage.equipo` puede valer `estacion:<EstacionCocinaID>` (ej. `estacion:5`). El prefijo literal es `'estacion:'` — Tasks 5/6 dependen de el.

- [ ] **Step 1: FormConfig — select agrupado y ocultar opciones que no aplican**

En `src/app/(pages)/config/(components)/FormConfig.tsx`:

1. Ampliar el import de select para incluir grupos:
```ts
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
```
2. Agregar import del tipo: `import { Estacion } from '@/interfaces/Cocina'`.
3. Agregar estado tras `const [equipos, setEquipos] = useState<Equipo[]>([])`:
```ts
  const [estaciones, setEstaciones] = useState<Estacion[]>([])
```
4. En `getEquipos`, reemplazar el fetch simple por ambos en paralelo (la lista de estaciones nunca rompe la carga: si falla, queda vacia):
```ts
      const [resp, respEstaciones] = await Promise.all([
        fetch('/api/equipos', { method: 'GET' }),
        fetch('/api/estaciones', { method: 'GET' }).catch(() => null)
      ])
      if (!resp.ok) {
        throw new Error(
          'Error al obtener los equipos, por favor revisa la conexión a tu base de datos'
        )
      }
      const data = await resp.json()
      const dataEstaciones =
        respEstaciones && respEstaciones.ok ? await respEstaciones.json() : []

      setEquipos(data)
      setEstaciones(dataEstaciones)
```
   (el resto de esa funcion queda igual).
5. Reemplazar el `<SelectContent>` del select de equipo por la version agrupada:
```tsx
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Equipos</SelectLabel>
                        {equipos.map((equipo) => (
                          <SelectItem
                            key={equipo.nombreFisico}
                            value={equipo.nombreFisico}
                          >
                            {equipo.nombre}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {estaciones.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Estaciones de Cocina</SelectLabel>
                          {estaciones.map((estacion) => (
                            <SelectItem
                              key={`estacion:${estacion.estacionCocinaId}`}
                              value={`estacion:${estacion.estacionCocinaId}`}
                            >
                              {estacion.nombre}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
```
6. Definir despues de los useState: `const esEstacion = nombreEquipo.startsWith('estacion:')`.
7. Envolver el bloque de Desglose (el `<Label htmlFor='desglose'>` y su `<Checkbox>`) en `{!esEstacion && (<> ... </>)}`, y la seccion entera "Órdenes en Espera" junto a su `<Separator>` en `{!esEstacion && (<> ... </>)}`. Columnas y filas quedan visibles (la pantalla-estacion usa columnas).

- [ ] **Step 2: SideMenu — contar estaciones para mostrar Configuracion**

En `src/components/SideMenu.tsx`, dentro de `getEquipos`, reemplazar el fetch y el conteo:
```ts
      const [resp, respEstaciones] = await Promise.all([
        fetch("/api/equipos", { method: "GET" }),
        fetch("/api/estaciones", { method: "GET" }).catch(() => null),
      ]);
      if (!resp.ok) {
        throw new Error(
          "Error al obtener los equipos, porfavor revisa la conexion a tu base de datos"
        );
      }
      const data = await resp.json();
      const dataEstaciones =
        respEstaciones && respEstaciones.ok ? await respEstaciones.json() : [];

      if (data.length + dataEstaciones.length > 1) {
        setShowConfig(true);
      }
```

- [ ] **Step 3: Lint + build + prueba de regresion manual rapida**

Run: `npm run lint` y `npm run build` — sin errores.
Regresion: con una base SIN tablas `Cocina*`, /config debe verse identico a hoy (un solo grupo "Equipos"); guardar un equipo normal debe seguir funcionando.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(pages)/config/(components)/FormConfig.tsx" src/components/SideMenu.tsx
git commit -m "config: grupo de estaciones de cocina en la seleccion de pantalla"
```

---

### Task 5: KDS — popup de carga al pintar

**Files:**
- Modify: `src/app/api/ordenes/route.ts` (solo el handler PATCH)
- Create: `src/components/CorteResumenDialog.tsx`
- Modify: `src/app/(pages)/(orders)/(components)/Orders.tsx` (solo `handleHighlight` + montar el dialog)

**Interfaces:**
- Consumes: `getResumenPintado` (Task 3), tipo `ResumenPintado`.
- Produces: PATCH `/api/ordenes` con `highlight: true` responde `{ message: string, resumen: ResumenPintado | null }`. Con `highlight: false` la respuesta queda EXACTAMENTE como hoy.

- [ ] **Step 1: PATCH — adjuntar resumen al pintar**

En `src/app/api/ordenes/route.ts`, agregar el import:
```ts
import { getResumenPintado } from '@/actions/getCocina'
```
y reemplazar el bloque `if (highlight) { ... }` del PATCH por:
```ts
    if (highlight) {
      await highlightOrder(visitaId, orden);
      let resumen = null;
      try {
        resumen = await getResumenPintado(visitaId, orden);
      } catch (error) {
        // El pintado ya quedo aplicado; sin resumen el cliente solo omite el popup.
        console.error('No se pudo calcular el resumen del corte:', error);
      }
      return NextResponse.json({ message: 'Orden resaltada exitosamente', resumen }, { status: 200 });
    } else {
```
(la rama del else y todo lo demas del archivo quedan intactos).

- [ ] **Step 2: Crear `src/components/CorteResumenDialog.tsx`**

```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ResumenPintado } from '@/interfaces/Cocina'

// Colores del semaforo existente (TimerComponent): rojo #d17f7f, ambar #eac568.
export const CorteResumenDialog = ({
  resumen,
  onClose
}: {
  resumen: ResumenPintado | null
  onClose: () => void
}) => {
  return (
    <Dialog
      open={resumen !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className='max-w-[520px]'>
        <DialogHeader>
          <DialogTitle className='text-3xl'>
            {resumen && !resumen.generaTrabajo
              ? 'Sin trabajo en estaciones'
              : resumen?.abreCorteNuevo
              ? `Esta orden abre el corte de las ${resumen.horaEtiqueta}`
              : `Corte ${resumen?.horaEtiqueta ?? ''}`}
          </DialogTitle>
        </DialogHeader>
        {resumen && !resumen.generaTrabajo ? (
          <p className='text-2xl'>
            Esta orden no genera trabajo en estaciones de cocina.
          </p>
        ) : (
          <div className='flex flex-col gap-2'>
            {resumen?.estaciones.map((estacion) => {
              const excedida =
                estacion.capacidad > 0 && estacion.ocupacion > estacion.capacidad
              const llena =
                estacion.capacidad > 0 &&
                estacion.ocupacion >= estacion.capacidad
              return (
                <div
                  key={estacion.nombre}
                  className={`flex justify-between text-2xl font-semibold px-3 py-2 rounded ${
                    excedida
                      ? 'bg-[#d17f7f] text-white'
                      : llena
                      ? 'bg-[#eac568]'
                      : 'bg-gray-100'
                  }`}
                >
                  <span>
                    {estacion.nombre}: {estacion.unidades}{' '}
                    {estacion.unidades === 1 ? 'unidad' : 'unidades'}
                  </span>
                  <span>
                    {estacion.capacidad === 0
                      ? `${estacion.ocupacion} / sin límite`
                      : `${estacion.ocupacion} / ${estacion.capacidad}`}
                  </span>
                </div>
              )
            })}
            {resumen?.excedido && (
              <p className='text-xl font-bold text-[#d17f7f]'>
                Una estación quedó excedida: despinte esta orden o elija otra
                que quepa.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Orders.tsx — abrir el popup con la respuesta del PATCH**

En `src/app/(pages)/(orders)/(components)/Orders.tsx`:

1. Agregar imports:
```ts
import { CorteResumenDialog } from '@/components/CorteResumenDialog'
import { ResumenPintado } from '@/interfaces/Cocina'
```
2. Agregar estado junto a los otros useState:
```ts
  const [corteResumen, setCorteResumen] = useState<ResumenPintado | null>(null)
```
3. En `handleHighlight`, reemplazar el bloque desde `await fetch('/api/ordenes', {` hasta el `toast.success(...)` inclusive por:
```ts
          const resp = await fetch('/api/ordenes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visitaId,
              orden,
              highlight: !ordenData.resaltado
            })
          })
          const data = await resp.json().catch(() => null)
          if (!ordenData.resaltado && data?.resumen) {
            // Al pintar, el resumen del corte reemplaza al toast.
            setCorteResumen(data.resumen)
          } else {
            toast.success(
              ordenData.resaltado ? 'Orden desresaltada' : 'Orden resaltada',
              {
                position: 'bottom-center'
              }
            )
          }
```
   (el `await getOrdenes()` que sigue queda igual).
4. Antes del cierre del fragmento final (junto al `<OrderDetailDialog ... />`), montar:
```tsx
      <CorteResumenDialog
        resumen={corteResumen}
        onClose={() => setCorteResumen(null)}
      />
```

- [ ] **Step 4: Lint + build + regresion**

Run: `npm run lint` y `npm run build` — sin errores.
Regresion: en una base SIN tablas `Cocina*`, pintar debe seguir mostrando el toast "Orden resaltada" (resumen null → no popup) y despintar el toast de siempre.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ordenes/route.ts src/components/CorteResumenDialog.tsx "src/app/(pages)/(orders)/(components)/Orders.tsx"
git commit -m "cocina: popup de carga por estacion al pintar una orden"
```

---

### Task 6: KDS — pantalla-estacion

**Files:**
- Create: `src/app/(pages)/(orders)/(components)/EstacionView.tsx`
- Create: `src/app/(pages)/(orders)/(components)/PantallaPrincipal.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/estaciones/carga?estacion=N` (Task 3), marcador `estacion:` en `localStorage.equipo` (Task 4), `TimerComponent`.
- Produces: la home renderiza `PantallaPrincipal`, que elige `EstacionView` u `OrdersPage` segun el marcador.

- [ ] **Step 1: Crear `EstacionView.tsx`**

```tsx
'use client'

import Masonry from 'react-masonry-css'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import TimerComponent from '@/components/TimerComponent'
import useSound from 'use-sound'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CargaEstacionResponse } from '@/interfaces/Cocina'
import Link from 'next/link'

const themeColors = {
  primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? '626e78'
}

// Visor pasivo de una estacion de cocina: una card por corte con el agregado
// a preparar. Sin checks, sin snooze, sin resaltar. Mismo poll de 15 s del KDS.
export const EstacionView = ({ estacionId }: { estacionId: number }) => {
  const [data, setData] = useState<CargaEstacionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [columns, setColumns] = useState('3')
  const [playNewOrder] = useSound('/sounds/neworder.mp3')
  const cortesPrevios = useRef(0)

  const getCarga = useCallback(async () => {
    try {
      const resp = await fetch(`/api/estaciones/carga?estacion=${estacionId}`, {
        method: 'GET'
      })
      if (!resp.ok) {
        throw new Error('Error al obtener la carga de la estación')
      }
      const nueva: CargaEstacionResponse = await resp.json()
      if (nueva.cortes.length > cortesPrevios.current) playNewOrder()
      cortesPrevios.current = nueva.cortes.length
      setData(nueva)
      setErrorMessage(null)
    } catch (error) {
      console.error(error)
      setErrorMessage('No se pudo conectar a la base de datos')
    } finally {
      setLoading(false)
    }
  }, [estacionId, playNewOrder])

  useEffect(() => {
    setColumns(localStorage.getItem('columns') ?? '3')
    getCarga()
    const interval = setInterval(getCarga, 15000)
    return () => clearInterval(interval)
  }, [getCarga])

  if (loading) {
    return (
      <div className='flex items-center justify-center h-[90vh]'>
        <div className='spinner'>
          <div className='bounce1'></div>
          <div className='bounce2'></div>
          <div className='bounce3'></div>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className='flex items-center justify-center h-[90vh]'>
        <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-red-500 animate-pulse'>
          {errorMessage}
        </h2>
      </div>
    )
  }

  if (data && data.estacion === null) {
    return (
      <div className='flex flex-col items-center justify-center h-[90vh] gap-4'>
        <h2 className='text-xl sm:text-3xl font-bold text-gray-500 text-center'>
          La estación configurada ya no existe o está inactiva.
        </h2>
        <Link href='/config' className='text-2xl underline text-blue-500'>
          Volver a configurar la pantalla
        </Link>
      </div>
    )
  }

  const breakpointColumns = {
    default: parseInt(columns),
    1100: Math.max(2, parseInt(columns) - 1),
    700: 1
  }

  return (
    <>
      <div
        className='fixed top-2 right-2 z-10 px-4 py-1 rounded-full text-white text-xl font-bold shadow-lg'
        style={{ backgroundColor: `#${themeColors.primaryBg}` }}
      >
        {data?.estacion?.nombre}
      </div>

      {!data || data.cortes.length === 0 ? (
        <div className='flex items-center justify-center h-[90vh]'>
          <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500'>
            Sin trabajo pendiente.
          </h2>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumns}
          className='flex w-auto gap-3 mt-1 px-1 break-inside-avoid'
          columnClassName='masonry-column'
        >
          {data.cortes.map((corte) => (
            <Card
              key={corte.horaInicio}
              className='relative mb-3 break-inside-avoid overflow-hidden shadow-xl sm:min-h-[20vh]'
              style={{ borderColor: `#${themeColors.primaryBg}` }}
            >
              <CardHeader
                style={{ backgroundColor: `#${themeColors.primaryBg}` }}
              >
                <div className='flex justify-between border-b-[1px] p-2 items-center'>
                  <p className='text-3xl font-bold uppercase text-white'>
                    Corte {corte.horaEtiqueta}
                  </p>
                  <TimerComponent startTime={corte.horaInicio.replace('Z', '')} />
                </div>
              </CardHeader>
              <CardContent className='flex-1 min-h-20 pt-3'>
                {corte.items.map((item) => (
                  <h2
                    key={item.nombre}
                    className='font-bold text-4xl leading-10 py-1 px-2 capitalize'
                  >
                    {item.cantidad}x {item.nombre}
                  </h2>
                ))}
              </CardContent>
            </Card>
          ))}
        </Masonry>
      )}
    </>
  )
}
```

- [ ] **Step 2: Crear `PantallaPrincipal.tsx`**

```tsx
'use client'

import { redirect } from 'next/navigation'
import { useEffect, useState } from 'react'
import { OrdersPage } from './Orders'
import { EstacionView } from './EstacionView'

const PREFIJO_ESTACION = 'estacion:'

// Elige la vista segun el marcador guardado en /config: 'estacion:<id>' abre el
// visor de estacion; cualquier otro valor conserva la pantalla de equipo de siempre.
export const PantallaPrincipal = () => {
  const [equipo, setEquipo] = useState<string | null>(null)

  useEffect(() => {
    setEquipo(localStorage.getItem('equipo') ?? '')
  }, [])

  if (equipo === null) return null

  if (equipo.length === 0) {
    redirect('/config')
  }

  if (equipo.startsWith(PREFIJO_ESTACION)) {
    const estacionId = parseInt(equipo.slice(PREFIJO_ESTACION.length), 10)
    if (Number.isFinite(estacionId) && estacionId > 0) {
      return <EstacionView estacionId={estacionId} />
    }
  }

  return <OrdersPage />
}
```

- [ ] **Step 3: Modificar `src/app/page.tsx`**

Contenido completo nuevo:
```tsx
import { PantallaPrincipal } from "@/app/(pages)/(orders)/(components)/PantallaPrincipal";

export default function Home() {
  return (
    <>
      <PantallaPrincipal />
    </>
  );
}
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint` y `npm run build`
Expected: sin errores.

- [ ] **Step 5: Checklist de regresion final (constraint global)**

Con `npm run dev` y una base real:
1. Pantalla configurada con un equipo normal: ordenes cargan, check verde por item y por orden, snooze/unsnooze, pintar/despintar, historial — todo identico a antes.
2. Base SIN tablas `Cocina*`: /config sin grupo Estaciones, pintar con toast de siempre, cero errores en consola del server.
3. Base CON el modulo POS configurado: pintar dispara el popup con cargas; elegir una estacion en /config y verificar cards de corte; despachar ordenes y ver el reacomodo al liberarse espacio.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(pages)/(orders)/(components)/EstacionView.tsx" "src/app/(pages)/(orders)/(components)/PantallaPrincipal.tsx" src/app/page.tsx
git commit -m "cocina: pantalla-estacion pasiva con cards por corte"
```
