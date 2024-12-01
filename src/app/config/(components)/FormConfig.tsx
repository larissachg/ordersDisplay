"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Equipo } from "@/interfaces/Equipo";
import { redirect } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const themeColors = {
  primary: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
};

export const FormConfig = () => {
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const getEquipos = useCallback(async () => {
    try {
      const resp = await fetch("/api/equipos", { method: "GET" });
      if (!resp.ok) {
        throw new Error("Error al obtener los equipos");
      }
      const data = await resp.json();

      setEquipos(data);
      setNombreEquipo(localStorage.getItem("equipo") || "");
      setIsLoaded(true);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    getEquipos();
  }, [getEquipos]);

  const saveRegister = (e: FormEvent) => {
    e.preventDefault();

    if (!nombreEquipo) {
      toast("Por favor selecciona un equipo", {
        style: { backgroundColor: "#fdd", color: "red" },
      });
      return;
    }

    localStorage.setItem("equipo", nombreEquipo);
    toast("Equipo registrado exitosamente!", {
      style: {
        backgroundColor: "#d6edda",
        color: "green",
      },
    });

    redirect("/");
  };

  return (
    <div className="w-full h-[100vh] flex justify-center items-center">
      <form>
        <Card className="w-[450px] pt-3 p-4 flex flex-col gap-2">
          <CardHeader>
            <CardTitle>Registro de Equipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="name">Selecciona el equipo de tu empresa</Label>

              {isLoaded ? (
                <Select onValueChange={setNombreEquipo} value={nombreEquipo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipos.map((equipo) => (
                      <SelectItem
                        key={equipo.nombreFisico}
                        value={equipo.nombreFisico}
                      >
                        {equipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p>Cargando equipos...</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between mt-3">
            <Button
              style={{ backgroundColor: `#${themeColors.primary}` }}
              onClick={saveRegister}
            >
              Guardar
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
