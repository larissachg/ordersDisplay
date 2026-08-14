import { OrdenDb } from '@/interfaces/Orden'
import { getPool, sql } from './db'
import moment from 'moment-timezone'

export async function getHistoryDb(nombreEquipo: string): Promise<OrdenDb[]> {
  try {
      const now = moment().tz('America/La_Paz'); // Get time once on server
      const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const startOfTomorrow = now
        .clone()
        .add(1, 'day')
        .startOf('day')
        .format('YYYY-MM-DD HH:mm:ss');


    let despachoStr = ` INNER JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
      INNER JOIN Impresoras i ON tp.kitchenDisplayID = i.ImpresoraID AND i.NombreFisico = @nombreEquipo `
    let whereStr = ''
    if (nombreEquipo === 'DespachoToptech') {
      despachoStr = ''
    } else if (nombreEquipo === 'DespachoToptechDelivery') {
      despachoStr = ''
      whereStr = ' and v.MesaID is null'
    } else if (nombreEquipo === 'DespachoToptechMesa') {
      despachoStr = ''
      whereStr = ' and v.MesaID is not null'
    }

      const query1 =`
      WITH BaseData AS (
          SELECT
              dc.VisitaID,
              dc.Orden,
              dc.ID AS DetalleCuentaID,
              dc.Cantidad,
              dc.Hora,
              dc.Borrada,
              dc.Terminado,
              dc.TomoPedidoMeseroID,
              dc.ProductoID
          FROM DetalleCuenta dc
          INNER JOIN Productos p ON p.ID = dc.ProductoID
          INNER JOIN Visitas v ON v.ID = dc.VisitaID
          LEFT JOIN ParaLlevar pl ON pl.ParaLlevarID = v.ParaLlevarID
          ${despachoStr}
          WHERE COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN @startOfToday AND @startOfTomorrow
            AND dc.Terminado IS NOT NULL ${whereStr}
      )
      SELECT
          v.ID AS id,
          COALESCE(
              NULLIF(LTRIM(RTRIM(v.Identificador)), ''),
              m.Nombre,
              CASE WHEN RIGHT(v.Identificador, 2) = '|0' THEN LEFT(v.Identificador, LEN(v.Identificador) - 2) ELSE v.Identificador END
          ) AS mesa,
          mes.Nombre AS mesero,
          te.Nombre AS tipoEnvio,
          pl.Nombre AS paraLlevar,
          p.Nombre AS producto,
          bd.Orden AS orden,
          bd.Cantidad AS cantidad,
          bd.DetalleCuentaID AS detalleCuentaId,
          CAST(bd.Hora AS DATETIME) AS hora,
          bd.Borrada AS borrada,
          o.Observacion AS observacion,
          bd.Terminado AS terminado,
          (SELECT STRING_AGG(REPLACE(p2.Nombre, ',', '.'), ',')
          FROM ProductosCombos pc
          INNER JOIN Productos p2 ON p2.ID = pc.ProductoID
          WHERE pc.DetalleCuentaID = bd.DetalleCuentaID) AS productosCombo,
          bd.Orden AS newOrder,
          0 AS resaltado,
          0 AS snoozed
      FROM BaseData bd
      INNER JOIN Visitas v ON bd.VisitaID = v.ID
      INNER JOIN Productos p ON p.ID = bd.ProductoID
      INNER JOIN Meseros mes ON mes.MeseroID = bd.TomoPedidoMeseroID
      LEFT JOIN Observaciones o ON o.DetalleCuentaID = bd.DetalleCuentaID
      LEFT JOIN Mesas m ON m.ID = v.MesaID
      LEFT JOIN TipoEnvios te ON te.TipoEnvioID = v.TipoEnvioID
      LEFT JOIN ParaLlevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      ORDER BY bd.Orden DESC, v.ID DESC, bd.Hora, p.Nombre;
      `
    const pool = await getPool()
    const result = await pool.request()
      .input('nombreEquipo', sql.VarChar, nombreEquipo)
      .input('startOfToday', sql.VarChar, startOfToday)
      .input('startOfTomorrow', sql.VarChar, startOfTomorrow)
      .query(query1)

    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
