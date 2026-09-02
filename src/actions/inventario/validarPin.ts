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
