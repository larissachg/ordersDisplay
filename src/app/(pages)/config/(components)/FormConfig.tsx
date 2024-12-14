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
import { Checkbox } from "@/components/ui/checkbox";
import { Equipo } from "@/interfaces/Equipo";
import { redirect } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const themeColors = {
  primary: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
};

export const FormConfig = () => {
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [conDesglose, setconDesglose] = useState("1");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  //const router = useRouter();

  const getEquipos = useCallback(async () => {
    try {
      const resp = await fetch("/api/equipos", { method: "GET" });
      if (!resp.ok) {
        throw new Error(
          "Error al obtener los equipos, porfavor revisa la conexion a tu base de datos"
        );
      }
      const data = await resp.json();

      //if (data.length === 1) {
      //  localStorage.setItem("equipo", data[0].nombreFisico);
      //  localStorage.setItem("conDesglose", "1");
      //  setTimeout(() => {
      //    toast(`Equipo registrado exitosamente, ${data[0].nombreFisico}`, {
      //      style: {
      //        backgroundColor: "#d6edda",
      //        color: "green",
      //      },
      //    });
      //  }, 500);
      //  return router.push("/");
      //}

      setEquipos(data);
      setNombreEquipo(localStorage.getItem("equipo") || "");
      setconDesglose(localStorage.getItem("conDesglose") || "1");
      setIsLoaded(true);
    } catch (error) {
      console.error(error);
    }
  }, []);//[router]

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
    localStorage.setItem("conDesglose", conDesglose);

    toast(`Equipo registrado exitosamente, ${nombreEquipo}`, {
      style: {
        backgroundColor: "#d6edda",
        color: "green",
      },
    });

    redirect("/");
  };

  if (!isLoaded) {
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
    <div className="w-full h-[100vh] flex justify-center items-center">
      <form>
        <Card className="min-w-[200px] sm:w-[450px] pt-3 p-4 flex flex-col gap-2">
          <CardHeader>
            <CardTitle>Registro de configuraciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="name">Selecciona el equipo:</Label>

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

              <Label htmlFor="desglose">Con Desglose:</Label>
                <Checkbox
                  id="desglose"
                  checked={conDesglose === "1"}
                  onCheckedChange={(value) => {
                    console.log("Checkbox clicado, valor:", value);
                    setconDesglose(value ? "1" : "0");
                  }}                 
                />
              
              
              
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
