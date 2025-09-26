// getOrdenesSeparado.ts
import { OrdenDb } from '@/interfaces/Orden';
import { poolPromise } from './db';
import moment from 'moment-timezone';

export async function getMainOrdenesDb(nombreEquipo: string, limit: number): Promise<OrdenDb[]> {
  try {
    const now = moment().tz('America/La_Paz');
    const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const startOfTomorrow = now.clone().add(1, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');

    let despachoTopVisitasStr = `
      INNER JOIN Visitas v ON v.ID = dc.VisitaID
      LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      INNER JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
      INNER JOIN Impresoras i ON tp.kitchenDisplayID = i.ImpresoraID AND i.NombreFisico = '${nombreEquipo}'
    `;
    let despachoStr = `
      INNER JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
      INNER JOIN Impresoras i ON tp.kitchenDisplayID = i.ImpresoraID AND i.NombreFisico = '${nombreEquipo}'
    `;

    if (nombreEquipo === 'DespachoToptech') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    } else if (nombreEquipo === 'DespachoToptechDelivery') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID AND v.MesaID IS NULL
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    } else if (nombreEquipo === 'DespachoToptechMesa') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID AND v.MesaID IS NOT NULL
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    }

    let query = `WITH BaseData AS (
      SELECT DISTINCT
        dc.VisitaID,
        dc.Orden,
        dc.ID AS DetalleCuentaID,
        dc.Cantidad,
        dc.Hora,
        dc.Borrada,
        dc.Terminado,
        dc.TomoPedidoMeseroID,
        dc.ProductoID,
        COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva,
        v.ID AS VisitaID_Visitas,
        v.Identificador,
        v.MesaID,
        v.TipoEnvioID,
        v.ParaLlevarID,
        p.TipoProductoID
      FROM
        DetalleCuenta dc
        INNER JOIN Productos p ON p.ID = dc.ProductoID
        ${despachoTopVisitasStr}
      WHERE
        COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN '${startOfToday}' AND '${startOfTomorrow}'
    ),
    NonSnoozedGroups AS (
      SELECT
        VisitaID,
        Orden
      FROM BaseData
      WHERE
          Terminado IS NULL
      GROUP BY VisitaID, Orden
      HAVING NOT EXISTS (
        SELECT 1 FROM KDS_Snooze kd WHERE kd.VisitaID = BaseData.VisitaID AND kd.Orden = BaseData.Orden AND kd.Snoozed = 1
      )
    ),
    TopVisitas AS (
      SELECT
        VisitaID,
        Orden,
        ROW_NUMBER() OVER (ORDER BY Orden, VisitaID) AS RN
      FROM NonSnoozedGroups
    )
    SELECT
      v.Id AS id,
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
      COALESCE(kd.Resaltado, 0) AS resaltado,
      COALESCE(kd.Snoozed, 0) AS snoozed
    FROM
      BaseData bd
      INNER JOIN TopVisitas tv ON bd.VisitaID = tv.VisitaID AND bd.Orden = tv.Orden
      INNER JOIN Visitas v ON bd.VisitaID = v.ID
      INNER JOIN Productos p ON p.ID = bd.ProductoID
      INNER JOIN Meseros mes ON mes.MeseroID = bd.TomoPedidoMeseroID
      LEFT JOIN Observaciones o ON o.DetalleCuentaID = bd.DetalleCuentaID
      LEFT JOIN Mesas m ON m.ID = v.MesaID
      LEFT JOIN TipoEnvios te ON te.TipoEnvioID = v.TipoEnvioID
      LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      LEFT JOIN KDS_Snooze kd ON kd.VisitaID = bd.VisitaID AND kd.Orden = bd.Orden
      ${despachoStr}
    WHERE
      tv.RN <= ${limit}
    ORDER BY
      bd.Orden,
      v.Id,
      bd.Hora,
      p.Nombre;`;

    if (nombreEquipo === 'VisorCliente') {
      query = `WITH BaseData AS (
            SELECT DISTINCT
            dc.VisitaID,
            dc.Orden,
            dc.ID AS DetalleCuentaID,
            dc.Cantidad,
            dc.Hora,
            dc.Borrada,
            dc.Terminado,
            dc.TomoPedidoMeseroID,
            dc.ProductoID,
            COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva,
            v.ID AS VisitaID_Visitas,
            v.Identificador,
            v.MesaID,
            v.TipoEnvioID,
            v.ParaLlevarID,
            p.TipoProductoID
            FROM
            DetalleCuenta dc
            INNER JOIN Productos p ON p.ID = dc.ProductoID
            INNER JOIN Visitas v ON v.ID = dc.VisitaID
            LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
            WHERE
            COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN '${startOfToday}' AND '${startOfTomorrow}'
            ),
            NonSnoozedGroups AS (
            SELECT
                VisitaID,
                Orden,
                MAX(Terminado) AS MaxTerminado
            FROM BaseData bd
            GROUP BY VisitaID, Orden
            HAVING 
                MIN(Terminado) IS NOT NULL 
                AND MAX(CASE WHEN Terminado IS NULL THEN 1 ELSE 0 END) = 0
                AND NOT EXISTS (SELECT 1 FROM KDS_Snooze kd WHERE kd.VisitaID = bd.VisitaID AND kd.Orden = bd.Orden)
            ),
            TopVisitas AS (
            SELECT
            VisitaID,
            Orden,
            ROW_NUMBER() OVER (ORDER BY MaxTerminado DESC, VisitaID DESC) AS RN
            FROM NonSnoozedGroups
            )
            SELECT
            v.Id AS id,
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
            FROM
            BaseData bd
            INNER JOIN TopVisitas tv ON bd.VisitaID = tv.VisitaID AND bd.Orden = tv.Orden
            INNER JOIN Visitas v ON bd.VisitaID = v.ID
            INNER JOIN Productos p ON p.ID = bd.ProductoID
            INNER JOIN Meseros mes ON mes.MeseroID = bd.TomoPedidoMeseroID
            LEFT JOIN Observaciones o ON o.DetalleCuentaID = bd.DetalleCuentaID
            LEFT JOIN Mesas m ON m.ID = v.MesaID
            LEFT JOIN TipoEnvios te ON te.TipoEnvioID = v.TipoEnvioID
            LEFT JOIN ParaLlevar pl ON pl.ParaLlevarID = v.ParaLlevarID
            WHERE
            tv.RN <= ${limit}
            ORDER BY
            tv.RN ASC,
            bd.Orden DESC,
            v.Id DESC,
            bd.Hora DESC,
            p.Nombre DESC;
        `;
    }
    //console.log(query);
    const pool = await poolPromise;
    const result = await pool.request().query(query);
    return result.recordset as OrdenDb[];
  } catch (error) {
    console.error('Error al obtener órdenes principales:', error);
    throw new Error('No se pudieron obtener las órdenes principales');
  }
}

export async function getSnoozedOrdenesDb(nombreEquipo: string, limit: number): Promise<OrdenDb[]> {
  try {
    const now = moment().tz('America/La_Paz');
    const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const startOfTomorrow = now.clone().add(1, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');

    let despachoTopVisitasStr = `
      INNER JOIN Visitas v ON v.ID = dc.VisitaID
      LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      INNER JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
      INNER JOIN Impresoras i ON tp.kitchenDisplayID = i.ImpresoraID AND i.NombreFisico = '${nombreEquipo}'
    `;
    let despachoStr = `
      INNER JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
      INNER JOIN Impresoras i ON tp.kitchenDisplayID = i.ImpresoraID AND i.NombreFisico = '${nombreEquipo}'
    `;

    if (nombreEquipo === 'DespachoToptech') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    } else if (nombreEquipo === 'DespachoToptechDelivery') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID AND v.MesaID IS NULL
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    } else if (nombreEquipo === 'DespachoToptechMesa') {
      despachoTopVisitasStr = `
        INNER JOIN Visitas v ON v.ID = dc.VisitaID AND v.MesaID IS NOT NULL
        LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      `;
      despachoStr = '';
    }

    const query = `WITH BaseData AS (
      SELECT DISTINCT
        dc.VisitaID,
        dc.Orden,
        dc.ID AS DetalleCuentaID,
        dc.Cantidad,
        dc.Hora,
        dc.Borrada,
        dc.Terminado,
        dc.TomoPedidoMeseroID,
        dc.ProductoID,
        COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva,
        v.ID AS VisitaID_Visitas,
        v.Identificador,
        v.MesaID,
        v.TipoEnvioID,
        v.ParaLlevarID,
        p.TipoProductoID
      FROM
        DetalleCuenta dc
        INNER JOIN Productos p ON p.ID = dc.ProductoID
        ${despachoTopVisitasStr}
      WHERE
        COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN '${startOfToday}' AND '${startOfTomorrow}'      
    ),
    SnoozedGroups AS (
      SELECT
        VisitaID,
        Orden
      FROM BaseData
      WHERE Terminado IS NULL
      GROUP BY VisitaID, Orden
      HAVING EXISTS (
        SELECT 1 FROM KDS_Snooze kd WHERE kd.VisitaID = BaseData.VisitaID AND kd.Orden = BaseData.Orden AND kd.Snoozed = 1
      )
    ),
    SnoozedVisitas AS (
      SELECT
        sg.VisitaID,
        sg.Orden,
        ROW_NUMBER() OVER (ORDER BY MIN(kd.KDSsnoozeID)) AS RN
      FROM SnoozedGroups sg
      INNER JOIN KDS_Snooze kd ON kd.VisitaID = sg.VisitaID AND kd.Orden = sg.Orden
      GROUP BY sg.VisitaID, sg.Orden
    )
    SELECT
      v.Id AS id,
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
      sv.RN AS newOrder,
      COALESCE(kd.Resaltado, 0) AS resaltado,
      COALESCE(kd.Snoozed, 0) AS snoozed
    FROM
      BaseData bd
      INNER JOIN SnoozedVisitas sv ON bd.VisitaID = sv.VisitaID AND bd.Orden = sv.Orden
      INNER JOIN Visitas v ON bd.VisitaID = v.ID
      INNER JOIN Productos p ON p.ID = bd.ProductoID
      INNER JOIN Meseros mes ON mes.MeseroID = bd.TomoPedidoMeseroID
      LEFT JOIN Observaciones o ON o.DetalleCuentaID = bd.DetalleCuentaID
      LEFT JOIN Mesas m ON m.ID = v.MesaID
      LEFT JOIN TipoEnvios te ON te.TipoEnvioID = v.TipoEnvioID
      LEFT JOIN ParaLLevar pl ON pl.ParaLlevarID = v.ParaLlevarID
      LEFT JOIN KDS_Snooze kd ON kd.VisitaID = bd.VisitaID AND kd.Orden = bd.Orden
      ${despachoStr}
    WHERE
      sv.RN <= ${limit}
    ORDER BY
      sv.RN,
      bd.Hora,
      p.Nombre;`;

    if (nombreEquipo === 'VisorCliente') {
        return [];
    }

    const pool = await poolPromise;
    const result = await pool.request().query(query);
    return result.recordset as OrdenDb[];
  } catch (error) {
    console.error('Error al obtener órdenes snoozed:', error);
    throw new Error('No se pudieron obtener las órdenes snoozed');
  }
}