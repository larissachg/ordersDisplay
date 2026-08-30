// Modulo de inventario (conteo y ajuste). Spec:
// docs/superpowers/specs/2026-08-30-kds-inventario-conteo-design.md
import { EstadoConteo } from '@/contants/inventario'

export interface SesionInventario {
  meseroId: number
  nombre: string
  tipoUsuarioId: number
}

export interface AlmacenInventario {
  almacenId: number
  nombre: string
}

export interface ProductoContable {
  productoId: number
  nombre: string
  codigo: string // Productos.Codigo = codigo de barras; puede ser ''
  presentacion: string
  unidad: string // Productos.UnidadContenido; '' si no tiene
  tipoProducto: string // TiposProductos.Descripcion para agrupar
}

export interface ConteoResumen {
  conteoId: number
  almacenId: number
  almacenNombre: string
  noVendibles: boolean
  estado: EstadoConteo
  meseroId: number
  meseroNombre: string
  observacion: string
  fechaCreacion: string
  fechaAplicacion: string | null
  ajusteId: number | null
  contados: number // filas en KDS_ConteoDetalles
}

// Fila cruda de KDS_ConteoDetalles + joins (sufijo Db, patron OrdenDb).
export interface ConteoDetalleDb {
  productoId: number
  nombre: string
  unidad: string
  tipoProducto: string
  cantidadContada: number
  stockSnapshot: number // solo llega si el rol ve diferencias
  stockVivo: number // idem
  costo: number // idem
  observacion: string
  fechaConteo: string
}

export interface ConteoCompleto {
  conteo: ConteoResumen
  detalles: ConteoDetalleDb[]
  // true cuando el payload trae stockSnapshot/stockVivo/costo reales
  conDiferencias: boolean
}

export interface FilaRevision extends ConteoDetalleDb {
  delta: number // cantidadContada - stockSnapshot, redondeado a 3
  deriva: boolean // stockVivo !== stockSnapshot
  valor: number // delta * costo, redondeado a 2
}

export interface ResumenRevision {
  filas: FilaRevision[]
  sobrante: number // suma de valor > 0
  faltante: number // suma de valor < 0 (negativo)
  neto: number
}

export interface ResultadoAplicar {
  ok: boolean
  ajusteId: number | null
  mensaje: string
}
