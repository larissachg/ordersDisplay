import { OrdenDb } from '@/interfaces/Orden'
import { poolPromise } from './db'
import moment from 'moment-timezone'

export async function getOrdenesDb(nombreEquipo: string): Promise<OrdenDb[]> {
  try {
    const startOfToday = moment
      .tz('America/La_Paz')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')

    const pool = await poolPromise
    //    const result = await pool.request().query(`
    //     SELECT  Visitas.Id as id, Mesas.Nombre as mesa, Meseros.Nombre as mesero, TipoEnvios.Nombre as tipoEnvio,ParaLlevar.Nombre as paraLlevar,
    //Productos.Nombre as producto,DetalleCuenta.Orden as orden, DetalleCuenta.Cantidad as cantidad, CAST( DetalleCuenta.Hora AS DATETIME) as hora ,DetalleCuenta.Borrada as borrada,
    //Observaciones.Observacion as observacion, DetalleCuenta.Terminado as terminado
    //,(select STRING_AGG(P2.Nombre, ',') as combo from ProductosCombos inner join Productos as P2 on P2.ID =ProductosCombos.ProductoID
    //where ProductosCombos.DetalleCuentaID = DetalleCuenta.ID ) as productosCombo
    //
    //FROM  ((((((((DetalleCuenta INNER JOIN Visitas ON DetalleCuenta.visitaID = Visitas.ID)
    //INNER JOIN  Productos ON Productos.ID = DetalleCuenta.ProductoID)
    //INNER JOIN Meseros ON Meseros.MeseroID = DetalleCuenta.TomoPedidoMeseroID)
    //LEFT JOIN Observaciones ON Observaciones.DetalleCuentaID=DetalleCuenta.ID)
    //LEFT JOIN Mesas  ON Mesas.ID = Visitas.MesaID)
    //LEFT JOIN TipoEnvios ON Visitas.TipoEnvioID = TipoEnvios.TipoEnvioID)
    //LEFT JOIN ParaLlevar ON Visitas.ParaLlevarID = ParaLlevar.ParaLlevarID)
    //INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID)
    //INNER JOIN Impresoras ON (TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  and NombreFisico LIKE '%${nombreEquipo}%' )
    //where DetalleCuenta.Hora > '${startOfToday}'  and Terminado is null and
    //DetalleCuenta.VisitaID in (
    //SELECT top 9 DetalleCuenta.VisitaID
    //FROM  ((DetalleCuenta
    //INNER JOIN  Productos ON Productos.ID = DetalleCuenta.ProductoID)
    //INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID)
    //INNER JOIN Impresoras ON (TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  and NombreFisico LIKE '%${nombreEquipo}%' )
    //where DetalleCuenta.Hora > '${startOfToday}'  and Terminado is null
    //group by DetalleCuenta.VisitaID,DetalleCuenta.Orden
    //order by DetalleCuenta.Orden, DetalleCuenta.VisitaID
    //)
    //order by DetalleCuenta.Orden, Visitas.Id, DetalleCuenta.Hora, Productos.Nombre
    //    `);
    const result = await pool.request().query(`
  WITH TopVisitas AS (
      SELECT 
          DetalleCuenta.VisitaID,DetalleCuenta.Orden,
          ROW_NUMBER() OVER (ORDER BY DetalleCuenta.Orden, DetalleCuenta.VisitaID) AS RN
      FROM 
          DetalleCuenta
      INNER JOIN Productos ON Productos.ID = DetalleCuenta.ProductoID
      INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID
      WHERE 
          DetalleCuenta.Hora >= '${startOfToday}'
          AND DetalleCuenta.Terminado IS NULL
          AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%'
      GROUP BY 
          DetalleCuenta.VisitaID, DetalleCuenta.Orden
  )
  SELECT  
      Visitas.Id AS id,
      Mesas.Nombre AS mesa,
      Meseros.Nombre AS mesero,
      TipoEnvios.Nombre AS tipoEnvio,
      ParaLlevar.Nombre AS paraLlevar, 
      Productos.Nombre AS producto,
      DetalleCuenta.Orden AS orden,
      DetalleCuenta.Cantidad AS cantidad,
      CAST(DetalleCuenta.Hora AS DATETIME) AS hora,
      DetalleCuenta.Borrada AS borrada, 
      Observaciones.Observacion AS observacion,
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
      INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%'
      INNER JOIN TopVisitas ON DetalleCuenta.VisitaID = TopVisitas.VisitaID and DetalleCuenta.Orden = TopVisitas.Orden
  WHERE 
      DetalleCuenta.Hora >= '${startOfToday}'
      AND DetalleCuenta.Terminado IS NULL
      AND TopVisitas.RN <= 9
  ORDER BY 
      DetalleCuenta.Orden, 
      Visitas.Id, 
      DetalleCuenta.Hora, 
      Productos.Nombre;
  `)
    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
