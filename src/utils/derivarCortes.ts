// Import relativo a proposito: el script de sanidad corre con npx tsx fuera de Next.
import { Corte, EstacionCapacidad, OrdenCarga } from '../interfaces/Cocina'

// Llenado greedy secuencial: cada orden pintada pendiente entra al corte en
// construccion si cabe entera en TODAS sus estaciones con capacidad; si no,
// abre el corte siguiente. Deterministico: mismo input, mismos cortes.
export function derivarCortes(
  ordenes: OrdenCarga[],
  estaciones: EstacionCapacidad[]
): Corte[] {
  const capacidades = new Map(
    estaciones.map((e) => [e.estacionCocinaId, e.capacidad])
  )

  const ordenadas = [...ordenes].sort((a, b) => {
    if (a.horaEfectiva !== b.horaEfectiva)
      return a.horaEfectiva < b.horaEfectiva ? -1 : 1
    if (a.visitaId !== b.visitaId) return a.visitaId - b.visitaId
    return a.orden - b.orden
  })

  const cortes: Corte[] = []
  let actual: Corte | null = null

  for (const ordenCarga of ordenadas) {
    const entradas = Object.entries(ordenCarga.ocupacionPorEstacion)
    if (entradas.length === 0) continue // sin configuracion de cocina

    const cabe =
      actual !== null &&
      entradas.every(([estacionId, ocupacion]) => {
        const capacidad = capacidades.get(Number(estacionId)) ?? 0
        if (capacidad === 0) return true
        const acumulada = actual!.ocupacionPorEstacion[Number(estacionId)] ?? 0
        return acumulada + ocupacion <= capacidad
      })

    if (!cabe) {
      actual = {
        horaEtiqueta: ordenCarga.horaEfectiva.substring(11, 16),
        horaInicio: ordenCarga.horaEfectiva,
        ordenes: [],
        ocupacionPorEstacion: {},
        excedido: false
      }
      cortes.push(actual)
    }

    actual!.ordenes.push({
      visitaId: ordenCarga.visitaId,
      orden: ordenCarga.orden
    })
    for (const [estacionId, ocupacion] of entradas) {
      const id = Number(estacionId)
      actual!.ocupacionPorEstacion[id] =
        (actual!.ocupacionPorEstacion[id] ?? 0) + ocupacion
    }
    actual!.excedido = Object.entries(actual!.ocupacionPorEstacion).some(
      ([estacionId, ocupacion]) => {
        const capacidad = capacidades.get(Number(estacionId)) ?? 0
        return capacidad > 0 && ocupacion > capacidad
      }
    )
  }

  return cortes
}
