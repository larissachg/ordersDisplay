import { Equipo } from '@/interfaces/Equipo'
import { poolPromise } from './db'

// Define el tipo de datos que regresará la consulta

export async function getEquiposDb(): Promise<Equipo[]> {
  try {
    const pool = await poolPromise
    const result = await pool.request().query(`
      select Nombre as nombre, NombreFisico as nombreFisico from Impresoras where esMonitorDigital =1
      UNION select 'Despacho Todo', 'DespachoToptech'
      UNION select 'Despacho Delivery', 'DespachoToptechDelivery'
      UNION select 'Despacho en Local', 'DespachoToptechMesa'
      UNION select 'Visor Cliente', 'VisorCliente'
    `)

    return result.recordset as Equipo[]
  } catch (error) {
    console.error('Error al obtener los equipos:', error)
    throw new Error('No se pudieron obtener los equipos')
  }
}
