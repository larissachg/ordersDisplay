import moment from 'moment-timezone'
import { poolPromise, sql } from './db'


interface ActualizarItemParams {
  detalleCuentaId: number;
  terminado: boolean;
  nombreEquipo: string;
}

interface ActualizarOrdenParams {
  idVisita: number
  idOrden: number
  terminado: boolean
  nombreEquipo: string
}

type ActualizarParams = ActualizarItemParams | ActualizarOrdenParams;

export async function actualizarOrden(params: ActualizarParams): Promise<string> {
  try {
    const pool = await poolPromise

    const fechaTerminado = params.terminado
      ? moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')
      : null

    const whereActualizar = fechaTerminado === null ? '' : ' and Terminado is null '
   

    if ('detalleCuentaId' in params) {
      const { detalleCuentaId, nombreEquipo } = params;
      if (nombreEquipo.startsWith('DespachoToptech')) {
        const result = await pool
          .request()
          .input('detalleCuentaId', sql.Int, detalleCuentaId)
          .input(
            'terminado',
            fechaTerminado ? sql.DateTime : sql.NVarChar,
            fechaTerminado
          ).query(`
            UPDATE DetalleCuenta
            SET Terminado = @terminado
            WHERE ID = @detalleCuentaId ${whereActualizar}
          `);

        if (result.rowsAffected[0] > 0) {
          return 'Item actualizado correctamente';
        } else {
          return 'No se encontró el item para actualizar';
        }
      } else {
        const result = await pool
          .request()
          .input('detalleCuentaId', sql.Int, detalleCuentaId)
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
              DC.ID = @detalleCuentaId
              AND I.NombreFisico LIKE '%' + @nombreEquipo + '%' ${whereActualizar};
          `);

        if (result.rowsAffected[0] > 0) {
          return 'Item actualizado correctamente';
        } else {
          return 'No se encontró el item para actualizar';
        }
      }

    } else {
      const { idVisita, idOrden, nombreEquipo } = params;
      if (nombreEquipo.startsWith('DespachoToptech')) {
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
        WHERE VisitaID = @idVisita and Orden = @idOrden ${whereActualizar}
`)

        // Verifica si se actualizó alguna fila
        if (result.rowsAffected[0] > 0) {
          return 'Orden actualizada correctamente'
        } else {
          return 'No se encontró la orden para actualizar'
        }
      } else {
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
            AND I.NombreFisico LIKE '%' + @nombreEquipo + '%' ${whereActualizar};
        `)

        // Verifica si se actualizó alguna fila
        if (result.rowsAffected[0] > 0) {
          return 'Orden actualizada correctamente'
        } else {
          return 'No se encontró la orden para actualizar'
        }
      }
    }
  } catch (error) {
    console.error('Error al actualizar la orden:', error)
    throw new Error('No se pudo actualizar la orden')
  }
}
