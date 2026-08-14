// Sanidad de derivarCortes. Correr con: npx -y tsx scripts/test-derivarCortes.ts
// No hay test runner en el repo; node:assert alcanza para la unica pieza algoritmica.
import assert from 'node:assert/strict'
import { derivarCortes } from '../src/utils/derivarCortes'
import { EstacionCapacidad, OrdenCarga } from '../src/interfaces/Cocina'

const PLANCHA = 1
const FRITURA = 2
const ARMADO = 3
const estaciones: EstacionCapacidad[] = [
  { estacionCocinaId: PLANCHA, capacidad: 25 },
  { estacionCocinaId: FRITURA, capacidad: 20 },
  { estacionCocinaId: ARMADO, capacidad: 0 }
]

const orden = (
  visitaId: number,
  hora: string,
  ocupacion: Record<number, number>
): OrdenCarga => ({
  visitaId,
  orden: 1,
  horaEfectiva: `2026-08-14T${hora}:00.000Z`,
  ocupacionPorEstacion: ocupacion
})

// 1. Dos ordenes llenan la plancha justo: un solo corte, etiqueta de la mas vieja.
{
  const cortes = derivarCortes(
    [orden(2, '12:05', { [PLANCHA]: 10 }), orden(1, '12:03', { [PLANCHA]: 15 })],
    estaciones
  )
  assert.equal(cortes.length, 1)
  assert.equal(cortes[0].horaEtiqueta, '12:03')
  assert.equal(cortes[0].ocupacionPorEstacion[PLANCHA], 25)
  assert.equal(cortes[0].excedido, false)
  assert.deepEqual(cortes[0].ordenes[0], { visitaId: 1, orden: 1 })
}

// 2. La tercera no cabe: abre el segundo corte con su propia hora.
{
  const cortes = derivarCortes(
    [
      orden(1, '12:03', { [PLANCHA]: 15 }),
      orden(2, '12:05', { [PLANCHA]: 10 }),
      orden(3, '12:10', { [PLANCHA]: 5 })
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.equal(cortes[1].horaEtiqueta, '12:10')
  assert.equal(cortes[1].ocupacionPorEstacion[PLANCHA], 5)
}

// 3. Capacidad 0 nunca limita.
{
  const cortes = derivarCortes(
    [orden(1, '12:00', { [ARMADO]: 500 }), orden(2, '12:01', { [ARMADO]: 500 })],
    estaciones
  )
  assert.equal(cortes.length, 1)
}

// 4. Orden sin configuracion de cocina: no ocupa ni abre cortes.
{
  const cortes = derivarCortes([orden(1, '12:00', {})], estaciones)
  assert.equal(cortes.length, 0)
}

// 5. Sobredimensionada: corte propio marcado excedido.
{
  const cortes = derivarCortes(
    [orden(1, '12:00', { [PLANCHA]: 10 }), orden(2, '12:01', { [PLANCHA]: 30 })],
    estaciones
  )
  assert.equal(cortes.length, 2)
  assert.equal(cortes[0].excedido, false)
  assert.equal(cortes[1].excedido, true)
}

// 6. Multi-estacion: no cabe si excede en UNA sola de sus estaciones.
{
  const cortes = derivarCortes(
    [
      orden(1, '12:00', { [PLANCHA]: 5, [FRITURA]: 10 }),
      orden(2, '12:01', { [PLANCHA]: 10, [FRITURA]: 15 }) // Plancha cabria, Fritura no
    ],
    estaciones
  )
  assert.equal(cortes.length, 2)
}

// 7. Desempate estable a hora igual: por visitaId.
{
  const cortes = derivarCortes(
    [orden(9, '12:00', { [PLANCHA]: 20 }), orden(1, '12:00', { [PLANCHA]: 20 })],
    estaciones
  )
  assert.deepEqual(cortes[0].ordenes[0], { visitaId: 1, orden: 1 })
  assert.equal(cortes.length, 2)
}

console.log('derivarCortes: 7/7 casos OK')
