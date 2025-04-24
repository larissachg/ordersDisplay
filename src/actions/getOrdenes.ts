import { OrdenDb } from '@/interfaces/Orden'
import { poolPromise } from './db'
import moment from 'moment-timezone'

export async function getOrdenesDb(nombreEquipo: string, limit: number): Promise<OrdenDb[]> {
  try {
    const now = moment().tz('America/La_Paz'); // Get time once on server
    const startOfToday = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const startOfTomorrow = now
      .clone()
      .add(1, 'day')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

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

const query1 = `WITH BaseData AS (
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
        COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN '${startOfToday}' and '${startOfTomorrow}'
        AND dc.Borrada = 0
),
TopVisitas AS (
    SELECT
        VisitaID,
        Orden,
        ROW_NUMBER() OVER (ORDER BY Orden, VisitaID) AS RN
    FROM
        BaseData
    WHERE
        Terminado IS NULL -- Movemos el filtro de Terminado aquí para limitar las filas en TopVisitas
    GROUP BY VisitaID, Orden
),
ObservacionesUnicas AS (
    SELECT
        DetalleCuentaID,
        Observacion,
        ROW_NUMBER() OVER (PARTITION BY DetalleCuentaID ORDER BY Observacion) AS RN
    FROM
        Observaciones
),
MesasUnicas AS (
    SELECT
        ID,
        Nombre,
        ROW_NUMBER() OVER (PARTITION BY ID ORDER BY Nombre) AS RN
    FROM
        Mesas
),
TipoEnviosUnicos AS (
    SELECT
        TipoEnvioID,
        Nombre,
        ROW_NUMBER() OVER (PARTITION BY TipoEnvioID ORDER BY Nombre) AS RN
    FROM
        TipoEnvios
),
ParaLlevarUnicos AS (
    SELECT
        ParaLlevarID,
        Nombre,
        ROW_NUMBER() OVER (PARTITION BY ParaLlevarID ORDER BY Nombre) AS RN
    FROM
        ParaLLevar
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
    (SELECT STRING_AGG(p2.Nombre, ',')
     FROM ProductosCombos pc
     INNER JOIN Productos p2 ON p2.ID = pc.ProductoID
     WHERE pc.DetalleCuentaID = bd.DetalleCuentaID) AS productosCombo
FROM
    BaseData bd
    INNER JOIN TopVisitas tv ON bd.VisitaID = tv.VisitaID AND bd.Orden = tv.Orden
    INNER JOIN Visitas v ON bd.VisitaID = v.ID
    INNER JOIN Productos p ON p.ID = bd.ProductoID
    INNER JOIN Meseros mes ON mes.MeseroID = bd.TomoPedidoMeseroID
    LEFT JOIN ObservacionesUnicas o ON o.DetalleCuentaID = bd.DetalleCuentaID AND o.RN = 1
    LEFT JOIN MesasUnicas m ON m.ID = v.MesaID AND m.RN = 1
    LEFT JOIN TipoEnviosUnicos te ON te.TipoEnvioID = v.TipoEnvioID AND te.RN = 1
    LEFT JOIN ParaLlevarUnicos pl ON pl.ParaLlevarID = v.ParaLlevarID AND pl.RN = 1
    ${despachoStr}
WHERE
    tv.RN <= ${limit}   
ORDER BY
    bd.Orden,
    v.Id,
    bd.Hora,
    p.Nombre;
`;

   // console.log('Query:', query1)
    const pool = await poolPromise
    const result = await pool.request().query(query1)
   // console.log('Result:', result)

    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
