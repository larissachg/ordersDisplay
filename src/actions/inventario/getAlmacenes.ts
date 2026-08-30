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
