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

// Carga total de una orden pendiente, por estacion. resaltado = actua de separador.
export interface OrdenCarga {
  visitaId: number
  orden: number
  horaEfectiva: string // ISO; wall clock La_Paz, mismo convenio que 'hora' en Orden
  resaltado: boolean
  ocupacionPorEstacion: Record<number, number>
}

export interface Corte {
  horaEtiqueta: string // 'HH:mm' del pedido mas viejo del corte
  horaInicio: string // ISO del pedido mas viejo (para el timer)
  ordenes: { visitaId: number; orden: number }[]
  ocupacionPorEstacion: Record<number, number>
  excedido: boolean // la carga supera la capacidad de alguna estacion (advertencia)
}

// Resultado de derivar: cortes cerrados por pintado + lo que aun no fue cortado.
export interface DerivacionCortes {
  cortes: Corte[]
  enEspera: Corte | null
}

export interface ItemCorteEstacion {
  nombre: string
  cantidad: number
  observacion?: string | null // solo en items de pedido; el agregado no la lleva
  desglose?: { nombre: string; cantidad: number }[] // opcionales del combo (vista armado)
}

// Un pedido dentro de la seccion de un corte, con lo relevante a la estacion.
export interface PedidoEstacion {
  visitaId: number
  orden: number
  tipoEnvio: string | null // colorea el numero de pedido igual que la principal
  items: ItemCorteEstacion[]
}

export interface CorteEstacion {
  horaEtiqueta: string
  horaInicio: string
  items: ItemCorteEstacion[] // agregado del corte (suma de sus pedidos)
  pedidos: PedidoEstacion[]
}

export interface CargaEstacionResponse {
  estacion: { nombre: string; mostrarProductos: boolean } | null
  cortes: CorteEstacion[]
  enEspera: CorteEstacion | null // pendientes despues del ultimo corte cerrado
}

export interface ResumenEstacionPintado {
  nombre: string
  unidades: number
  ocupacion: number
  capacidad: number // 0 = ilimitada
}

export interface ResumenPintado {
  generaTrabajo: boolean
  cantidadOrdenes: number // ordenes que integran el corte recien cerrado
  excedido: boolean
  horaEtiqueta: string
  estaciones: ResumenEstacionPintado[]
}
