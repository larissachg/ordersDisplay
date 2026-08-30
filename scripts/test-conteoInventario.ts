// Sanidad de derivarRevision. Correr con: npx -y tsx scripts/test-conteoInventario.ts
// No hay test runner en el repo; este script cubre la unica pieza algoritmica del modulo.
import { derivarRevision } from '../src/utils/conteoInventario'
import { ConteoDetalleDb } from '../src/interfaces/Inventario'

let fallas = 0
const check = (nombre: string, cond: boolean) => {
  if (!cond) {
    fallas++
    console.error(`FALLA: ${nombre}`)
  } else console.log(`ok: ${nombre}`)
}

const base: Omit<
  ConteoDetalleDb,
  'productoId' | 'cantidadContada' | 'stockSnapshot' | 'stockVivo' | 'costo'
> = {
  nombre: 'x',
  unidad: 'und',
  tipoProducto: 'Bebidas',
  observacion: '',
  fechaConteo: '2026-08-30 18:20:00'
}

const detalles: ConteoDetalleDb[] = [
  // faltante: contado 24, sistema 27, costo 10 -> delta -3, valor -30
  { ...base, productoId: 1, cantidadContada: 24, stockSnapshot: 27, stockVivo: 27, costo: 10 },
  // sobrante con deriva: contado 35, snapshot 31, vivo 29 -> delta +4, deriva true
  { ...base, productoId: 2, cantidadContada: 35, stockSnapshot: 31, stockVivo: 29, costo: 5 },
  // sin diferencia: delta 0, valor 0
  { ...base, productoId: 3, cantidadContada: 18, stockSnapshot: 18, stockVivo: 18, costo: 7 },
  // decimales: 9 - 12.5 = -3.5, costo 2 -> -7
  { ...base, productoId: 4, cantidadContada: 9, stockSnapshot: 12.5, stockVivo: 12.5, costo: 2 }
]

const r = derivarRevision(detalles)
check('4 filas', r.filas.length === 4)
check('delta faltante', r.filas[0].delta === -3)
check('delta sobrante', r.filas[1].delta === 4)
check('deriva solo en fila 2', !r.filas[0].deriva && r.filas[1].deriva && !r.filas[2].deriva)
check('delta cero', r.filas[2].delta === 0 && r.filas[2].valor === 0)
check('delta decimal redondeado a 3', r.filas[3].delta === -3.5)
check('sobrante = +20', r.sobrante === 20)
check('faltante = -37', r.faltante === -37)
check('neto = -17', r.neto === -17)
// flotantes sucios: 0.3 - 0.1
const sucio = derivarRevision([
  { ...base, productoId: 5, cantidadContada: 0.3, stockSnapshot: 0.1, stockVivo: 0.1, costo: 1 }
])
check('redondeo flotante', sucio.filas[0].delta === 0.2)

if (fallas > 0) {
  console.error(`${fallas} fallas`)
  process.exit(1)
}
console.log('sanidad OK')
