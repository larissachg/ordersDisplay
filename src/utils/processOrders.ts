import { Orden, OrdenDb, Producto, ProductoCombo } from "@/interfaces/Orden";

export const processOrders = (ordenesDb: OrdenDb[]): Orden[] => {
  // Una fila por producto: se agrupa por (id de visita, orden) en un solo paso.
  const ordenes = new Map<string, Orden>();

  for (const ordenDb of ordenesDb) {
    const key = `${ordenDb.id}|${ordenDb.orden}`;
    let orden = ordenes.get(key);
    if (!orden) {
      orden = {
        id: ordenDb.id,
        mesa: ordenDb.mesa,
        mesero: ordenDb.mesero,
        tipoEnvio: ordenDb.tipoEnvio,
        paraLlevar: ordenDb.paraLlevar,
        orden: ordenDb.orden,
        hora: ordenDb.hora,
        productos: [],
        newOrder: ordenDb.newOrder,
        resaltado: ordenDb.resaltado ?? false,
        snoozed: ordenDb.snoozed ?? false,
      };
      ordenes.set(key, orden);
    }

    const combos: ProductoCombo[] = [];
    const combosExtraidos: string[] | undefined =
      ordenDb.productosCombo?.split(",");
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

    const producto: Producto = {
      producto: ordenDb.producto,
      cantidad: ordenDb.cantidad,
      borrada: ordenDb.borrada,
      observacion: ordenDb.observacion,
      combos: combos,
      detalleCuentaId: ordenDb.detalleCuentaId,
      terminado: ordenDb.terminado ?? null,
    };

    orden.productos.push(producto);
  }

  // Map preserva el orden de insercion: mismo orden de salida que antes.
  return Array.from(ordenes.values());
};
