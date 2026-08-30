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
export async function getConteo(
  conteoId: number,
  conDiferencias: boolean
): Promise<ConteoCompleto | null> {
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
