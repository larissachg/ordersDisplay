'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PinGate } from './PinGate'
import { SesionInventario } from '@/interfaces/Inventario'

const INACTIVIDAD_MS = 10 * 60 * 1000

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'captura'; conteoId: number }
  | { tipo: 'revision'; conteoId: number }

export const InventarioApp = () => {
  // PIN y sesion SOLO en memoria: refresh o 10 min de inactividad = re-login.
  const [pin, setPin] = useState<string | null>(null)
  const [sesion, setSesion] = useState<SesionInventario | null>(null)
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cerrarSesion = useCallback(() => {
    setPin(null)
    setSesion(null)
    setVista({ tipo: 'lista' })
  }, [])

  const tocarActividad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(cerrarSesion, INACTIVIDAD_MS)
  }, [cerrarSesion])

  useEffect(() => {
    if (pin === null) return
    tocarActividad()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pin, tocarActividad])

  return (
    <div
      className='mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#eef0f1]'
      onPointerDown={tocarActividad}
      onKeyDown={tocarActividad}
    >
      <header className='bg-[#626e78] px-5 py-4 text-white'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold uppercase leading-none tracking-wide'>Inventario</h1>
            <p className='mt-1 text-sm font-semibold opacity-75'>Restotech KDS</p>
          </div>
          {sesion && (
            <button
              onClick={cerrarSesion}
              className='rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold'
            >
              {sesion.nombre}
            </button>
          )}
        </div>
      </header>

      {pin === null || sesion === null ? (
        <PinGate
          onSesion={(nuevoPin, nuevaSesion) => {
            setPin(nuevoPin)
            setSesion(nuevaSesion)
          }}
        />
      ) : (
        // Las vistas se completan en las Tareas 10 y 13; por ahora placeholder funcional.
        <VistaActual pin={pin} sesion={sesion} vista={vista} setVista={setVista} />
      )}
    </div>
  )
}

const VistaActual = ({
  pin,
  sesion,
  vista,
  setVista
}: {
  pin: string
  sesion: SesionInventario
  vista: Vista
  setVista: (v: Vista) => void
}) => {
  void pin
  void sesion
  void vista
  void setVista
  return <div className='p-6 text-[#626e78]'>Lista de conteos (Tarea 10)</div>
}

export type { Vista }
