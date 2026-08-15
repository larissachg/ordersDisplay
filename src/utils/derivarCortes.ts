// Import relativo a proposito: el script de sanidad corre con npx tsx fuera de Next.
import {
  Corte,
  DerivacionCortes,
  EstacionCapacidad,
  OrdenCarga
} from '../interfaces/Cocina'

// El pintado actua de separador: recorriendo las pendientes por hora, cada orden
// pintada cierra el corte que la incluye a ella y a las no pintadas anteriores.
// Lo posterior al ultimo separador queda "en espera". La capacidad no divide
// cortes; solo marca excedido como advertencia. Deterministico: mismo input,
// mismos cortes.
export function derivarCortes(
  ordenes: OrdenCarga[],
  estaciones: EstacionCapacidad[]
): DerivacionCortes {
  const capacidades = new Map(
    estaciones.map((e) => [e.estacionCocinaId, e.capacidad])
  )

  const ordenadas = [...ordenes].sort((a, b) => {
    if (a.horaEfectiva !== b.horaEfectiva)
      return a.horaEfectiva < b.horaEfectiva ? -1 : 1
    if (a.visitaId !== b.visitaId) return a.visitaId - b.visitaId
    return a.orden - b.orden
  })

  const marcarExcedido = (corte: Corte) => {
    corte.excedido = Object.entries(corte.ocupacionPorEstacion).some(
      ([estacionId, ocupacion]) => {
        const capacidad = capacidades.get(Number(estacionId)) ?? 0
        return capacidad > 0 && ocupacion > capacidad
      }
    )
  }

  const cortes: Corte[] = []
  let actual: Corte | null = null

  for (const ordenCarga of ordenadas) {
    if (actual === null) {
      actual = {
        horaEtiqueta: ordenCarga.horaEfectiva.substring(11, 16),
        horaInicio: ordenCarga.horaEfectiva,
        ordenes: [],
        ocupacionPorEstacion: {},
        excedido: false
      }
    }

    actual.ordenes.push({
      visitaId: ordenCarga.visitaId,
      orden: ordenCarga.orden
    })
    for (const [estacionId, ocupacion] of Object.entries(
      ordenCarga.ocupacionPorEstacion
    )) {
      const id = Number(estacionId)
      actual.ocupacionPorEstacion[id] =
        (actual.ocupacionPorEstacion[id] ?? 0) + ocupacion
    }

    if (ordenCarga.resaltado) {
      marcarExcedido(actual)
      cortes.push(actual)
      actual = null
    }
  }

  if (actual !== null) marcarExcedido(actual)
  return { cortes, enEspera: actual }
}
