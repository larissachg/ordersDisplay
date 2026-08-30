import sql from 'mssql'
import moment from 'moment-timezone'
import { getPool } from '../db'
import { ensureTablasConteo } from './schema'
import { getCabecera } from './conteos'
import { puedeAplicar } from '@/contants/inventario'
import { ResultadoAplicar, SesionInventario } from '@/interfaces/Inventario'

const ahoraLaPaz = () => moment().tz('America/La_Paz').format('YYYY-MM-DD HH:mm:ss')
const redondear3 = (n: number) => Math.round(n * 1000) / 1000

// Aplica el conteo como ajuste del POS dentro de UNA transaccion (spec seccion 7):
// gate de estado -> INSERT Ajustes -> INSERT DetallesAjustes -> UPDATE stock -> AjusteID.
// Logg va fuera de la transaccion (best effort: su falla no revierte el ajuste).
export async function aplicarConteo(
  conteoId: number,
  sesion: SesionInventario
): Promise<ResultadoAplicar> {
  if (!puedeAplicar(sesion.tipoUsuarioId)) {
    return { ok: false, ajusteId: null, mensaje: 'Sin permiso para aplicar ajustes' }
  }
  await ensureTablasConteo()
  const cab = await getCabecera(conteoId)
  if (!cab) return { ok: false, ajusteId: null, mensaje: 'Conteo inexistente' }
  const colStock = `Stock${cab.almacenId}` // int validado

  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  await transaction.begin()
  let ajusteId = 0
  try {
    // 1) Gate anti doble aplicacion.
    const gate = await new sql.Request(transaction)
      .input('conteoId', sql.Int, conteoId)
      .input('fecha', sql.VarChar, ahoraLaPaz())
      .input('meseroId', sql.Int, sesion.meseroId)
      .query(`
        UPDATE KDS_Conteos
        SET Estado = 'aplicado', FechaAplicacion = @fecha, AplicadoPorMeseroID = @meseroId
        WHERE ConteoID = @conteoId AND Estado = 'revision'
      `)
    if (gate.rowsAffected[0] === 0) {
      await transaction.rollback()
      return { ok: false, ajusteId: null, mensaje: 'El conteo no está en revisión (¿ya aplicado?)' }
    }

    // 2) Detalles contados + costos vivos (CostoBruto puede no existir en Productos).
    const colCostoBruto = await new sql.Request(transaction).query(
      `SELECT COL_LENGTH('Productos', 'CostoBruto') AS len`
    )
    const exprCostoBruto =
      colCostoBruto.recordset[0]?.len != null ? 'COALESCE(p.CostoBruto, 0)' : '0'
    const dets = await new sql.Request(transaction).input('conteoId', sql.Int, conteoId).query(`
      SELECT d.ProductoID, d.CantidadContada, d.StockSnapshot,
             COALESCE(d.Observacion, '') AS Observacion,
             COALESCE(p.Costo, 0) AS Costo, ${exprCostoBruto} AS CostoBruto
      FROM KDS_ConteoDetalles d
      INNER JOIN Productos p ON p.ID = d.ProductoID
      WHERE d.ConteoID = @conteoId
    `)
    if (dets.recordset.length === 0) {
      await transaction.rollback()
      return { ok: false, ajusteId: null, mensaje: 'El conteo no tiene productos capturados' }
    }

    // 3) Cabecera en Ajustes. Observacion compatible con los filtros LIKE del POS.
    const obs = `Conteo KDS #${conteoId}` + (cab.noVendibles ? ' (No Vendibles)' : '')
    const identidad = await new sql.Request(transaction).query(
      `SELECT COLUMNPROPERTY(OBJECT_ID('Ajustes'), 'AjusteID', 'IsIdentity') AS esIdentity`
    )
    const esIdentity = identidad.recordset[0]?.esIdentity === 1
    if (esIdentity) {
      const ins = await new sql.Request(transaction)
        .input('fecha', sql.VarChar, ahoraLaPaz())
        .input('obs', sql.VarChar, obs)
        .input('almacenId', sql.Int, cab.almacenId)
        .query(`
          INSERT INTO Ajustes (Fecha, Observacion, AlmacenID, FechaRegistro)
          OUTPUT INSERTED.AjusteID
          VALUES (@fecha, @obs, @almacenId, @fecha)
        `)
      ajusteId = ins.recordset[0].AjusteID
    } else {
      // Cliente viejo max()+1: lock de aplicacion para no colisionar con una caja POS.
      const ins = await new sql.Request(transaction)
        .input('fecha', sql.VarChar, ahoraLaPaz())
        .input('obs', sql.VarChar, obs)
        .input('almacenId', sql.Int, cab.almacenId)
        .query(`
          EXEC sp_getapplock @Resource = 'Ajustes', @LockMode = 'Exclusive',
                             @LockOwner = 'Transaction', @LockTimeout = 5000;
          DECLARE @nuevoId int = (SELECT COALESCE(MAX(AjusteID), 0) + 1 FROM Ajustes);
          INSERT INTO Ajustes (AjusteID, Fecha, Observacion, AlmacenID, FechaRegistro)
          VALUES (@nuevoId, @fecha, @obs, @almacenId, @fecha);
          SELECT @nuevoId AS AjusteID;
        `)
      ajusteId = ins.recordset[0].AjusteID
    }

    // 4) Detalle + 5) stock, producto por producto dentro de la transaccion.
    for (const d of dets.recordset) {
      const delta = redondear3(d.CantidadContada - d.StockSnapshot)
      await new sql.Request(transaction)
        .input('cantidad', sql.Float, delta)
        .input('cantidadFinal', sql.Float, d.CantidadContada)
        .input('obs', sql.VarChar, d.Observacion)
        .input('ajusteId', sql.Int, ajusteId)
        .input('productoId', sql.Int, d.ProductoID)
        .input('costo', sql.Float, d.Costo)
        .input('costoBruto', sql.Float, d.CostoBruto)
        .query(`
          INSERT INTO DetallesAjustes (Cantidad, CantidadFinal, Observacion, AjusteID, ProductoID, Costo, CostoBruto)
          VALUES (@cantidad, @cantidadFinal, @obs, @ajusteId, @productoId, @costo, @costoBruto)
        `)
      if (delta !== 0) {
        await new sql.Request(transaction)
          .input('delta', sql.Float, delta)
          .input('productoId', sql.Int, d.ProductoID)
          .query(`
            UPDATE Productos
            SET ${colStock} = COALESCE(${colStock}, 0) + @delta
            WHERE ID = @productoId
          `)
      }
    }

    // 6) Referencia cruzada en el conteo.
    await new sql.Request(transaction)
      .input('conteoId', sql.Int, conteoId)
      .input('ajusteId', sql.Int, ajusteId)
      .query(`UPDATE KDS_Conteos SET AjusteID = @ajusteId WHERE ConteoID = @conteoId`)

    await transaction.commit()
  } catch (error) {
    try {
      await transaction.rollback()
    } catch {
      /* transaccion ya abortada */
    }
    console.error('Error al aplicar conteo (rollback completo):', error)
    return { ok: false, ajusteId: null, mensaje: 'Error al aplicar: no se movió nada de stock' }
  }

  // 7) Bitacora del POS, fuera de la transaccion (best effort).
  try {
    const pool2 = await getPool()
    await pool2
      .request()
      .input('fecha', sql.VarChar, ahoraLaPaz())
      .input(
        'accion',
        sql.VarChar,
        `Aplicó ajuste ${ajusteId} del conteo KDS #${conteoId} (almacén ${cab.almacenId})`.slice(
          0,
          199
        )
      )
      .input('userId', sql.Int, sesion.meseroId)
      .query(
        `INSERT INTO Logg (Fecha, Accion, Formulario, UserID) VALUES (@fecha, @accion, 'KDS Inventario', @userId)`
      )
  } catch (error) {
    console.error('No se pudo escribir la bitácora Logg del ajuste:', error)
  }

  return { ok: true, ajusteId, mensaje: `Ajuste #${ajusteId} aplicado` }
}
