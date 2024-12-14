import { OrdenDb } from '@/interfaces/Orden'
import { poolPromise } from './db'
import moment from 'moment-timezone'

export async function getHistoryDb(nombreEquipo: string): Promise<OrdenDb[]> {
  try {
    const startOfToday = moment
      .tz('America/La_Paz')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')

     let despachoStr = ` INNER JOIN TiposProductos ON TiposProductos.TipoProductoID = Productos.TipoProductoID 
      INNER JOIN Impresoras ON TiposProductos.kitchenDisplayID = Impresoras.ImpresoraID  AND Impresoras.NombreFisico LIKE '%${nombreEquipo}%' `
     let whereStr = ''
    if (nombreEquipo === 'DespachoToptech') {
      despachoStr = ''    
    }else if (nombreEquipo === 'DespachoDeliveryToptech') {      
      despachoStr = ''
      whereStr = ' and Visitas.MesaID is null'
    }else if (nombreEquipo === 'DespachoMesaToptech') {      
      despachoStr = ''
      whereStr = ' and Visitas.MesaID is not null'
    }

    const pool = await poolPromise
    const result = await pool.request().query(`
       SELECT  
        Visitas.Id AS id,
        iif(Visitas.Identificador is null OR LEN(TRIM(Visitas.Identificador)) <= 2, Mesas.Nombre,Visitas.Identificador) AS mesa,
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
        ${despachoStr}       
    WHERE 
        DetalleCuenta.Hora >= '${startOfToday}'
        AND DetalleCuenta.Terminado IS NOT NULL ${whereStr}       
    ORDER BY 
        DetalleCuenta.Orden desc, 
        Visitas.Id desc, 
        DetalleCuenta.Hora, 
        Productos.Nombre;
      `)
    return result.recordset as OrdenDb[]
  } catch (error) {
    console.error('Error al obtener las órdenes:', error)
    throw new Error('No se pudieron obtener las órdenes')
  }
}
