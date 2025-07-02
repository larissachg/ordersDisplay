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
  

    let despachoStr = ` INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%' `
    let whereStr = ''
    if (nombreEquipo === 'DespachoToptech') {
      despachoStr = ''
    } else if (nombreEquipo === 'DespachoToptechDelivery') {
      despachoStr = ''
      whereStr = ' and Visitas.MesaID is null'
    } else if (nombreEquipo === 'DespachoToptechMesa') {
      despachoStr = ''
      whereStr = ' and Visitas.MesaID is not null'
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
      WITH FilteredDetalleCuenta AS (
        SELECT ID, VisitaID, ProductoID, TomoPedidoMeseroID, Orden, Cantidad, Hora, Borrada, Terminado
        FROM DetalleCuenta
        WHERE Terminado IS NOT NULL
        ),
        ProductosCombo AS (
          SELECT DetalleCuentaID, STRING_AGG(P2.Nombre, ',') AS productosCombo
          FROM ProductosCombos
          INNER JOIN Productos AS P2 ON P2.ID = ProductosCombos.ProductoID
          GROUP BY DetalleCuentaID
        )
        SELECT
          Visitas.Id AS id,
          COALESCE(NULLIF(TRIM(Visitas.Identificador), ''), Mesas.Nombre) AS mesa,
          Meseros.Nombre AS mesero,
          TipoEnvios.Nombre AS tipoEnvio,
          ParaLlevar.Nombre AS paraLlevar,
          Productos.Nombre AS producto,
          DetalleCuenta.Orden AS orden,
          DetalleCuenta.Cantidad AS cantidad,
          CAST(DetalleCuenta.Hora AS DATETIME) AS hora,
          DetalleCuenta.Borrada AS borrada,
          Observaciones.Observacion AS observacion,
          PC.productosCombo
        FROM FilteredDetalleCuenta AS DetalleCuenta
        INNER JOIN Visitas ON DetalleCuenta.VisitaID = Visitas.ID
        INNER JOIN Productos ON Productos.ID = DetalleCuenta.ProductoID
        INNER JOIN Meseros ON Meseros.MeseroID = DetalleCuenta.TomoPedidoMeseroID
        LEFT JOIN Observaciones ON Observaciones.DetalleCuentaID = DetalleCuenta.ID
        LEFT JOIN Mesas ON Mesas.ID = Visitas.MesaID
        LEFT JOIN TipoEnvios ON Visitas.TipoEnvioID = TipoEnvios.TipoEnvioID
        LEFT JOIN ParaLlevar ON Visitas.ParaLlevarID = ParaLlevar.ParaLlevarID
        ${despachoStr}   
        LEFT JOIN ProductosCombo PC ON PC.DetalleCuentaID = DetalleCuenta.ID
        WHERE (
            (ParaLlevar.HoraRecoger IS NULL AND DetalleCuenta.Hora between '${startOfToday}' and '${startOfTomorrow}')
            OR (ParaLlevar.HoraRecoger IS NOT NULL AND ParaLlevar.HoraRecoger BETWEEN '${startOfToday}' and '${startOfTomorrow}')
        ) ${whereStr}   
        ORDER BY DetalleCuenta.Orden DESC, Visitas.Id DESC, DetalleCuenta.Hora, Productos.Nombre;
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
