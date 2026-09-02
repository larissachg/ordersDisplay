// Modulo de cocina: estaciones del POS + derivacion de cortes de todas las
// ordenes pendientes del dia (el pintado actua de separador de cortes).
// Unica fuente para /api/estaciones/* y el resumen del PATCH.
// Spec: docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md
import moment from 'moment-timezone'
import { getPool, sql } from './db'
import {
  CargaEstacionResponse,
  Corte,
  CorteEstacion,
  Estacion,
  OrdenCarga,
  PedidoEstacion,
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

// Fila cruda: producto pendiente por (orden, estacion, observacion).
// lineaMin = menor DetalleCuentaID agrupado, para respetar el orden de carga.
// esHijoCombo = 1 cuando el producto viene resuelto desde un hijo de combo.
export interface ProductoFilaDb {
  visitaId: number
  orden: number
  estacionCocinaId: number
  producto: string
  observacion: string | null
  cantidad: number
  lineaMin: number
  esHijoCombo: number
}

// Fila cruda: linea de combo con trabajo en la estacion (config de sus hijos).
export interface ComboFilaDb {
  visitaId: number
  orden: number
  detalleCuentaId: number
  estacionCocinaId: number
  combo: string
  cantidad: number
  observacion: string | null
}

// Fila cruda: opcional elegido de una linea de combo (desglose de la vista armado).
export interface ComboHijoFilaDb {
  detalleCuentaId: number
  hijo: string
  cantidad: number
  ordenRow: number
}

export interface ResultadoCortes {
  estaciones: Estacion[]
  cortes: Corte[]
  enEspera: Corte | null
  filas: CargaFilaDb[]
  productos: ProductoFilaDb[]
  combos: ComboFilaDb[]
  comboHijos: ComboHijoFilaDb[]
  tipoEnvioPorOrden: Record<string, string | null> // clave 'visitaId|orden'
}

// CTE compartido: TODAS las ordenes con items pendientes de hoy (el pintado ya
// no filtra; separa cortes). Misma ventana temporal y COALESCE que el resto del KDS.
const CTE_PENDIENTES = `
WITH Pendientes AS (
  SELECT dc.VisitaID, dc.Orden, dc.ID AS DetalleCuentaID, dc.ProductoID, dc.Cantidad,
         COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva
  FROM DetalleCuenta dc
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
  } catch (error) {
    // 208 = objeto inexistente (tablas Cocina* ausentes, POS viejo): modulo apagado en silencio.
    const err = error as { number?: number }
    if (err.number === 208) return []
    console.error('Error al obtener las estaciones de cocina:', error)
    throw error
  }
}

export async function getCortesCocina(): Promise<ResultadoCortes> {
  const estaciones = await getEstacionesDb()
  if (estaciones.length === 0)
    return {
      estaciones: [],
      cortes: [],
      enEspera: null,
      filas: [],
      productos: [],
      combos: [],
      comboHijos: [],
      tipoEnvioPorOrden: {}
    }

  const now = moment().tz('America/La_Paz')
  const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss')
  const startOfTomorrow = now
    .clone()
    .add(1, 'day')
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
  const pool = await getPool()

  // Universo de ordenes pendientes con su flag de separador (Resaltado).
  // La hora de la orden es el MIN sobre todos sus items pendientes, tengan o no
  // configuracion de cocina: es la misma hora que ve la pantalla principal.
  const ordenesResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES}
SELECT pe.VisitaID AS visitaId, pe.Orden AS orden,
       CAST(MIN(pe.HoraEfectiva) AS DATETIME) AS horaEfectiva,
       MAX(CASE WHEN ks.Resaltado = 1 THEN 1 ELSE 0 END) AS resaltado,
       MAX(te.Nombre) AS tipoEnvio
FROM Pendientes pe
INNER JOIN Visitas v ON v.ID = pe.VisitaID
LEFT JOIN TipoEnvios te ON te.TipoEnvioID = v.TipoEnvioID
LEFT JOIN KDS_Snooze ks ON ks.VisitaID = pe.VisitaID AND ks.Orden = pe.Orden
GROUP BY pe.VisitaID, pe.Orden`)

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

  // Vista por producto: productos de la linea con configuracion en la estacion
  // MAS los hijos de combo elegidos (el planchero piensa en la hamburguesa que
  // sale, venga suelta o dentro de un combo). El hijo cuenta 1 por fila de
  // ProductosCombos, igual que la carga.
  const productosResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES},
ItemEstacion AS (
  SELECT VisitaID, Orden, EstacionCocinaID, ProductoID, Cantidad, Observacion,
         DetalleCuentaID AS LineaID, 0 AS EsHijoCombo
  FROM (
    SELECT DISTINCT pe.VisitaID, pe.Orden, cc.EstacionCocinaID, pe.ProductoID,
           pe.DetalleCuentaID, pe.Cantidad, o.Observacion
    FROM Pendientes pe
    INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pe.ProductoID
    INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
    LEFT JOIN Observaciones o ON o.DetalleCuentaID = pe.DetalleCuentaID
  ) directos
  UNION ALL
  SELECT VisitaID, Orden, EstacionCocinaID, ProductoID, 1 AS Cantidad, Observacion,
         DetalleCuentaID AS LineaID, 1 AS EsHijoCombo
  FROM (
    SELECT DISTINCT pe.VisitaID, pe.Orden, cc.EstacionCocinaID, pc.ProductoID,
           pc.ProductoComboID, pe.DetalleCuentaID, o.Observacion
    FROM Pendientes pe
    INNER JOIN ProductosCombos pc ON pc.DetalleCuentaID = pe.DetalleCuentaID
    INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pc.ProductoID
    INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
    LEFT JOIN Observaciones o ON o.DetalleCuentaID = pe.DetalleCuentaID
  ) hijos
)
SELECT ie.VisitaID AS visitaId, ie.Orden AS orden, ie.EstacionCocinaID AS estacionCocinaId,
       p.Nombre AS producto, ie.Observacion AS observacion, SUM(ie.Cantidad) AS cantidad,
       MIN(ie.LineaID) AS lineaMin, ie.EsHijoCombo AS esHijoCombo
FROM ItemEstacion ie
INNER JOIN Productos p ON p.ID = ie.ProductoID
GROUP BY ie.VisitaID, ie.Orden, ie.EstacionCocinaID, p.Nombre, ie.Observacion, ie.EsHijoCombo`)
  const productos = productosResult.recordset as ProductoFilaDb[]

  // Lineas de combo con trabajo en cada estacion (vista armado: el combo se
  // muestra con su nombre y el desglose de opcionales, como en la pantalla
  // principal). La relevancia la da la config de cocina de sus hijos.
  const combosResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES},
ComboEstacion AS (
  SELECT DISTINCT pe.VisitaID, pe.Orden, pe.DetalleCuentaID, pe.ProductoID,
         pe.Cantidad, cc.EstacionCocinaID
  FROM Pendientes pe
  INNER JOIN ProductosCombos pc ON pc.DetalleCuentaID = pe.DetalleCuentaID
  INNER JOIN CocinaComponentesProductos ccp ON ccp.ProductoID = pc.ProductoID
  INNER JOIN CocinaComponentes cc ON cc.ComponenteCocinaID = ccp.ComponenteCocinaID
)
SELECT ce.VisitaID AS visitaId, ce.Orden AS orden, ce.DetalleCuentaID AS detalleCuentaId,
       ce.EstacionCocinaID AS estacionCocinaId, p.Nombre AS combo, ce.Cantidad AS cantidad,
       o.Observacion AS observacion
FROM ComboEstacion ce
INNER JOIN Productos p ON p.ID = ce.ProductoID
LEFT JOIN Observaciones o ON o.DetalleCuentaID = ce.DetalleCuentaID`)
  const combos = combosResult.recordset as ComboFilaDb[]

  const comboHijosResult = await pool
    .request()
    .input('startOfToday', sql.VarChar, startOfToday)
    .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
    .query(`${CTE_PENDIENTES}
SELECT pc.DetalleCuentaID AS detalleCuentaId, p.Nombre AS hijo,
       COUNT(*) AS cantidad, MIN(pc.ProductoComboID) AS ordenRow
FROM Pendientes pe
INNER JOIN ProductosCombos pc ON pc.DetalleCuentaID = pe.DetalleCuentaID
INNER JOIN Productos p ON p.ID = pc.ProductoID
GROUP BY pc.DetalleCuentaID, p.Nombre`)
  const comboHijos = comboHijosResult.recordset as ComboHijoFilaDb[]

  const porOrden = new Map<string, OrdenCarga>()
  const tipoEnvioPorOrden: Record<string, string | null> = {}
  for (const r of ordenesResult.recordset as {
    visitaId: number
    orden: number
    horaEfectiva: Date
    resaltado: number
    tipoEnvio: string | null
  }[]) {
    porOrden.set(`${r.visitaId}|${r.orden}`, {
      visitaId: r.visitaId,
      orden: r.orden,
      horaEfectiva: r.horaEfectiva.toISOString(),
      resaltado: !!r.resaltado,
      ocupacionPorEstacion: {}
    })
    tipoEnvioPorOrden[`${r.visitaId}|${r.orden}`] = r.tipoEnvio ?? null
  }
  for (const fila of filas) {
    const ordenCarga = porOrden.get(`${fila.visitaId}|${fila.orden}`)
    if (!ordenCarga) continue
    ordenCarga.ocupacionPorEstacion[fila.estacionCocinaId] =
      (ordenCarga.ocupacionPorEstacion[fila.estacionCocinaId] ?? 0) +
      fila.ocupacion
  }

  const { cortes, enEspera } = derivarCortes([...porOrden.values()], estaciones)
  return {
    estaciones,
    cortes,
    enEspera,
    filas,
    productos,
    combos,
    comboHijos,
    tipoEnvioPorOrden
  }
}

export async function getCargaEstacionDb(
  estacionId: number
): Promise<CargaEstacionResponse> {
  const {
    estaciones,
    cortes,
    enEspera,
    filas,
    productos,
    combos,
    comboHijos,
    tipoEnvioPorOrden
  } = await getCortesCocina()
  const estacion = estaciones.find((e) => e.estacionCocinaId === estacionId)
  if (!estacion) return { estacion: null, cortes: [], enEspera: null }

  // Items de la estacion agrupados por pedido, en las dos vistas posibles.
  // Lineas con observaciones distintas no se funden: el cocinero tiene que ver
  // cual de las unidades lleva la observacion.
  type ItemAcumulado = {
    nombre: string
    observacion: string | null
    cantidad: number
    ordenLinea: number // menor DetalleCuentaID: respeta el orden de carga
    desglose?: { nombre: string; cantidad: number }[] // opcionales del combo
  }
  const acumular = (
    mapa: Map<string, Map<string, ItemAcumulado>>,
    clave: string,
    nombre: string,
    observacion: string | null,
    cantidad: number,
    ordenLinea: number
  ) => {
    let porItem = mapa.get(clave)
    if (!porItem) {
      porItem = new Map()
      mapa.set(clave, porItem)
    }
    const claveItem = `${nombre}|${observacion ?? ''}`
    const previo = porItem.get(claveItem)
    if (previo) {
      previo.cantidad += cantidad
      previo.ordenLinea = Math.min(previo.ordenLinea, ordenLinea)
    } else porItem.set(claveItem, { nombre, observacion, cantidad, ordenLinea })
  }
  const productosPorPedido = new Map<string, Map<string, ItemAcumulado>>()
  for (const p of productos) {
    if (p.estacionCocinaId !== estacionId) continue
    acumular(
      productosPorPedido,
      `${p.visitaId}|${p.orden}`,
      p.producto,
      p.observacion ?? null,
      p.cantidad,
      p.lineaMin
    )
  }
  const componentesPorPedido = new Map<string, Map<string, ItemAcumulado>>()
  for (const f of filas) {
    if (f.estacionCocinaId !== estacionId) continue
    acumular(
      componentesPorPedido,
      `${f.visitaId}|${f.orden}`,
      f.componente,
      null,
      f.unidades,
      0
    )
  }

  // Vista armado (MostrarProductos): productos directos + la linea de combo con
  // su nombre y el desglose de opcionales; el combo NO se resuelve a sus hijos.
  const armadoPorPedido = new Map<string, Map<string, ItemAcumulado>>()
  if (estacion.mostrarProductos) {
    for (const p of productos) {
      if (p.estacionCocinaId !== estacionId || p.esHijoCombo) continue
      acumular(
        armadoPorPedido,
        `${p.visitaId}|${p.orden}`,
        p.producto,
        p.observacion ?? null,
        p.cantidad,
        p.lineaMin
      )
    }
    const hijosPorLinea = new Map<number, ComboHijoFilaDb[]>()
    for (const h of comboHijos) {
      const lista = hijosPorLinea.get(h.detalleCuentaId) ?? []
      lista.push(h)
      hijosPorLinea.set(h.detalleCuentaId, lista)
    }
    for (const c of combos) {
      if (c.estacionCocinaId !== estacionId) continue
      const clave = `${c.visitaId}|${c.orden}`
      let porItem = armadoPorPedido.get(clave)
      if (!porItem) {
        porItem = new Map()
        armadoPorPedido.set(clave, porItem)
      }
      // Una entrada por linea de combo: dos combos iguales con opcionales
      // distintos no deben fundirse.
      porItem.set(`combo|${c.detalleCuentaId}`, {
        nombre: c.combo,
        observacion: c.observacion ?? null,
        cantidad: c.cantidad,
        ordenLinea: c.detalleCuentaId,
        desglose: (hijosPorLinea.get(c.detalleCuentaId) ?? [])
          .sort((a, b) => a.ordenRow - b.ordenRow)
          .map(({ hijo, cantidad }) => ({ nombre: hijo, cantidad }))
      })
    }
  }

  const aGrupoEstacion = (grupo: Corte): CorteEstacion | null => {
    const pedidos: PedidoEstacion[] = []
    const totales = new Map<string, number>()
    for (const o of grupo.ordenes) {
      const clave = `${o.visitaId}|${o.orden}`
      // Las cards de pedido siempre muestran productos (el cocinero piensa en
      // la hamburguesa que sale). En estaciones MostrarProductos el combo se
      // muestra como combo con desglose; en las demas se resuelve a sus hijos.
      // Fallback a componentes por si un producto con carga no aparece.
      const fuentePedido = estacion.mostrarProductos
        ? armadoPorPedido.get(clave) ?? componentesPorPedido.get(clave)
        : productosPorPedido.get(clave) ?? componentesPorPedido.get(clave)
      // El header agrega la carga real de la estacion: componentes en las
      // normales, la vista armado en las MostrarProductos.
      const fuenteHeader = estacion.mostrarProductos
        ? fuentePedido
        : componentesPorPedido.get(clave)
      if (!fuentePedido || fuentePedido.size === 0) continue
      pedidos.push({
        visitaId: o.visitaId,
        orden: o.orden,
        tipoEnvio: tipoEnvioPorOrden[clave] ?? null,
        items: [...fuentePedido.values()]
          .sort((a, b) => a.ordenLinea - b.ordenLinea)
          .map(({ nombre, cantidad, observacion, desglose }) => ({
            nombre,
            cantidad,
            observacion,
            desglose
          }))
      })
      // El agregado del header suma por nombre, sin abrir por observacion.
      for (const item of fuenteHeader?.values() ?? [])
        totales.set(item.nombre, (totales.get(item.nombre) ?? 0) + item.cantidad)
    }
    if (pedidos.length === 0) return null
    return {
      horaEtiqueta: grupo.horaEtiqueta,
      horaInicio: grupo.horaInicio,
      items: [...totales.entries()].map(([nombre, cantidad]) => ({
        nombre,
        cantidad
      })),
      pedidos
    }
  }

  const cortesEstacion: CorteEstacion[] = []
  for (const corte of cortes) {
    const grupoEstacion = aGrupoEstacion(corte)
    if (grupoEstacion) cortesEstacion.push(grupoEstacion)
  }
  return {
    estacion: {
      nombre: estacion.nombre,
      mostrarProductos: estacion.mostrarProductos
    },
    cortes: cortesEstacion,
    enEspera: enEspera ? aGrupoEstacion(enEspera) : null
  }
}

export async function getResumenPintado(
  visitaId: number,
  orden: number
): Promise<ResumenPintado | null> {
  const { estaciones, cortes, filas } = await getCortesCocina()
  if (estaciones.length === 0) return null

  // La orden recien pintada es separador: el corte que la contiene es el que cierra.
  const corte = cortes.find((c) =>
    c.ordenes.some((o) => o.visitaId === visitaId && o.orden === orden)
  )
  if (!corte) {
    // Pintada pero fuera del universo (sin items pendientes o fuera del dia).
    return {
      generaTrabajo: false,
      cantidadOrdenes: 0,
      excedido: false,
      horaEtiqueta: '',
      estaciones: []
    }
  }
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

  return {
    // Un corte de puras ordenes sin configuracion de cocina no genera trabajo.
    generaTrabajo: resumenEstaciones.length > 0,
    cantidadOrdenes: corte.ordenes.length,
    excedido: corte.excedido,
    horaEtiqueta: corte.horaEtiqueta,
    estaciones: resumenEstaciones
  }
}
