import { NextResponse } from 'next/server'
import { validarPin } from './validarPin'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'
import { SesionInventario } from '@/interfaces/Inventario'

// Autentica una ruta del modulo: PIN por header (GET) o por body (mutaciones).
export async function autenticar(
  pin: string | null | undefined
): Promise<{ sesion: SesionInventario } | { error: NextResponse }> {
  if (typeof pin !== 'string' || pin.length === 0) {
    return { error: NextResponse.json({ error: 'pin es requerido' }, { status: 400 }) }
  }
  const sesion = await validarPin(pin)
  if (!sesion) {
    return { error: NextResponse.json({ error: 'Código incorrecto' }, { status: 401 }) }
  }
  if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
    return { error: NextResponse.json({ error: 'Sin permiso para inventario' }, { status: 403 }) }
  }
  return { sesion }
}
