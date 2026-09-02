'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
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

  // Altura fija (h-dvh, no min-h): con min-h el contenedor crece con la lista y
  // las barras de accion ancladas abajo terminan fuera de pantalla. Asi el scroll
  // pasa dentro de cada vista y esas barras quedan siempre visibles.
  return (
    <div
      className='mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#eef0f1]'
      onPointerDown={tocarActividad}
      onKeyDown={tocarActividad}
    >
      <header className='flex items-center justify-between gap-3 bg-[#626e78] px-4 py-2 text-white'>
        <h1 className='text-lg font-bold uppercase leading-none tracking-wide'>Inventario</h1>
        {sesion && (
          <button
            onClick={cerrarSesion}
            aria-label={`Salir de la sesión de ${sesion.nombre}`}
            className='flex items-center gap-1.5 rounded-full bg-white/15 py-1.5 pl-3 pr-2.5 text-[13px] font-bold'
          >
            <span className='max-w-[140px] truncate'>{sesion.nombre}</span>
            <LogOut className='h-3.5 w-3.5 shrink-0 opacity-90' />
          </button>
        )}
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
        onTerminar={async (observacion) => {
          // Cerrar pasa el conteo a revision y graba su observacion; si falla,
          // la pantalla de revision lo muestra igual en su estado real.
          await fetch(`/api/inventario/conteos/${vista.conteoId}/cerrar`, {
            method: 'POST',
            body: JSON.stringify({ pin, observacion })
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
        onReabierto={() => setVista({ tipo: 'captura', conteoId: vista.conteoId })}
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
