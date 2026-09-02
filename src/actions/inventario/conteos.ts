import sql from 'mssql'
import moment from 'moment-timezone'
import { getPool } from '../db'
import { ensureTablasConteo } from './schema'
import { getProductosContables } from './getProductosContables'
import { ConteoCompleto, ConteoDetalleDb, ConteoResumen } from '@/interfaces/Inventario'
import { EstadoConteo } from '@/contants/inventario'

const ahoraLaPaz = () => moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')

// Sin observacion: se pide al cerrar el conteo, no al crearlo.
export async function crearConteo(
  almacenId: number,
  noVendibles: boolean,
  meseroId: number
): Promise<number> {
  await ensureTablasConteo()
  const pool = await getPool()
  const result = await pool
    .request()
    .input('almacenId', sql.Int, almacenId)
    .input('noVendibles', sql.Bit, noVendibles)
    .input('meseroId', sql.Int, meseroId)
    .input('fecha', sql.VarChar, ahoraLaPaz())
    .query(`
      INSERT INTO KDS_Conteos (AlmacenID, NoVendibles, Estado, MeseroID, Observacion, FechaCreacion)
      OUTPUT INSERTED.ConteoID
      VALUES (@almacenId, @noVendibles, 'abierto', @meseroId, '', @fecha)
    `)
  return result.recordset[0].ConteoID
}

// Copia los productos y cantidades de un conteo anterior al conteo nuevo.
// El StockSnapshot se toma AHORA, no se hereda: el delta tiene que medirse
// contra el stock de hoy. Las filas quedan marcadas Copiado = 1 hasta que
// alguien las recuente.
export async function copiarDetalles(
  conteoOrigenId: number,
  conteoDestinoId: number,
  almacenId: number
): Promise<number> {
  await ensureTablasConteo()
  const pool = await getPool()
  const colStock = `Stock${almacenId}` // int validado por getCabecera
  const result = await pool
    .request()
    .input('origen', sql.Int, conteoOrigenId)
    .input('destino', sql.Int, conteoDestinoId)
    .input('fecha', sql.VarChar, ahoraLaPaz())
    .query(`
      INSERT INTO KDS_ConteoDetalles
        (ConteoID, ProductoID, CantidadContada, StockSnapshot, FechaConteo, Observacion, Copiado)
      SELECT @destino, d.ProductoID, d.CantidadContada,
             COALESCE(p.${colStock}, 0), @fecha, '', 1
      FROM KDS_ConteoDetalles d
      INNER JOIN Productos p ON p.ID = d.ProductoID
      WHERE d.ConteoID = @origen
        AND p.Borrado = 0
        AND NOT EXISTS (
          SELECT 1 FROM KDS_ConteoDetalles x
          WHERE x.ConteoID = @destino AND x.ProductoID = d.ProductoID
        )
    `)
  return result.rowsAffected[0] ?? 0
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
           COALESCE(p.Presentacion, '') AS Presentacion,
           COALESCE(tp.Descripcion, 'Sin categoría') AS TipoProducto,
           d.CantidadContada, ${columnasStock},
           COALESCE(d.Observacion, '') AS Observacion,
           COALESCE(d.Copiado, 0) AS Copiado,
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
    presentacion: f.Presentacion,
    tipoProducto: f.TipoProducto,
    cantidadContada: f.CantidadContada,
    stockSnapshot: f.StockSnapshot,
    stockVivo: f.StockVivo,
    costo: f.Costo,
    observacion: f.Observacion,
    fechaConteo: f.FechaConteo,
    copiado: !!f.Copiado
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
  const peticion = () =>
    pool
      .request()
      .input('conteoId', sql.Int, conteoId)
      .input('productoId', sql.Int, productoId)
      .input('cantidad', sql.Float, cantidad)
      .input('observacion', sql.VarChar, observacion.slice(0, 500))
      .input('fecha', sql.VarChar, ahoraLaPaz())

  // UPDATE primero: si la fila ya existe (recuento o reintento del cliente) no se
  // intenta ningun INSERT. El UNIQUE (ConteoID, ProductoID) sigue siendo la red
  // final ante dos escrituras simultaneas del mismo producto.
  const escribir = async () =>
    peticion().query(`
      DECLARE @snap float = (SELECT COALESCE(${colStock}, 0) FROM Productos WHERE ID = @productoId);
      IF @snap IS NULL SET @snap = 0;
      -- Copiado = 0: al guardarla a mano deja de ser una cantidad heredada.
      UPDATE KDS_ConteoDetalles
      SET CantidadContada = @cantidad, StockSnapshot = @snap, FechaConteo = @fecha,
          Observacion = @observacion, Copiado = 0
      WHERE ConteoID = @conteoId AND ProductoID = @productoId;
      IF @@ROWCOUNT = 0
        INSERT INTO KDS_ConteoDetalles (ConteoID, ProductoID, CantidadContada, StockSnapshot, FechaConteo, Observacion, Copiado)
        VALUES (@conteoId, @productoId, @cantidad, @snap, @fecha, @observacion, 0);
    `)

  try {
    await escribir()
  } catch (error) {
    // 2627/2601 = violacion de UNIQUE: otro request inserto la fila entre el
    // UPDATE y el INSERT. Reintentar cae por la rama UPDATE y queda una sola fila.
    const err = error as { number?: number }
    if (err.number === 2627 || err.number === 2601) await escribir()
    else throw error
  }
  return 'ok'
}

export { getProductosContables }
