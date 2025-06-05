import { NextResponse } from 'next/server'
import { getOrdenesDb } from '@/actions/getOrdenes'
import { Orden, OrdenDb } from '@/interfaces/Orden'
import { actualizarOrden } from '@/actions/actualizarOrden'
import { processOrders } from '@/utils/processOrders'
import { snoozeOrder } from '@/actions/snooze'
import { unsnoozeOrder } from '@/actions/unsnooze'

// Handler para manejar solicitudes GET
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const equipo = searchParams.get('equipo') ?? ''
    const limit = searchParams.get("limit") ?? 9;

    const ordenesDb: OrdenDb[] = await getOrdenesDb(equipo, +limit)

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
    const { detalleCuentaId, idVisita, idOrden, terminado, nombreEquipo } = body;

    if (detalleCuentaId !== undefined) {
      if (terminado === undefined) {
        return NextResponse.json(
          { error: 'detalleCuentaId y terminado son requeridos' },
          { status: 400 }
        );
      }

      const result = await actualizarOrden({
        detalleCuentaId,
        terminado,
        nombreEquipo,
      });

      return NextResponse.json(result, { status: 201 });
    }


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


export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { visitaId, orden } = body

    if (!visitaId || !orden) {
      return NextResponse.json(
        { error: 'visitaId y orden son requeridos' },
        { status: 400 }
      )
    }

    await snoozeOrder(visitaId, orden)
    return NextResponse.json({ message: 'Orden snoozeada exitosamente' }, { status: 201 })
  } catch (error) {
    console.error('Error al snooze la orden:', error)
    return NextResponse.json(
      { error: 'Error al snooze la orden' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const { visitaId, orden } = body

    if (!visitaId || !orden) {
      return NextResponse.json(
        { error: 'visitaId y orden son requeridos' },
        { status: 400 }
      )
    }

    await unsnoozeOrder(visitaId, orden)
    return NextResponse.json({ message: 'Orden unsnoozeada exitosamente' }, { status: 200 })
  } catch (error) {
    console.error('Error al unsnooze la orden:', error)
    return NextResponse.json(
      { error: 'Error al unsnooze la orden' },
      { status: 500 }
    )
  }
}