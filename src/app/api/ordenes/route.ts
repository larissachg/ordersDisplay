import { NextResponse } from "next/server";
import { getOrdenesDb } from "@/actions/getOrdenes";
import { Orden, OrdenDb, Producto, ProductoCombo } from "@/interfaces/Orden";
import { actualizarOrden } from "@/actions/actualizarOrden";

// Handler para manejar solicitudes GET
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const equipo = searchParams.get("equipo") ?? "";
    const ordenesDb: OrdenDb[] = await getOrdenesDb(equipo);

    const ordenes: Orden[] = [];

    for (const ordenDb of ordenesDb) {
      if (
        !ordenes.find(
          (orden) => orden.id === ordenDb.id && orden.orden === ordenDb.orden
        )
      ) {
        const productosFiltrados = ordenesDb.filter(
          (orden) => orden.id === ordenDb.id
        );
        const productos: Producto[] = productosFiltrados.map((producto) => {
          const combosExtraidos: string[] | undefined =
            producto.productosCombo?.split(",");
          const combos: ProductoCombo[] = [];
          if (combosExtraidos) {
            for (const combo of combosExtraidos) {
              const posicion = combos.find((c) => c.descripcion === combo);
              if (posicion) {
                posicion.cantidad++;
              } else {
                combos.push({ descripcion: combo, cantidad: 1 });
              }
            }
          }

          return {
            producto: producto.producto,
            cantidad: producto.cantidad,
            borrada: producto.borrada,
            observacion: producto.observacion,
            combos: combos,
          };
        });

        ordenes.push({
          id: ordenDb.id,
          mesa: ordenDb.mesa,
          mesero: ordenDb.mesero,
          tipoEnvio: ordenDb.tipoEnvio,
          paraLlevar: ordenDb.paraLlevar,
          orden: ordenDb.orden,
          hora: ordenDb.hora,
          productos: productos,
        });
      }
    }

    return NextResponse.json(ordenes, { status: 200 });
  } catch (error) {
    console.error("Error al obtener las ordenes:", error);
    return NextResponse.json(
      { error: "Error al obtener las ordenes" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { idOrden, idVisita, terminado } = body;

    if (!idOrden || !idVisita || terminado === undefined) {
      return NextResponse.json(
        { error: "Orden y Visita son requeridos" },
        { status: 400 }
      );
    }
    const result = await actualizarOrden({ idVisita, idOrden, terminado });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error al crear el equipo:", error);
    return NextResponse.json(
      { error: "Error al crear el equipo" },
      { status: 500 }
    );
  }
}
