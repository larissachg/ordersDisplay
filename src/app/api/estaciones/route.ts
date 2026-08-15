import { NextResponse } from 'next/server'
import { getEstacionesDb } from '@/actions/getCocina'

// Lista de estaciones activas para /config. [] si el POS no tiene el modulo.
export async function GET() {
  try {
    const estaciones = await getEstacionesDb()
    return NextResponse.json(estaciones, { status: 200 })
  } catch (error) {
    console.error('Error al obtener las estaciones:', error)
    return NextResponse.json(
      { error: 'Error al obtener las estaciones' },
      { status: 500 }
    )
  }
}
