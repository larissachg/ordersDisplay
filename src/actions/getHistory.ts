import { OrdenDb } from '@/interfaces/Orden'
import { poolPromise } from './db'
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
  

    let despachoStr = ` INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = p.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%' `
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


    //const queryOLD =`
    //   SELECT  
    //    Visitas.Id AS id,
    //    iif(Visitas.Identificador is null OR LEN(TRIM(Visitas.Identificador)) <= 2, Mesas.Nombre,Visitas.Identificador) AS mesa,
    //    Meseros.Nombre AS mesero,
    //    TipoEnvios.Nombre AS tipoEnvio,
    //    ParaLlevar.Nombre AS paraLlevar, 
    //    Productos.Nombre AS producto,
    //    DetalleCuenta.Orden AS orden,
    //    DetalleCuenta.Cantidad AS cantidad,
    //    CAST(DetalleCuenta.Hora AS DATETIME) AS hora,
    //    DetalleCuenta.Borrada AS borrada, 
    //    Observaciones.Observacion AS observacion,
    //    (
    //        SELECT STRING_AGG(P2.Nombre, ',') 
    //        FROM ProductosCombos
    //        INNER JOIN Productos AS P2 ON P2.ID = ProductosCombos.ProductoID 
    //        WHERE ProductosCombos.DetalleCuentaID = DetalleCuenta.ID 
    //    ) AS productosCombo
    //FROM 
    //    DetalleCuenta INNER JOIN 
    //    Visitas ON DetalleCuenta.visitaID = Visitas.ID 
    //    INNER JOIN Productos ON Productos.ID = DetalleCuenta.ProductoID 
    //    INNER JOIN Meseros ON Meseros.MeseroID = DetalleCuenta.TomoPedidoMeseroID 
    //    LEFT JOIN Observaciones ON Observaciones.DetalleCuentaID = DetalleCuenta.ID 
    //    LEFT JOIN Mesas ON Mesas.ID = Visitas.MesaID 
    //    LEFT JOIN TipoEnvios ON Visitas.TipoEnvioID = TipoEnvios.TipoEnvioID 
    //    LEFT JOIN ParaLlevar ON Visitas.ParaLlevarID = ParaLlevar.ParaLlevarID 
    //    ${despachoStr}       
    //WHERE 
    //    iif(ParaLlevar.HoraRecoger is null, DetalleCuenta.Hora, ParaLlevar.HoraRecoger)  between '${startOfToday}' and '${startOfTomorrow}'
    //    AND DetalleCuenta.Terminado IS NOT NULL ${whereStr}       
    //ORDER BY 
    //    DetalleCuenta.Orden desc, 
    //    Visitas.Id desc, 
    //    DetalleCuenta.Hora, 
    //    Productos.Nombre;
    //  `

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
              dc.ProductoID,
              COALESCE(pl.HoraRecoger, dc.Hora) AS HoraEfectiva,
              v.Identificador,
              v.MesaID,
              v.TipoEnvioID,
              v.ParaLlevarID,
              p.TipoProductoID
          FROM DetalleCuenta dc
          INNER JOIN Productos p ON p.ID = dc.ProductoID
          INNER JOIN Visitas v ON v.ID = dc.VisitaID
          LEFT JOIN ParaLlevar pl ON pl.ParaLlevarID = v.ParaLlevarID
          ${despachoStr}    
          WHERE COALESCE(pl.HoraRecoger, dc.Hora) BETWEEN '${startOfToday}' and '${startOfTomorrow}'
            AND dc.Borrada = 0 ${whereStr} 
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
          bd.orden,
          bd.cantidad,
          bd.DetalleCuentaID,
          CAST(bd.Hora AS DATETIME) AS hora,
          bd.borrada,
          o.observacion,
          bd.terminado,
          (SELECT STRING_AGG(p2.Nombre, ',')
          FROM ProductosCombos pc
          INNER JOIN Productos p2 ON p2.ID = pc.ProductoID
          WHERE pc.DetalleCuentaID = bd.DetalleCuentaID) AS productosCombo
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
    //console.log('Query:', query1)
    const pool = await poolPromise
    const result = await pool.request().query(query1)
    
    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
