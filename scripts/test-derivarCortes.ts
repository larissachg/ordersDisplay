// Sanidad de derivarCortes. Correr con: npx -y tsx scripts/test-derivarCortes.ts
// No hay test runner en el repo; node:assert alcanza para la unica pieza algoritmica.
// Semantica: el pintado actua de separador. Cada orden pintada cierra el corte que
// la incluye a ella y a las no pintadas anteriores; el resto queda "en espera".
import assert from 'node:assert/strict'
import { derivarCortes } from '../src/utils/derivarCortes'
import { EstacionCapacidad, OrdenCarga } from '../src/interfaces/Cocina'

const PLANCHA = 1
const FRITURA = 2
const ARMADO = 3
const estaciones: EstacionCapacidad[] = [
  { estacionCocinaId: PLANCHA, capacidad: 3 },
  { estacionCocinaId: FRITURA, capacidad: 20 },
  { estacionCocinaId: ARMADO, capacidad: 0 }
]

const orden = (
  visitaId: number,
  hora: string,
  ocupacion: Record<number, number>,
  resaltado = false
): OrdenCarga => ({
  visitaId,
  orden: 1,
  horaEfectiva: `2026-08-14T${hora}:00.000Z`,
  resaltado,
  ocupacionPorEstacion: ocupacion
})

// 1. Escenario base: 5 ordenes de 1 carne, pintadas la 3ra y la 5ta.
//    Corte 1 = {1,2,3} (3 carnes), corte 2 = {4,5} (2 carnes), nada en espera.
{
  const { cortes, enEspera } = derivarCortes(
    [
      orden(1, '12:01', { [PLANCHA]: 1 }),
      orden(2, '12:02', { [PLANCHA]: 1 }),
      orden(3, '12:03', { [PLANCHA]: 1 }, true),
      orden(4, '12:04', { [PLANCHA]: 1 }),
      orden(5, '12:05', { [PLANCHA]: 1 }, true)
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.deepEqual(
    cortes[0].ordenes.map((o) => o.visitaId),
    [1, 2, 3]
  )
  assert.equal(cortes[0].ocupacionPorEstacion[PLANCHA], 3)
  assert.equal(cortes[0].horaEtiqueta, '12:01')
  assert.equal(cortes[0].excedido, false)
  assert.deepEqual(
    cortes[1].ordenes.map((o) => o.visitaId),
    [4, 5]
  )
  assert.equal(cortes[1].ocupacionPorEstacion[PLANCHA], 2)
  assert.equal(cortes[1].horaEtiqueta, '12:04')
  assert.equal(enEspera, null)
}

// 2. Nada pintado: cero cortes, todo en espera.
{
  const { cortes, enEspera } = derivarCortes(
    [orden(1, '12:00', { [PLANCHA]: 1 }), orden(2, '12:01', { [PLANCHA]: 1 })],
    estaciones
  )
  assert.equal(cortes.length, 0)
  assert.equal(enEspera?.ordenes.length, 2)
  assert.equal(enEspera?.ocupacionPorEstacion[PLANCHA], 2)
  assert.equal(enEspera?.horaEtiqueta, '12:00')
}

// 3. La capacidad no divide: un solo corte marcado excedido (advertencia).
{
  const { cortes, enEspera } = derivarCortes(
    [
      orden(1, '12:00', { [PLANCHA]: 2 }),
      orden(2, '12:01', { [PLANCHA]: 2 }),
      orden(3, '12:02', { [PLANCHA]: 1 }, true)
    ],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.equal(cortes[0].ocupacionPorEstacion[PLANCHA], 5)
  assert.equal(cortes[0].excedido, true)
  assert.equal(enEspera, null)
}

// 4. Pintadas consecutivas en el medio: cortes {1,2}, {3}, espera {4}.
{
  const { cortes, enEspera } = derivarCortes(
    [
      orden(1, '12:00', { [PLANCHA]: 1 }),
      orden(2, '12:01', { [PLANCHA]: 1 }, true),
      orden(3, '12:02', { [PLANCHA]: 1 }, true),
      orden(4, '12:03', { [PLANCHA]: 1 })
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.deepEqual(cortes[0].ordenes.map((o) => o.visitaId), [1, 2])
  assert.deepEqual(cortes[1].ordenes.map((o) => o.visitaId), [3])
  assert.equal(cortes[1].horaEtiqueta, '12:02')
  assert.deepEqual(enEspera?.ordenes.map((o) => o.visitaId), [4])
}

// 5. Orden sin configuracion de cocina pintada: igual separa, sin sumar carga.
{
  const { cortes, enEspera } = derivarCortes(
    [orden(1, '12:00', { [PLANCHA]: 2 }), orden(2, '12:01', {}, true)],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.deepEqual(cortes[0].ordenes.map((o) => o.visitaId), [1, 2])
  assert.equal(cortes[0].ocupacionPorEstacion[PLANCHA], 2)
  assert.equal(enEspera, null)
}

// 6. Capacidad 0 (ilimitada) nunca marca excedido.
{
  const { cortes } = derivarCortes(
    [orden(1, '12:00', { [ARMADO]: 500 }, true)],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.equal(cortes[0].excedido, false)
}

// 7. Desempate estable a hora igual: por visitaId; el orden decide quien entra al corte.
{
  const { cortes, enEspera } = derivarCortes(
    [
      orden(9, '12:00', { [PLANCHA]: 1 }),
      orden(1, '12:00', { [PLANCHA]: 1 }, true)
    ],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.deepEqual(cortes[0].ordenes.map((o) => o.visitaId), [1])
  assert.deepEqual(enEspera?.ordenes.map((o) => o.visitaId), [9])
}

// 8. El grupo en espera tambien avisa si ya excede la capacidad.
{
  const { enEspera } = derivarCortes(
    [
      orden(1, '12:00', { [PLANCHA]: 2 }),
      orden(2, '12:01', { [PLANCHA]: 2 })
    ],
    estaciones
  )
  assert.equal(enEspera?.excedido, true)
}

console.log('derivarCortes: 8/8 casos OK')
