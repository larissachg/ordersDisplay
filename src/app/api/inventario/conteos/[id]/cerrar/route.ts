import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { cerrarConteo } from '@/actions/inventario/transiciones'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin, observacion } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    const resultado = await cerrarConteo(
      conteoId,
      auth.sesion,
      typeof observacion === 'string' ? observacion : ''
    )
    if (!resultado.ok) return NextResponse.json({ error: resultado.mensaje }, { status: 409 })
    return NextResponse.json({ message: resultado.mensaje }, { status: 200 })
  } catch (error) {
    console.error('Error al cerrar conteo:', error)
    return NextResponse.json({ error: 'Error al cerrar el conteo' }, { status: 500 })
  }
}
