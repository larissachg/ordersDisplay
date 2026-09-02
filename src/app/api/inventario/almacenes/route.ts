import { NextResponse } from 'next/server'
import { validarPin } from '@/actions/inventario/validarPin'
import { getAlmacenes } from '@/actions/inventario/getAlmacenes'
import { puedeContar, puedeVerDiferencias } from '@/contants/inventario'

export async function GET(request: Request) {
  try {
    const sesion = await validarPin(request.headers.get('x-kds-pin') ?? '')
    if (!sesion) return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 })
    if (!puedeContar(sesion.tipoUsuarioId) && !puedeVerDiferencias(sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const almacenes = await getAlmacenes(sesion.meseroId)
    return NextResponse.json(almacenes, { status: 200 })
  } catch (error) {
    console.error('Error al obtener almacenes:', error)
    return NextResponse.json({ error: 'Error al obtener almacenes' }, { status: 500 })
  }
}
