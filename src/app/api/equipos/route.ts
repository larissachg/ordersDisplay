import { NextResponse } from 'next/server';
import { getEquiposDb } from '@/actions/getEquipos';

// Handler para manejar solicitudes GET
export async function GET() {
  try {
    const equipos = await getEquiposDb();
    return NextResponse.json(equipos, { status: 200 });
  } catch (error) {
    console.error('Error al obtener los equipos:', error);
    return NextResponse.json(
      { error: 'Error al obtener los equipos' },
      { status: 500 }
    );
  }
}
