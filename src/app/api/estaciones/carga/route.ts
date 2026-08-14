import { NextResponse } from 'next/server'
import { getCargaEstacionDb } from '@/actions/getCocina'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const estacionId = parseInt(searchParams.get('estacion') ?? '', 10)
    if (!Number.isFinite(estacionId) || estacionId <= 0) {
      return NextResponse.json({ error: 'estacion es requerida' }, { status: 400 })
    }
    const carga = await getCargaEstacionDb(estacionId)
    return NextResponse.json(carga, { status: 200 })
  } catch (error) {
    console.error('Error al obtener la carga de la estacion:', error)
    return NextResponse.json(
      { error: 'Error al obtener la carga de la estacion' },
      { status: 500 }
    )
  }
}
