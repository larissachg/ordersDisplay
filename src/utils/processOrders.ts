import { Orden, OrdenDb, Producto, ProductoCombo } from "@/interfaces/Orden";

export const processOrders = (ordenesDb: OrdenDb[]): Orden[] => {
  const ordenes: Orden[] = [];
  for (const ordenDb of ordenesDb) {
    if (
      !ordenes.find(
        (orden) => orden.id === ordenDb.id && orden.orden === ordenDb.orden
      )
    ) {
      const productosFiltrados = ordenesDb.filter(
        (orden) => orden.id === ordenDb.id && orden.orden === ordenDb.orden
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
          detalleCuentaId: producto.detalleCuentaId,
          terminado: producto.terminado ?? null,
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
        newOrder: ordenDb.newOrder,
        resaltado: ordenDb.resaltado ?? false,
        snoozed: ordenDb.snoozed ?? false,
      });
    }
  }

  return ordenes;
};
