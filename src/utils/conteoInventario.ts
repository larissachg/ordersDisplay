// Logica pura de revision de conteos: sin BD, sin fetch. Spec seccion 7.
// Import relativo a proposito: el script de sanidad corre con npx tsx fuera de Next.
import { ConteoDetalleDb, FilaRevision, ResumenRevision } from '../interfaces/Inventario'

// Mismo redondeo que usa el POS en sus reportes de ajuste (ROUND(...,3)).
const redondear3 = (n: number) => Math.round(n * 1000) / 1000
const redondear2 = (n: number) => Math.round(n * 100) / 100

export function derivarRevision(detalles: ConteoDetalleDb[]): ResumenRevision {
  const filas: FilaRevision[] = detalles.map((d) => {
    const delta = redondear3(d.cantidadContada - d.stockSnapshot)
    return {
      ...d,
      delta,
      deriva: d.stockVivo !== d.stockSnapshot,
      valor: redondear2(delta * d.costo)
    }
  })
  let sobrante = 0
  let faltante = 0
  for (const f of filas) {
    if (f.valor > 0) sobrante += f.valor
    else faltante += f.valor
  }
  sobrante = redondear2(sobrante)
  faltante = redondear2(faltante)
  return { filas, sobrante, faltante, neto: redondear2(sobrante + faltante) }
}
