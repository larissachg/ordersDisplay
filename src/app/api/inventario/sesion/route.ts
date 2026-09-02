import { NextResponse } from 'next/server'
import { validarPin } from '@/actions/inventario/validarPin'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'

export async function POST(request: Request) {
  try {
    const { pin } = await request.json()
    if (typeof pin !== 'string') {
      return NextResponse.json({ error: 'pin es requerido' }, { status: 400 })
    }
    const sesion = await validarPin(pin)
    if (!sesion) {
      return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 })
    }
    if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso para inventario' }, { status: 403 })
    }
    return NextResponse.json(sesion, { status: 200 })
  } catch (error) {
    console.error('Error en sesion de inventario:', error)
    return NextResponse.json({ error: 'Error al validar la sesión' }, { status: 500 })
  }
}
