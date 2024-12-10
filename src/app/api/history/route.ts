import { getHistoryDb } from "@/actions/getHistory";
import { Orden, OrdenDb } from "@/interfaces/Orden";
import { processOrders } from "@/utils/processOrders";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const equipo = searchParams.get("equipo") ?? "";
    const ordenesDb: OrdenDb[] = await getHistoryDb(equipo);

    const ordenes: Orden[] = processOrders(ordenesDb);

    return NextResponse.json(ordenes, { status: 200 });
  } catch (error) {
    console.error("Error al obtener las ordenes:", error);
    return NextResponse.json(
      { error: "Error al obtener las ordenes" },
      { status: 500 }
    );
  }
}
