import { NextResponse } from 'next/server'
import { getOrdenesDb } from '@/actions/getOrdenes'
import { Orden, OrdenDb } from '@/interfaces/Orden'
import { actualizarOrden } from '@/actions/actualizarOrden'
import { processOrders } from '@/utils/processOrders'

// Handler para manejar solicitudes GET
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const equipo = searchParams.get('equipo') ?? ''
    const ordenesDb: OrdenDb[] = await getOrdenesDb(equipo)

    const ordenes: Orden[] = processOrders(ordenesDb)

    return NextResponse.json(ordenes, { status: 200 })
  } catch (error) {
    console.error('Error al obtener las ordenes:', error)
    return NextResponse.json(
      { error: 'Error al obtener las ordenes' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { idOrden, idVisita, terminado, nombreEquipo } = body

    if (!idOrden || !idVisita || terminado === undefined) {
      return NextResponse.json(
        { error: 'Orden y Visita son requeridos' },
        { status: 400 }
      )
    }
    const result = await actualizarOrden({
      idVisita,
      idOrden,
      terminado,
      nombreEquipo
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error al crear el equipo:', error)
    return NextResponse.json(
      { error: 'Error al crear el equipo' },
      { status: 500 }
    )
  }
}
