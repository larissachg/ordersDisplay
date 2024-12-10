"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronRight, History, ListOrdered, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export const SideMenu = () => {
  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const getEquipos = useCallback(async () => {
    try {
      const resp = await fetch("/api/equipos", { method: "GET" });
      if (!resp.ok) {
        throw new Error(
          "Error al obtener los equipos, porfavor revisa la conexion a tu base de datos"
        );
      }
      const data = await resp.json();

      if (data.length > 1) {
        setShowConfig(true);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    getEquipos();
  }, [getEquipos]);

  return (
    <div className="bg-[#ffffff49] border  shadow-lg shadow-[#2c3236] rounded-full fixed bottom-2 -left-6 backdrop-blur-sm flex w-[53px] h-[63px] pl-5">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger>
          <ChevronRight width={30} height={30} />
        </SheetTrigger>
        <SheetContent side={"left"} className="min-w-[200px]">
          <SheetHeader>
            <SheetTitle></SheetTitle>
            <SheetDescription className="flex flex-col gap-5 text-4xl font-semibold text-black">
              <Link
                href={"/"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 "
              >
                <ListOrdered width={35} height={35} /> Ordenes
              </Link>
              <Link
                href={"/history"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3  "
              >
                <History width={35} height={35} /> Historial
              </Link>

              {showConfig && (
                <Link
                  href={"/config"}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3  "
                >
                  <Settings width={35} height={35} /> Configuración
                </Link>
              )}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
};
