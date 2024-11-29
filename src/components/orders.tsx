"use client";

import { CheckCheck, Timer } from "lucide-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "./header";

const themeColors = {
  primary: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  secondary: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
  timer: process.env.NEXT_PUBLIC_TIMER_COLOR,
};
export const OrdersPage = () => {
  const [loading, setLoading] = useState(true);

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

    setLoading(false);
  }, []);

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
    <div className="mx-3 h-screen md:overflow-hidden">
      <Header />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 md:grid-rows-4 gap-2 h-[96vh]">
        <Card className="row-span-2 flex flex-col relative">
          <CardHeader>
            <div className="flex justify-between border-b-[1px] pb-3">
              <div className="flex gap-2">
                <div
                  className="w-[4.5rem] p-1 rounded-xl text-center m-auto"
                  style={{ backgroundColor: `#${themeColors.primary}` }}
                >
                  <p className="text-xl font-bold text-white">#1</p>
                </div>
                <div>
                  <p className="text-xl font-bold">
                    Para: <span className="uppercase">mesa 7</span>
                  </p>
                  <p className="text-md uppercase font-semibold">
                    Juan | <span>19:10</span>
                  </p>
                </div>
              </div>

              <div
                className="px-2 rounded-xl flex items-center gap-1 font-bold"
                style={{ backgroundColor: `#${themeColors.timer}` }}
              >
                <Timer width={20} height={20} />
                <span>10:39:10</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto scroll-card">
            <div className="px-2 flex flex-col capitalize">
              <h2 className="font-bold text-4xl">1x aquario</h2>
              <ul className="font-semibold text-3xl">
                <li>+1 aquarius pera 500ml</li>
              </ul>

              <h2 className="font-bold text-4xl">1x aquario 2Lt</h2>
              <ul className="font-semibold text-3xl">
                <li>+1 aquarius pera 2Lt</li>
              </ul>
            </div>
          </CardContent>
          <Button
            className="self-end absolute bottom-2 right-4 rounded-full w-[55px] h-[55px]
        text-[20px]"
            style={{ backgroundColor: `#${themeColors.secondary}` }}
            variant="outline"
            onClick={() =>
              toast("Pedido entregado exitosamente!", {
                description: "Tiempo de espera: 10:39:10",
                action: {
                  label: "Deshacer",
                  onClick: () => console.log("Undo"),
                },
                style: {
                  backgroundColor: `#${themeColors.secondary}`,
                  color: "green",
                },
              })
            }
          >
            <CheckCheck
              style={{ color: `#${themeColors.primary}` }}
              className="!w-[25px] !h-[25px]"
            />
          </Button>
        </Card>

        <Card className="row-span-2 flex flex-col relative">
          <CardHeader>
            <div className="flex justify-between border-b-[1px] pb-3">
              <div className="flex gap-2">
                <div
                  className="w-[4.5rem] p-1 rounded-xl text-center m-auto"
                  style={{ backgroundColor: `#${themeColors.primary}` }}
                >
                  <p className="text-xl font-bold text-white">#2</p>
                </div>
                <div>
                  <p className="text-xl font-bold">
                    Para: <span className="uppercase">llevar</span>
                  </p>
                  <p className="text-md uppercase font-semibold">
                    maria | <span>19:25</span>
                  </p>
                </div>
              </div>

              <div
                className="px-2 rounded-xl flex items-center gap-1 font-bold"
                style={{ backgroundColor: `#${themeColors.timer}` }}
              >
                <Timer width={20} height={20} />
                <span>20:04:3</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto scroll-card">
            <div className="px-2 flex flex-col capitalize">
              <h2 className="font-bold text-4xl">
                2x Cuarto Leña Con Ensalada
              </h2>
              <ul className="font-semibold text-3xl">
                <li>+1 pecho</li>
                <li>+1 vinagreta</li>
                <li>+1 ensalada</li>
              </ul>

              <h2 className="font-bold text-4xl">1x Pollo Entero</h2>
              <ul className="font-semibold text-3xl">
                <li>+1 entero</li>
                <li>+1 doble arroz entero</li>
                <li>+1 papa clasica entero</li>
                <li>+1 platano entero</li>
                <li>+1 cubierto desechable</li>
              </ul>

              <h2 className="font-bold text-4xl">1x aquario </h2>
              <ul className="font-semibold text-3xl">
                <li>+1 aquarius pera 500ml</li>
              </ul>

              <h2 className="font-bold text-4xl">1x aquario </h2>
              <ul className="font-semibold text-3xl">
                <li>+1 aquarius pera 500ml</li>
              </ul>
            </div>
          </CardContent>
          <Button
            className="self-end absolute bottom-2 right-4 rounded-full w-[55px] h-[55px]
        text-[20px]"
            style={{ backgroundColor: `#${themeColors.secondary}` }}
            variant="outline"
            onClick={() =>
              toast("Pedido entregado exitosamente!", {
                description: "Sunday, December 03, 2023 at 9:00 AM",
                action: {
                  label: "Deshacer",
                  onClick: () => console.log("Undo"),
                },
                style: {
                  backgroundColor: `#${themeColors.secondary}`,
                },
              })
            }
          >
            <CheckCheck
              style={{ color: `#${themeColors.primary}` }}
              className="!w-[25px] !h-[25px]"
            />
          </Button>
        </Card>

        <Card className="row-span-2 flex flex-col">
          <CardHeader>
            <div className="flex justify-between border-b-[1px] pb-3">
              <div className="flex gap-2">
                <div
                  className="w-[4.5rem] p-1 rounded-xl text-center m-auto"
                  style={{ backgroundColor: `#${themeColors.primary}` }}
                >
                  <p className="text-xl font-bold text-white">#3</p>
                </div>
                <div>
                  <p className="text-xl font-bold">
                    Para: <span className="uppercase"></span>
                  </p>
                  <p className="text-md uppercase font-semibold">
                    | <span></span>
                  </p>
                </div>
              </div>

              <div
                className="px-2 rounded-xl flex items-center gap-1 font-bold"
                style={{ backgroundColor: `#${themeColors.timer}` }}
              >
                <Timer width={20} height={20} />
                <span></span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto scroll-card"></CardContent>
        </Card>

        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="h-full flex flex-col">
            <CardHeader>
              <div className="flex justify-between border-b-[1px] pb-3">
                <div className="flex gap-2">
                  <div
                    className="w-[4.5rem] p-1 rounded-xl text-center m-auto"
                    style={{ backgroundColor: `#${themeColors.primary}` }}
                  >
                    <p className="text-xl font-bold text-white">#{index}</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold">
                      Para: <span className="uppercase"></span>
                    </p>
                    <p className="text-md uppercase font-semibold">
                      | <span></span>
                    </p>
                  </div>
                </div>

                <div
                  className="px-2 rounded-xl flex items-center gap-1 font-bold"
                  style={{ backgroundColor: `#${themeColors.timer}` }}
                >
                  <Timer width={20} height={20} />
                  <span></span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto scroll-card"></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
