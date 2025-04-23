import { OrdenDb } from '@/interfaces/Orden'
import { poolPromise } from './db'
import moment from 'moment-timezone'

export async function getOrdenesDb(nombreEquipo: string, limit: number): Promise<OrdenDb[]> {
  try {
    const startOfToday = moment
      .tz('America/La_Paz')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')

    let despachoTopVisitasStr = ` INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%' `

    let despachoStr = ` INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%' `

    if (nombreEquipo === 'DespachoToptech') {
      despachoTopVisitasStr = ''
      despachoStr = ''
    } else if (nombreEquipo === 'DespachoToptechDelivery') {
      despachoTopVisitasStr =
        ' INNER JOIN Visitas ON Visitas.ID = DetalleCuenta.VisitaID and Visitas.MesaID is null '
      despachoStr = ''
    } else if (nombreEquipo === 'DespachoToptechMesa') {
      despachoTopVisitasStr =
        ' INNER JOIN Visitas ON Visitas.ID = DetalleCuenta.VisitaID and Visitas.MesaID is not null '
      despachoStr = ''
    }

    const query1 = `
  WITH TopVisitas AS (
      SELECT 
          DetalleCuenta.VisitaID,DetalleCuenta.Orden,
          ROW_NUMBER() OVER (ORDER BY DetalleCuenta.Orden, DetalleCuenta.VisitaID) AS RN
      FROM 
          DetalleCuenta
          INNER JOIN Productos ON Productos.ID = DetalleCuenta.ProductoID
      ${despachoTopVisitasStr}
      WHERE 
          DetalleCuenta.Hora >= '${startOfToday}'
          AND DetalleCuenta.Terminado IS NULL    
          AND DetalleCuenta.Borrada = 0
      GROUP BY 
          DetalleCuenta.VisitaID, DetalleCuenta.Orden
  ),
  OrdersWithPendingItems AS (
      SELECT DISTINCT
          DetalleCuenta.VisitaID, Orden
      FROM
          DetalleCuenta
      WHERE
          DetalleCuenta.Hora >= '${startOfToday}'
          AND DetalleCuenta.Terminado IS NULL
          AND DetalleCuenta.Borrada = 0
  )
  SELECT  
      Visitas.Id AS id,
      iif(Visitas.Identificador is null OR LEN(TRIM(Visitas.Identificador)) <= 2, Mesas.Nombre, 
      iif( RIGHT(Identificador, 2) = '|0' , LEFT(Identificador, LEN(Identificador) - 2) , Identificador) ) AS mesa,
      Meseros.Nombre AS mesero,
      TipoEnvios.Nombre AS tipoEnvio,
      ParaLlevar.Nombre AS paraLlevar, 
      Productos.Nombre AS producto,
      DetalleCuenta.Orden AS orden,
      DetalleCuenta.Cantidad AS cantidad,
      DetalleCuenta.ID AS detalleCuentaId,
      CAST(DetalleCuenta.Hora AS DATETIME) AS hora,
      DetalleCuenta.Borrada AS borrada, 
      Observaciones.Observacion AS observacion,
      DetalleCuenta.Terminado AS terminado,
      (
          SELECT STRING_AGG(P2.Nombre, ',') 
          FROM ProductosCombos
          INNER JOIN Productos AS P2 ON P2.ID = ProductosCombos.ProductoID 
          WHERE ProductosCombos.DetalleCuentaID = DetalleCuenta.ID 
      ) AS productosCombo
  FROM 
      DetalleCuenta INNER JOIN 
      Visitas ON DetalleCuenta.visitaID = Visitas.ID 
      INNER JOIN Productos ON Productos.ID = DetalleCuenta.ProductoID 
      INNER JOIN Meseros ON Meseros.MeseroID = DetalleCuenta.TomoPedidoMeseroID 
      LEFT JOIN Observaciones ON Observaciones.DetalleCuentaID = DetalleCuenta.ID 
      LEFT JOIN Mesas ON Mesas.ID = Visitas.MesaID 
      LEFT JOIN TipoEnvios ON Visitas.TipoEnvioID = TipoEnvios.TipoEnvioID 
      LEFT JOIN ParaLlevar ON Visitas.ParaLlevarID = ParaLlevar.ParaLlevarID 
      INNER JOIN OrdersWithPendingItems ON DetalleCuenta.VisitaID = OrdersWithPendingItems.VisitaID AND DetalleCuenta.Orden = OrdersWithPendingItems.Orden
      INNER JOIN TopVisitas ON DetalleCuenta.VisitaID = TopVisitas.VisitaID and DetalleCuenta.Orden = TopVisitas.Orden
      ${despachoStr}      
  WHERE 
      DetalleCuenta.Hora >= '${startOfToday}'
      AND TopVisitas.RN <= ${limit} 
  ORDER BY 
      DetalleCuenta.Orden, 
      Visitas.Id, 
      DetalleCuenta.Hora, 
      Productos.Nombre;
  `
    const pool = await poolPromise
    const result = await pool.request().query(query1)
    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
