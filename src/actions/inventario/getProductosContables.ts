import sql from 'mssql'
import { getPool } from '../db'
import { ProductoContable } from '@/interfaces/Inventario'

// Filtro compartido: productos "hoja", igual que frmEntAjustes del POS.
const FILTRO_CONTABLES = 'p.Borrado = 0 AND p.TienePreparacion = 0 AND p.esCombo = 0'

// Expresion de NoVendibles con guard: la columna puede no existir en POS viejos.
async function exprNoVendibles(pool: {
  request: () => { query: (q: string) => Promise<{ recordset: { len: number | null }[] }> }
}) {
  const col = await pool.request().query(`SELECT COL_LENGTH('TiposProductos', 'NoVendibles') AS len`)
  return col.recordset[0]?.len != null ? 'CAST(COALESCE(tp.NoVendibles, 0) AS INT)' : 'CAST(0 AS INT)'
}

// Cuantos productos entran en el conteo. Sirve para avisar en revision cuantos
// quedaron sin capturar antes de aplicar el ajuste.
export async function contarProductosContables(noVendibles: boolean): Promise<number> {
  try {
    const pool = await getPool()
    const expr = await exprNoVendibles(pool)
    const result = await pool
      .request()
      .input('noVendibles', sql.Int, noVendibles ? 1 : 0)
      .query(`
        SELECT COUNT(*) AS total
        FROM Productos p
        LEFT JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
        WHERE ${FILTRO_CONTABLES} AND ${expr} = @noVendibles
      `)
    return result.recordset[0]?.total ?? 0
  } catch (error) {
    const err = error as { number?: number }
    if (err.number === 208) return 0
    console.error('Error al contar productos contables:', error)
    return 0
  }
}

// Mismo filtro que frmEntAjustes del POS: solo productos "hoja".
// almacenId != null agrega el stock del sistema (solo para roles que pueden
// verlo); con null la lista sale ciega.
export async function getProductosContables(
  noVendibles: boolean,
  almacenId: number | null = null
): Promise<ProductoContable[]> {
  try {
    const pool = await getPool()
    const expr = await exprNoVendibles(pool)
    // Solo se interpola un entero ya validado, nunca un valor del cliente.
    const conStock = almacenId !== null && Number.isInteger(almacenId)
    const exprStock = conStock ? `COALESCE(p.Stock${almacenId}, 0)` : 'NULL'
    const result = await pool
      .request()
      .input('noVendibles', sql.Int, noVendibles ? 1 : 0)
      .query(`
        SELECT p.ID, p.Nombre, COALESCE(p.Codigo, '') AS Codigo,
               COALESCE(p.Presentacion, '') AS Presentacion,
               COALESCE(tp.Descripcion, 'Sin categoría') AS TipoProducto,
               ${exprStock} AS Stock
        FROM Productos p
        LEFT JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
        WHERE ${FILTRO_CONTABLES} AND ${expr} = @noVendibles
        ORDER BY tp.Descripcion, p.Nombre
      `)
    return result.recordset.map((f) => ({
      productoId: f.ID,
      nombre: f.Nombre ?? '',
      codigo: String(f.Codigo).trim(),
      presentacion: f.Presentacion ?? '',
      tipoProducto: f.TipoProducto ?? 'Sin categoría',
      stock: f.Stock === null || f.Stock === undefined ? null : Number(f.Stock)
    }))
  } catch (error) {
    const err = error as { number?: number }
    if (err.number === 208) return []
    console.error('Error al obtener productos contables:', error)
    throw new Error('No se pudieron obtener los productos')
  }
}
