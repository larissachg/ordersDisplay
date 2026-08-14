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
