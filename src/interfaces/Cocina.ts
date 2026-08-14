// Tipos del modulo de estaciones de cocina y cortes derivados.
// Spec: docs/superpowers/specs/2026-08-14-kds-estaciones-cortes-design.md

export interface Estacion {
  estacionCocinaId: number
  nombre: string
  capacidad: number // 0 = ilimitada
  orden: number
  mostrarProductos: boolean
}

export interface EstacionCapacidad {
  estacionCocinaId: number
  capacidad: number // 0 = ilimitada
}

// Carga total de una orden pintada pendiente, por estacion.
export interface OrdenCarga {
  visitaId: number
  orden: number
  horaEfectiva: string // ISO; wall clock La_Paz, mismo convenio que 'hora' en Orden
  ocupacionPorEstacion: Record<number, number>
}

export interface Corte {
  horaEtiqueta: string // 'HH:mm' del pedido mas viejo del corte
  horaInicio: string // ISO del pedido mas viejo (para el timer)
  ordenes: { visitaId: number; orden: number }[]
  ocupacionPorEstacion: Record<number, number>
  excedido: boolean // una orden sobredimensionada supero la capacidad
}

export interface ItemCorteEstacion {
  nombre: string
  cantidad: number
}

export interface CorteEstacion {
  horaEtiqueta: string
  horaInicio: string
  items: ItemCorteEstacion[]
}

export interface CargaEstacionResponse {
  estacion: { nombre: string; mostrarProductos: boolean } | null
  cortes: CorteEstacion[]
}

export interface ResumenEstacionPintado {
  nombre: string
  unidades: number
  ocupacion: number
  capacidad: number // 0 = ilimitada
}

export interface ResumenPintado {
  generaTrabajo: boolean
  abreCorteNuevo: boolean
  excedido: boolean
  horaEtiqueta: string
  estaciones: ResumenEstacionPintado[]
}
