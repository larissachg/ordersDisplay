// Prueba end-to-end del modulo de inventario contra la BD del .env.
// Correr con: npx -y tsx scripts/test-inventarioE2E.ts
//
// Ejercita el ciclo completo (crear -> capturar -> cerrar -> aplicar -> reaplicar)
// sobre UN producto y DESHACE todo al final: borra el ajuste, su detalle, la fila
// de Logg y el conteo, y restaura Stock<N> a su valor previo. No deja rastro.
// No usa PIN: llama a las actions con una sesion armada a mano, asi no hace falta
// la contrasenha de nadie. La capa de auth se prueba aparte, por HTTP.
import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env')
for (const linea of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

let fallas = 0
const check = (nombre: string, cond: boolean, detalle = '') => {
  if (cond) console.log(`ok: ${nombre}`)
  else {
    fallas++
    console.error(`FALLA: ${nombre}${detalle ? ' -> ' + detalle : ''}`)
  }
}

const main = async () => {
  // Import diferido: db.ts arma su config al importarse, necesita el .env cargado.
  const { getPool } = await import('../src/actions/db')
  const { crearConteo, upsertDetalle, getConteo, listarConteos } = await import(
    '../src/actions/inventario/conteos'
  )
  const { copiarDetalles } = await import('../src/actions/inventario/conteos')
  const { cerrarConteo, reabrirConteo, anularConteo } = await import(
    '../src/actions/inventario/transiciones'
  )
  const { aplicarConteo } = await import('../src/actions/inventario/aplicarConteo')
  const { getAlmacenes } = await import('../src/actions/inventario/getAlmacenes')
  const { getProductosContables } = await import('../src/actions/inventario/getProductosContables')
  const sql = (await import('mssql')).default

  const pool = await getPool()
  const sesion = { meseroId: 0, nombre: 'PRUEBA E2E', tipoUsuarioId: 1 }

  const almacenes = await getAlmacenes(sesion.meseroId)
  check('hay almacen interno', almacenes.length > 0)
  if (almacenes.length === 0) return
  const almacenId = almacenes[0].almacenId
  const colStock = `Stock${almacenId}`

  const productos = await getProductosContables(false)
  check('hay productos contables', productos.length > 0)
  if (productos.length === 0) return
  const producto = productos[0]

  const leerStock = async () => {
    const r = await pool
      .request()
      .input('id', sql.Int, producto.productoId)
      .query(`SELECT COALESCE(${colStock}, 0) AS stock, COALESCE(Costo, 0) AS costo FROM Productos WHERE ID = @id`)
    return { stock: r.recordset[0].stock as number, costo: r.recordset[0].costo as number }
  }

  const antes = await leerStock()
  console.log(`producto de prueba: #${producto.productoId} ${producto.nombre}`)
  console.log(`stock previo en ${colStock}: ${antes.stock}`)

  let conteoId = 0
  let conteoCopia = 0
  let ajusteId: number | null = null
  try {
    // --- 1) crear y capturar
    conteoId = await crearConteo(almacenId, false, sesion.meseroId)
    check('crearConteo devuelve id', conteoId > 0)

    const contado = Math.round((antes.stock + 3) * 1000) / 1000
    const r1 = await upsertDetalle(conteoId, producto.productoId, contado, 'prueba e2e', sesion.meseroId)
    check('upsertDetalle ok', r1 === 'ok', r1)

    // idempotencia del upsert: segunda captura reemplaza, no duplica
    const r2 = await upsertDetalle(conteoId, producto.productoId, contado, 'prueba e2e', sesion.meseroId)
    check('upsertDetalle repetido ok', r2 === 'ok', r2)
    const filas = await pool
      .request()
      .input('c', sql.Int, conteoId)
      .query('SELECT COUNT(*) AS n FROM KDS_ConteoDetalles WHERE ConteoID = @c')
    check('una sola fila de detalle', filas.recordset[0].n === 1, `n=${filas.recordset[0].n}`)

    const snap = await pool
      .request()
      .input('c', sql.Int, conteoId)
      .query('SELECT StockSnapshot FROM KDS_ConteoDetalles WHERE ConteoID = @c')
    check(
      'snapshot = stock vivo al capturar',
      snap.recordset[0].StockSnapshot === antes.stock,
      `snapshot=${snap.recordset[0].StockSnapshot} vivo=${antes.stock}`
    )

    // --- 1b) concurrencia: el reintento del cliente puede chocar con un guardado
    // manual del mismo producto. Nunca debe quedar mas de una fila.
    const enParalelo = await Promise.all([
      upsertDetalle(conteoId, producto.productoId, contado, 'a', sesion.meseroId),
      upsertDetalle(conteoId, producto.productoId, contado, 'b', sesion.meseroId),
      upsertDetalle(conteoId, producto.productoId, contado, 'c', sesion.meseroId),
      upsertDetalle(conteoId, producto.productoId, contado, 'd', sesion.meseroId)
    ])
    check('4 upserts concurrentes no fallan', enParalelo.every((r) => r === 'ok'), enParalelo.join('|'))
    const trasConcurrencia = await pool
      .request()
      .input('c', sql.Int, conteoId)
      .query('SELECT COUNT(*) AS n, MIN(CantidadContada) AS cant FROM KDS_ConteoDetalles WHERE ConteoID = @c')
    check(
      'sigue habiendo una sola fila tras 4 escrituras simultaneas',
      trasConcurrencia.recordset[0].n === 1,
      `n=${trasConcurrencia.recordset[0].n}`
    )
    check('cantidad intacta', Math.abs(trasConcurrencia.recordset[0].cant - contado) < 0.0001)

    // --- 1c) copia de un conteo anterior
    conteoCopia = await crearConteo(almacenId, false, sesion.meseroId)
    const copiadas = await copiarDetalles(conteoId, conteoCopia, almacenId)
    check('copia trae la fila del origen', copiadas === 1, `copiadas=${copiadas}`)
    const copia = await getConteo(conteoCopia, true)
    check('la cantidad se hereda', copia?.detalles[0].cantidadContada === contado)
    check('queda marcada como copiada', copia?.detalles[0].copiado === true)
    check(
      'el snapshot es el de HOY, no el heredado',
      copia?.detalles[0].stockSnapshot === antes.stock,
      `snapshot=${copia?.detalles[0].stockSnapshot}`
    )
    // recontar limpia la marca
    await upsertDetalle(conteoCopia, producto.productoId, contado, '', sesion.meseroId)
    const recontada = await getConteo(conteoCopia, true)
    check('recontar limpia la marca de copiado', recontada?.detalles[0].copiado === false)
    // copiar dos veces no duplica filas
    const segunda = await copiarDetalles(conteoId, conteoCopia, almacenId)
    check('copiar de nuevo no duplica', segunda === 0, `copiadas=${segunda}`)
    const filasCopia = await pool
      .request()
      .input('c', sql.Int, conteoCopia)
      .query('SELECT COUNT(*) AS n FROM KDS_ConteoDetalles WHERE ConteoID = @c')
    check('una sola fila en la copia', filasCopia.recordset[0].n === 1)

    // --- 2) captura ciega vs con diferencias
    const ciego = await getConteo(conteoId, false)
    check('payload ciego sin stock', ciego?.detalles[0].stockSnapshot === 0)
    const completo = await getConteo(conteoId, true)
    check('payload completo con stock', completo?.detalles[0].stockSnapshot === antes.stock)

    // --- 3) aplicar sobre un conteo abierto debe rebotar
    const prematuro = await aplicarConteo(conteoId, sesion)
    check('aplicar sin cerrar rebota', !prematuro.ok, prematuro.mensaje)

    // --- 4) cerrar (y observacion escrita al cerrar)
    const cierre = await cerrarConteo(conteoId, sesion, 'observacion de cierre e2e')
    check('cerrarConteo ok', cierre.ok, cierre.mensaje)
    const cierre2 = await cerrarConteo(conteoId, sesion, '')
    check('cerrar dos veces rebota', !cierre2.ok, cierre2.mensaje)
    const lista = await listarConteos()
    const enLista = lista.find((c) => c.conteoId === conteoId)
    check('observacion guardada al cerrar', enLista?.observacion === 'observacion de cierre e2e')
    check('estado = revision', enLista?.estado === 'revision')

    // --- 5) reabrir y volver a cerrar
    const reabierto = await reabrirConteo(conteoId, sesion)
    check('reabrirConteo ok', reabierto.ok, reabierto.mensaje)
    await cerrarConteo(conteoId, sesion, 'observacion de cierre e2e')

    // --- 6) aplicar de verdad
    const aplicado = await aplicarConteo(conteoId, sesion)
    check('aplicarConteo ok', aplicado.ok, aplicado.mensaje)
    ajusteId = aplicado.ajusteId
    check('devuelve ajusteId', typeof ajusteId === 'number' && ajusteId > 0)

    const despues = await leerStock()
    check(
      'stock movido exactamente el delta (+3)',
      Math.abs(despues.stock - (antes.stock + 3)) < 0.0001,
      `antes=${antes.stock} despues=${despues.stock}`
    )

    const det = await pool
      .request()
      .input('a', sql.Int, ajusteId ?? 0)
      .query('SELECT Cantidad, CantidadFinal, ProductoID FROM DetallesAjustes WHERE AjusteID = @a')
    check('un detalle de ajuste', det.recordset.length === 1)
    check('Cantidad = delta', Math.abs(det.recordset[0]?.Cantidad - 3) < 0.0001)
    check('CantidadFinal = contado', Math.abs(det.recordset[0]?.CantidadFinal - contado) < 0.0001)

    const cab = await pool
      .request()
      .input('a', sql.Int, ajusteId ?? 0)
      .query('SELECT Observacion, AlmacenID FROM Ajustes WHERE AjusteID = @a')
    check('cabecera de ajuste creada', cab.recordset.length === 1)
    check(
      'observacion referencia el conteo',
      cab.recordset[0]?.Observacion === `Conteo KDS #${conteoId}`,
      cab.recordset[0]?.Observacion
    )
    check('ajuste en el almacen correcto', cab.recordset[0]?.AlmacenID === almacenId)

    const logg = await pool
      .request()
      .input('a', sql.Int, ajusteId ?? 0)
      .query(
        `SELECT COUNT(*) AS n FROM Logg WHERE Formulario = 'KDS Inventario' AND Accion LIKE '%ajuste ' + CAST(@a AS varchar) + '%'`
      )
    check('bitacora Logg escrita', logg.recordset[0].n === 1)

    // --- 7) doble aplicacion: rebota y no mueve nada
    const reaplicado = await aplicarConteo(conteoId, sesion)
    check('doble aplicacion rebota', !reaplicado.ok, reaplicado.mensaje)
    const trasReaplicar = await leerStock()
    check('stock intacto tras el rebote', trasReaplicar.stock === despues.stock)
    const ajustesTotales = await pool
      .request()
      .input('c', sql.VarChar, `Conteo KDS #${conteoId}`)
      .query('SELECT COUNT(*) AS n FROM Ajustes WHERE Observacion = @c')
    check('un solo ajuste para el conteo', ajustesTotales.recordset[0].n === 1)

    // --- 8) anular un conteo ya aplicado no debe poder
    const anulado = await anularConteo(conteoId, sesion)
    check('anular un aplicado rebota', !anulado.ok, anulado.mensaje)
  } finally {
    // --- limpieza: dejar la BD como estaba
    console.log('--- limpieza ---')
    if (ajusteId) {
      await pool
        .request()
        .input('a', sql.Int, ajusteId)
        .query('DELETE FROM DetallesAjustes WHERE AjusteID = @a; DELETE FROM Ajustes WHERE AjusteID = @a')
      await pool
        .request()
        .input('a', sql.Int, ajusteId)
        .query(
          `DELETE FROM Logg WHERE Formulario = 'KDS Inventario' AND Accion LIKE '%ajuste ' + CAST(@a AS varchar) + '%'`
        )
      console.log(`ajuste ${ajusteId} y su bitacora borrados`)
    }
    if (conteoCopia) {
      await pool
        .request()
        .input('c', sql.Int, conteoCopia)
        .query('DELETE FROM KDS_ConteoDetalles WHERE ConteoID = @c; DELETE FROM KDS_Conteos WHERE ConteoID = @c')
      console.log(`conteo copia ${conteoCopia} borrado`)
    }
    if (conteoId) {
      await pool
        .request()
        .input('c', sql.Int, conteoId)
        .query('DELETE FROM KDS_ConteoDetalles WHERE ConteoID = @c; DELETE FROM KDS_Conteos WHERE ConteoID = @c')
      console.log(`conteo ${conteoId} borrado`)
    }
    await pool
      .request()
      .input('id', sql.Int, productos.length > 0 ? productos[0].productoId : 0)
      .input('stock', sql.Float, antes.stock)
      .query(`UPDATE Productos SET ${colStock} = @stock WHERE ID = @id`)
    const restaurado = await leerStock()
    check('stock restaurado al valor previo', restaurado.stock === antes.stock)
    await pool.close()
  }

  if (fallas > 0) {
    console.error(`${fallas} fallas`)
    process.exit(1)
  }
  console.log('e2e OK')
}

main().catch((e) => {
  console.error('FATAL', (e as Error).message)
  process.exit(1)
})
