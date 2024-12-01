"use client";

import { CheckCheck, Timer } from "lucide-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Orden } from "@/interfaces/Orden";
import TimerComponent from "./TimerComponent";
import { isDesktop, isMobileOnly, isTablet } from "react-device-detect";

const themeColors = {
  primary: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  secondary: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
  timer: process.env.NEXT_PUBLIC_TIMER_COLOR,
};
export const OrdersPage = () => {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombreEquipo, setNombreEquipo] = useState("");

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

      setOrdenes(data);
    } catch (error) {
      console.error(error);
    }
  }, [nombreEquipo]);

  useEffect(() => {
    const equipo = localStorage.getItem("equipo") ?? "";

    if (equipo.length === 0) {
      setTimeout(() => {
        toast.error(
          "No se han registrado los equipos, por favor registra el equipo de tu empresa",
          {
            style: {
              backgroundColor: "red",
              color: "white",
            },
          }
        );
      }, 500);
      redirect("/config");
    }

    setNombreEquipo(equipo);

    getOrdenes();
    setLoading(false);
  }, [getOrdenes]);

  console.log({ isMobileOnly });

  const actualizarOrden = async (
    idVisita: number,
    idOrden: number,
    terminado: boolean
  ) => {
    try {
      const resp = await fetch(`/api/ordenes`, {
        method: "PUT",
        body: JSON.stringify({ idVisita, idOrden, terminado }),
      });
      if (!resp.ok) {
        throw new Error("Error al actualizar la orden");
      }

      if (terminado) {
        toast.success("Pedido entregado exitosamente!", {
          action: {
            actionButtonStyle: {
              backgroundColor: `blue`,
              color: "black",
            },
            label: "Deshacer",
            onClick: () => actualizarOrden(idVisita, idOrden, false),
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

  return (
    <div
      className={`mt-2 mx-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-4 gap-5 md:gap-2 h-[98vh]`}
    >
      {ordenes.map((orden, ordenIndex) => (
        <Card
          key={`${orden.id}${orden.orden}`}
          className={`flex flex-col relative ${
            (isMobileOnly || isTablet) && ordenIndex < 4 ? "row-span-2" : ""
          }
          ${isDesktop && ordenIndex < 3 && "row-span-2"}
          `}
        >
          <CardHeader>
            <div className="flex justify-between border-b-[1px] pb-3 items-center">
              <div className="flex gap-2">
                <div
                  className="w-[4.5rem] p-1 rounded-xl text-center m-auto"
                  style={{ backgroundColor: `#${themeColors.primary}` }}
                >
                  <p className="text-xl font-bold text-white">#{orden.orden}</p>
                </div>
                <div>
                  <p className="text-xl font-bold uppercase">
                    {orden.mesa
                      ? orden.mesa
                      : orden.tipoEnvio + " - " + orden.paraLlevar}
                  </p>
                  <p className="text-md uppercase font-semibold">
                    {orden.mesero} |{" "}
                    <span>{orden.hora.split("T")[1].split(".")[0]}</span>
                  </p>
                </div>
              </div>

              <div
                className="px-2 rounded-xl flex items-center gap-1 font-bold  min-h-11 max-h-12"
                style={{ backgroundColor: `#${themeColors.timer}` }}
              >
                <Timer width={20} height={20} />
                <TimerComponent startTime={orden.hora.replace("Z", "")} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto scroll-card min-h-20">
            {orden.productos.map((producto, index) => (
              <div
                key={`${producto.producto}${orden.orden}${index} `}
                className={`px-2 flex flex-col capitalize ${
                  producto.borrada
                    ? "line-through text-red-500 animate-pulse"
                    : ""
                }`}
              >
                <h2
                  className={`font-bold ${
                    !isMobileOnly && ordenIndex < 3 ? "text-2xl" : "text-xl"
                  } `}
                >
                  {producto.cantidad}x {producto.producto}
                </h2>

                {producto.combos.map((combo, index) => (
                  <ul
                    className={`font-semibold pl-5 ${
                      !isMobileOnly && ordenIndex < 3 ? "text-xl" : "text-lg"
                    }`}
                    key={index}
                  >
                    <li>
                      +{combo.cantidad} {combo.descripcion}
                    </li>
                  </ul>
                ))}

                {producto.observacion && (
                  <p
                    className={`font-semibold pl-5 ${
                      !isMobileOnly && ordenIndex < 3 ? "text-xl" : "text-lg"
                    }`}
                  >
                    - {producto.observacion}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
          <Button
            className="self-end absolute bottom-2 right-4 rounded-full w-[55px] h-[55px] text-[20px]"
            style={{ backgroundColor: `#${themeColors.secondary}` }}
            variant="outline"
            onClick={() => actualizarOrden(orden.id, orden.orden, true)}
          >
            <CheckCheck
              style={{ color: `#${themeColors.primary}` }}
              className="!w-[25px] !h-[25px]"
            />
          </Button>
        </Card>
      ))}
    </div>
  );
};
