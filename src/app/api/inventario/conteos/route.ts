import { NextResponse } from 'next/server'
import { autenticar } from '@/actions/inventario/authRoute'
import {
  copiarDetalles,
  crearConteo,
  getCabecera,
  listarConteos
} from '@/actions/inventario/conteos'
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
    const { pin, almacenId, noVendibles, copiarDe } = await request.json()
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
    // Copiar de un conteo anterior: solo del mismo almacen y del mismo tipo, si
    // no se mezclarian catalogos distintos (vendibles vs no vendibles).
    let origen = null
    if (copiarDe !== undefined && copiarDe !== null) {
      if (!Number.isInteger(copiarDe) || copiarDe <= 0) {
        return NextResponse.json({ error: 'copiarDe inválido' }, { status: 400 })
      }
      origen = await getCabecera(copiarDe)
      if (!origen) {
        return NextResponse.json({ error: 'El conteo a copiar no existe' }, { status: 404 })
      }
      if (origen.almacenId !== almacenId || origen.noVendibles !== (noVendibles === true)) {
        return NextResponse.json(
          { error: 'Solo se puede copiar un conteo del mismo almacén y tipo' },
          { status: 409 }
        )
      }
    }

    const conteoId = await crearConteo(almacenId, noVendibles === true, auth.sesion.meseroId)
    const copiados = origen ? await copiarDetalles(copiarDe, conteoId, almacenId) : 0
    return NextResponse.json({ conteoId, copiados }, { status: 201 })
  } catch (error) {
    console.error('Error al crear conteo:', error)
    return NextResponse.json({ error: 'Error al crear el conteo' }, { status: 500 })
  }
}
