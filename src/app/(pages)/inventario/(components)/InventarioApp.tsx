'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PinGate } from './PinGate'
import { ListaConteos } from './ListaConteos'
import { NuevoConteoSheet } from './NuevoConteoSheet'
import { CapturaConteo } from './CapturaConteo'
import { RevisionConteo } from './RevisionConteo'
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
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  if (vista.tipo === 'captura') {
    return (
      <CapturaConteo
        pin={pin}
        sesion={sesion}
        conteoId={vista.conteoId}
        onVolver={() => setVista({ tipo: 'lista' })}
        onTerminar={async () => {
          // Cerrar pasa el conteo a revision; si falla, la pantalla de revision
          // lo muestra igual en su estado real.
          await fetch(`/api/inventario/conteos/${vista.conteoId}/cerrar`, {
            method: 'POST',
            body: JSON.stringify({ pin })
          }).catch(() => null)
          setVista({ tipo: 'revision', conteoId: vista.conteoId })
        }}
      />
    )
  }
  if (vista.tipo === 'revision') {
    return (
      <RevisionConteo
        pin={pin}
        sesion={sesion}
        conteoId={vista.conteoId}
        onVolver={() => setVista({ tipo: 'lista' })}
      />
    )
  }
  return (
    <>
      <ListaConteos
        pin={pin}
        sesion={sesion}
        onAbrirCaptura={(conteoId) => setVista({ tipo: 'captura', conteoId })}
        onAbrirRevision={(conteoId) => setVista({ tipo: 'revision', conteoId })}
        onNuevo={() => setNuevoAbierto(true)}
      />
      {nuevoAbierto && (
        <NuevoConteoSheet
          pin={pin}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={(conteoId) => {
            setNuevoAbierto(false)
            setVista({ tipo: 'captura', conteoId })
          }}
        />
      )}
    </>
  )
}

export type { Vista }
