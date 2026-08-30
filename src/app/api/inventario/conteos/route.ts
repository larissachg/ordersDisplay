import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { crearConteo, listarConteos } from '@/actions/inventario/conteos'
import { getAlmacenes } from '@/actions/inventario/getAlmacenes'
import { puedeContar } from '@/contants/inventario'

export async function GET(request: Request) {
  try {
    const auth = await autenticar(request.headers.get('x-kds-pin'))
    if ('error' in auth) return auth.error
    return NextResponse.json(await listarConteos(), { status: 200 })
  } catch (error) {
    console.error('Error al listar conteos:', error)
    return NextResponse.json({ error: 'Error al listar conteos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { pin, almacenId, noVendibles, observacion } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    if (!puedeContar(auth.sesion.tipoUsuarioId)) {
      return NextResponse.json({ error: 'Sin permiso para crear conteos' }, { status: 403 })
    }
    if (!Number.isInteger(almacenId) || almacenId <= 0) {
      return NextResponse.json({ error: 'almacenId es requerido' }, { status: 400 })
    }
    // El almacen debe ser visible para este usuario (regla ResponsableID).
    const visibles = await getAlmacenes(auth.sesion.meseroId)
    if (!visibles.some((a) => a.almacenId === almacenId)) {
      return NextResponse.json({ error: 'Almacén no disponible' }, { status: 403 })
    }
    const conteoId = await crearConteo(
      almacenId,
      noVendibles === true,
      typeof observacion === 'string' ? observacion : '',
      auth.sesion.meseroId
    )
    return NextResponse.json({ conteoId }, { status: 201 })
  } catch (error) {
    console.error('Error al crear conteo:', error)
    return NextResponse.json({ error: 'Error al crear el conteo' }, { status: 500 })
  }
}
