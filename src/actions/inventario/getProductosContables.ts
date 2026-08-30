import sql from 'mssql'
import { getPool } from '../db'
import { ProductoContable } from '@/interfaces/Inventario'

// Mismo filtro que frmEntAjustes del POS: solo productos "hoja".
export async function getProductosContables(noVendibles: boolean): Promise<ProductoContable[]> {
  try {
    const pool = await getPool()
    // COL_LENGTH: tolera bases donde TiposProductos todavia no tiene NoVendibles
    // (mismo guard que getCocina.ts usa para MostrarProductos).
    const col = await pool
      .request()
      .query(`SELECT COL_LENGTH('TiposProductos', 'NoVendibles') AS len`)
    const exprNoVendibles =
      col.recordset[0]?.len != null ? 'CAST(COALESCE(tp.NoVendibles, 0) AS INT)' : 'CAST(0 AS INT)'
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
          AND ${exprNoVendibles} = @noVendibles
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
