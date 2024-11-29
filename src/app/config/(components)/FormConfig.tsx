"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirect } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const themeColors = {
  primary: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
};

export const FormConfig = () => {
  const [nombreEquipo, setNombreEquipo] = useState("");

  useEffect(() => {
    setNombreEquipo(localStorage.getItem("equipo") || "");
  }, []);

  const saveRegister = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem("equipo", nombreEquipo);
    toast("Equipo registrado exitosamente!", {
      style: {
        backgroundColor: "#d6edda",
        color: "green",
      },
    });

    redirect("/")
  };

  return (
    <div className="w-full h-[100vh] flex justify-center items-center">
      <form>
        <Card className="w-[450px] pt-3 p-4 flex flex-col gap-2">
          <CardHeader>
            <CardTitle>Registro de Equipo</CardTitle>
            <CardDescription>Ingresa el equipo de tu empresa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                placeholder="Nombre del equipo"
                value={nombreEquipo}
                onChange={(e) => setNombreEquipo(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between mt-3">
            <Button
              style={{ backgroundColor: `#${themeColors.primary}` }}
              onClick={saveRegister}
            >
              Ingresar
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
