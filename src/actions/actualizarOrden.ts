import moment from 'moment-timezone'
import { poolPromise, sql } from './db'

// Define el tipo de los parámetros que se esperan
interface ActualizarOrdenParams {
  idVisita: number
  idOrden: number
  terminado: boolean
  nombreEquipo: string
}

export async function actualizarOrden({
  idVisita,
  idOrden,
  terminado,
  nombreEquipo
}: ActualizarOrdenParams): Promise<string> {
  try {
    const pool = await poolPromise

    const fechaTerminado = terminado
      ? moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')
      : null

    if (nombreEquipo === 'DespachoToptech') {
      const result = await pool
        .request()
        .input('idOrden', sql.Int, idOrden)
        .input('idVisita', sql.Int, idVisita)
        .input(
          'terminado',
          fechaTerminado ? sql.DateTime : sql.NVarChar,
          fechaTerminado
        ).query(`       
        UPDATE DetalleCuenta
        SET Terminado = @terminado
        WHERE VisitaID = @idVisita and Orden = @idOrden
`)

      // Verifica si se actualizó alguna fila
      if (result.rowsAffected[0] > 0) {
        return 'Orden actualizada correctamente'
      } else {
        return 'No se encontró la orden para actualizar'
      }
    } else {
      // Realiza la consulta de actualización
      const result = await pool
        .request()
        .input('idOrden', sql.Int, idOrden)
        .input('idVisita', sql.Int, idVisita)
        .input('nombreEquipo', sql.VarChar, nombreEquipo)
        .input(
          'terminado',
          fechaTerminado ? sql.DateTime : sql.NVarChar,
          fechaTerminado
        ).query(`       
          UPDATE DC
          SET DC.Terminado = @terminado
          FROM DetalleCuenta DC
          INNER JOIN Productos P ON P.ID = DC.ProductoID
          INNER JOIN TiposProductos TP ON TP.TipoProductoID = P.TipoProductoID
          INNER JOIN Impresoras I ON TP.kitchenDisplayID = I.ImpresoraID
          WHERE 
            DC.VisitaID = @idVisita
            AND DC.Orden = @idOrden
            AND I.NombreFisico LIKE '%' + @nombreEquipo + '%';
        `)

      // Verifica si se actualizó alguna fila
      if (result.rowsAffected[0] > 0) {
        return 'Orden actualizada correctamente'
      } else {
        return 'No se encontró la orden para actualizar'
      }
    }
  } catch (error) {
    console.error('Error al actualizar la orden:', error)
    throw new Error('No se pudo actualizar la orden')
  }
}
