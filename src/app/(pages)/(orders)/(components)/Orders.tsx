"use client";

import Masonry from "react-masonry-css";
import { CheckCheck, Eye } from "lucide-react";
import { Card, CardContent, CardHeader } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { toast } from "sonner";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Orden } from "@/interfaces/Orden";
import TimerComponent from "../../../../components/TimerComponent";
import useSound from "use-sound";
import { OrderDetailDialog } from "@/components/OrderDetailDialog";

const themeColors = {
  primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  secondaryBg: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
  done: process.env.NEXT_PUBLIC_DONE_COLOR,
};

export const OrdersPage = () => {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [conDesglose, setconDesglose] = useState("1");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{
    orden: number;
    detalle: string;
  }>({ orden: 0, detalle: "" });

  const [playDone] = useSound("/sounds/success.mp3");
  const [playNewOrder] = useSound("/sounds/neworder.mp3");

  const getOrdenes = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/ordenes?equipo=${encodeURIComponent(nombreEquipo)}`,
        {
          method: "GET",
        }
      );
      if (!resp.ok) {
        throw new Error("Error al obtener los equipos");
      }
      const data = await resp.json();

      if (data.length > ordenes.length) {
        playNewOrder();
      }

      setOrdenes(data);
    } catch (error) {
      console.error(error);
      setErrorMessage("No se pudo conectar a la base de datos");
    } finally {
      setLoading(false);
    }
  }, [nombreEquipo, ordenes.length, playNewOrder]);

  useEffect(() => {
    const equipo = localStorage.getItem("equipo") ?? "";
    const conDesglose = localStorage.getItem("conDesglose") ?? "1";
    if (equipo.length === 0) {
      redirect("/config");
    }

    setNombreEquipo(equipo);
    setconDesglose(conDesglose);

    getOrdenes();

    const interval = setInterval(() => {
      console.log("Actualizando órdenes...");
      getOrdenes();
    }, 15000);

    return () => clearInterval(interval);
  }, [getOrdenes]);

  const actualizarOrden = async (
    idVisita: number,
    idOrden: number,
    terminado: boolean,
    nombreEquipo: string
  ) => {
    try {
      const resp = await fetch(`/api/ordenes`, {
        method: "PUT",
        body: JSON.stringify({ idVisita, idOrden, terminado, nombreEquipo }),
      });
      if (!resp.ok) {
        setErrorMessage("Error al actualizar la orden, recarge la pantalla");
        return;
      }

      if (terminado) {
        toast.success("Pedido entregado exitosamente!", {
          action: {
            actionButtonStyle: {
              backgroundColor: `blue`,
              color: "black",
            },
            label: "Deshacer",
            onClick: () =>
              actualizarOrden(idVisita, idOrden, false, nombreEquipo),
          },
          richColors: true,
          position: "bottom-center",
        });
      }

      await getOrdenes();
    } catch (error) {
      console.error(error);
    }
  };

  const mostrarDetallesOrden = (orden: Orden) => {
    // Formatear los detalles de la orden
    try {
      let detalles = ``;
      orden.productos.forEach((producto) => {
        if (producto.borrada) return;

        detalles += `- ${producto.cantidad}x ${producto.producto}\n`;
        producto.combos.forEach((combo) => {
          detalles += `  + ${combo.cantidad} ${combo.descripcion}\n`;
        });
        if (producto.observacion) {
          detalles += `  - Observación: ${producto.observacion}\n`;
        }
      });

      setActiveOrder({ orden: orden.orden, detalle: detalles });
      setDetailsDialogOpen(true);
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[90vh]">
        <div className="spinner">
          <div className="bounce1"></div>
          <div className="bounce2"></div>
          <div className="bounce3"></div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex items-center justify-center h-[90vh]">
        <h2 className="text-xl sm:text-4xl lg:text-7xl font-bold text-red-500 animate-pulse">
          {errorMessage}
        </h2>
      </div>
    );
  }

  const breakpointColumns = {
    default: 3,
    1100: 2,
    700: 1,
  };

  return (
    <>
      {ordenes.length === 0 ? (
        <div className="flex items-center justify-center h-[90vh]">
          <h2 className="text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500">
            No hay pedidos pendientes.
          </h2>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumns}
          className="flex w-auto gap-3 mt-1 px-1 break-inside-avoid"
          columnClassName="masonry-column"
        >
          {ordenes.map((orden, index) => (
            <Card
              key={`${orden.id}${orden.orden}`}
              className="relative mb-3 break-inside-avoid overflow-hidden shadow-xl sm:min-h-[30vh]"
              style={{ borderColor: `#${themeColors.primaryBg}` }}
            >
              <CardHeader>
                <div
                  className="flex justify-between border-b-[1px] p-2 items-center"
                  style={{
                    backgroundColor:
                      index < 3
                        ? `#${themeColors.primaryBg}`
                        : `#${themeColors.secondaryBg}`,
                  }}
                >
                  <div className="flex gap-2">
                    <div className=" bg-[#2c3236] rounded-full text-center m-auto border border-white shadow-md min-w-16 min-h-16 flex items-center justify-center px-2">
                      <span className={`text-[2rem] font-bold text-white`}>
                        {orden.orden}
                      </span>
                    </div>
                    <div>
                      <p
                        className={`text-2xl font-bold uppercase ${
                          index < 3 ? "text-white" : "text-black"
                        }`}
                      >
                        {orden.mesa
                          ? orden.mesa
                          : orden.tipoEnvio + " - " + orden.paraLlevar}
                      </p>
                      <p
                        className={`text-lg uppercase font-semibold ${
                          index < 3 ? "text-white" : "text-black"
                        }`}
                      >
                        {orden.mesero}
                      </p>
                    </div>
                  </div>

                  <TimerComponent startTime={orden.hora.replace("Z", "")} />
                </div>
              </CardHeader>

              {conDesglose === "0" ? (
                // Vista Resumida: Solo cantidad de ítems
                <div>
                  <CardContent className="flex-1 min-h-20 p-4 bg-gray-100 rounded">
                    <p className="text-2xl font-semibold">
                      {orden.productos.reduce((total, producto) => {
                        if (producto.borrada) return total;
                        return total + producto.cantidad;
                      }, 0)}{" "}
                      {orden.productos.reduce(
                        (total, producto) => total + producto.cantidad,
                        0
                      ) === 1
                        ? "Item"
                        : "Items"}
                    </p>
                  </CardContent>

                  <Button
                    className="absolute bottom-2 left-4 rounded-full w-[55px] h-[55px] text-[20px] shadow-lg"
                    style={{ backgroundColor: `#${themeColors.secondaryBg}` }}
                    variant="outline"
                    onClick={() => mostrarDetallesOrden(orden)}
                  >
                    <Eye className="!w-[25px] !h-[25px] text-[#fff]" />
                  </Button>
                </div>
              ) : (
                // Vista Detallada: Mostrar todos los detalles
                <CardContent className="flex-1 min-h-20">
                  {orden.productos.map((producto, index) => (
                    <div
                      key={`${producto.producto}${orden.orden}${index} `}
                      className={`py-1 px-2 flex flex-col capitalize ${
                        producto.borrada
                          ? "line-through text-[#d17f7f] animate-pulse"
                          : ""
                      }`}
                    >
                      <h2 className="font-bold text-3xl leading-8">
                        {producto.cantidad}x {producto.producto}
                      </h2>

                      {producto.combos.map((combo, index) => (
                        <ul
                          className="font-semibold pl-5 text-2xl leading-6"
                          key={index}
                        >
                          <li>
                            +{combo.cantidad} {combo.descripcion}
                          </li>
                        </ul>
                      ))}

                      {producto.observacion && (
                        <p className="font-semibold pl-5 text-2xl leading-6">
                          - {producto.observacion}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
              <Button
                className="absolute bottom-2 right-4 rounded-full w-[55px] h-[55px] text-[20px] shadow-lg"
                style={{ backgroundColor: `#${themeColors.done}` }}
                variant="outline"
                onClick={() => {
                  playDone();
                  actualizarOrden(orden.id, orden.orden, true, nombreEquipo);
                }}
              >
                <CheckCheck className="!w-[25px] !h-[25px] text-[#fff" />
              </Button>
            </Card>
          ))}
        </Masonry>
      )}

      <OrderDetailDialog
        open={detailsDialogOpen}
        onClose={setDetailsDialogOpen}
        orden={activeOrder.orden}
        detalle={activeOrder.detalle}
      />
    </>
  );
};
