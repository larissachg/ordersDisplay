// Roles hardcodeados del modulo de inventario (spec 2026-08-30, seccion 5).
// TipoUsuarioID viene de Meseros.TipoUsuarioID del POS (enum en ctlMeseros.vb).
export const TIPO_USUARIO = {
  administrador: 1,
  cajero: 3,
  supervisor: 7,
  almacenero: 8,
  contador: 13
} as const

const ROLES_CONTAR = [1, 7, 8]
const ROLES_SUPERVISAR = [1, 7]

export const puedeContar = (tipo: number) => ROLES_CONTAR.includes(tipo)
export const puedeVerDiferencias = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
export const puedeAplicar = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
export const puedeReabrir = (tipo: number) => ROLES_SUPERVISAR.includes(tipo)
// Anular: supervisores siempre; el dueño solo mientras el conteo esta abierto.
export const puedeAnular = (tipo: number, esDueno: boolean, estado: string) =>
  ROLES_SUPERVISAR.includes(tipo) || (esDueno && estado === 'abierto')

// Marcador que /config guarda en localStorage.equipo para que la pantalla
// principal abra directo el modulo de inventario (hermano de 'estacion:<id>').
export const EQUIPO_INVENTARIO = 'inventario'

export const ESTADOS_CONTEO = ['abierto', 'revision', 'aplicado', 'anulado'] as const
export type EstadoConteo = (typeof ESTADOS_CONTEO)[number]
