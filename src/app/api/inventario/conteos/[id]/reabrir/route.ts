import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { reabrirConteo } from '@/actions/inventario/transiciones'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const { pin } = await request.json()
    const auth = await autenticar(pin)
    if ('error' in auth) return auth.error
    const resultado = await reabrirConteo(conteoId, auth.sesion)
    if (!resultado.ok) return NextResponse.json({ error: resultado.mensaje }, { status: 409 })
    return NextResponse.json({ message: resultado.mensaje }, { status: 200 })
  } catch (error) {
    console.error('Error al reabrir conteo:', error)
    return NextResponse.json({ error: 'Error al reabrir el conteo' }, { status: 500 })
  }
}
