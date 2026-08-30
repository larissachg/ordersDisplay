import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { upsertDetalle } from '@/actions/inventario/conteos'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin, productoId, cantidad, observacion } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    if (!Number.isInteger(productoId) || productoId <= 0 || typeof cantidad !== 'number') {
      return NextResponse.json({ error: 'productoId y cantidad son requeridos' }, { status: 400 })
    }
    const resultado = await upsertDetalle(
      conteoId,
      productoId,
      cantidad,
      typeof observacion === 'string' ? observacion : '',
      auth.sesion.meseroId
    )
    if (resultado !== 'ok') return NextResponse.json({ error: resultado }, { status: 409 })
    return NextResponse.json({ message: 'Captura guardada' }, { status: 200 })
  } catch (error) {
    console.error('Error al guardar captura:', error)
    return NextResponse.json({ error: 'Error al guardar la captura' }, { status: 500 })
  }
}
