import { NextResponse } from 'next/server'
import { getEstacionesDb } from '@/actions/getCocina'

// Lista de estaciones activas para /config. [] si el POS no tiene el modulo.
export async function GET() {
  const estaciones = await getEstacionesDb()
  return NextResponse.json(estaciones, { status: 200 })
}
