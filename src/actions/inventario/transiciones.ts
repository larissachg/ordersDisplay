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
  if (cab.meseroId !== sesion.meseroId) {
    return { ok: false, mensaje: 'El conteo pertenece a otro usuario' }
  }
  const pool = await getPool()
  const result = await pool
    .request()
    .input('conteoId', sql.Int, conteoId)
    .query(
      `UPDATE KDS_Conteos SET Estado = 'revision' WHERE ConteoID = @conteoId AND Estado = 'abierto'`
    )
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
    .query(
      `UPDATE KDS_Conteos SET Estado = 'abierto' WHERE ConteoID = @conteoId AND Estado = 'revision'`
    )
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
