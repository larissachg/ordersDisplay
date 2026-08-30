import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import { getConteo, getProductosContables } from '@/actions/inventario/conteos'
import { contarProductosContables } from '@/actions/inventario/getProductosContables'
import { puedeVerDiferencias } from '@/contants/inventario'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const conteoId = parseInt(id, 10)
    if (!Number.isInteger(conteoId) || conteoId <= 0) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const auth = await autenticar(request.headers.get('x-kds-pin'))
    if ('error' in auth) return auth.error
    const conDiferencias = puedeVerDiferencias(auth.sesion.tipoUsuarioId)
    const conteo = await getConteo(conteoId, conDiferencias)
    if (!conteo) return NextResponse.json({ error: 'Conteo inexistente' }, { status: 404 })
    // La lista completa de productos contables solo hace falta durante la captura.
    // El stock del sistema solo viaja para los roles que pueden verlo; para el
    // resto la captura sigue siendo ciega.
    const productos =
      conteo.conteo.estado === 'abierto'
        ? await getProductosContables(
            conteo.conteo.noVendibles,
            conDiferencias ? conteo.conteo.almacenId : null
          )
        : []
    // Total del catalogo siempre: en revision es el unico modo de saber cuantos
    // productos quedaron sin capturar antes de aplicar.
    const totalContables =
      productos.length > 0
        ? productos.length
        : await contarProductosContables(conteo.conteo.noVendibles)
    return NextResponse.json({ ...conteo, productos, totalContables }, { status: 200 })
  } catch (error) {
    console.error('Error al obtener conteo:', error)
    return NextResponse.json({ error: 'Error al obtener el conteo' }, { status: 500 })
  }
}
