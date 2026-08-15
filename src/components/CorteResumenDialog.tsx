'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ResumenPintado } from '@/interfaces/Cocina'

// Paleta semaforo del KDS (misma de TimerComponent y las cards).
const VERDE = '#80a76e'
const AMBAR = '#eac568'
const ROJO = '#d17f7f'
const GRIS = '#626e78'
const TINTA = '#2c3236'
const AUTOCIERRE_MS = 10000

export const CorteResumenDialog = ({
  resumen,
  onClose
}: {
  resumen: ResumenPintado | null
  onClose: () => void
}) => {
  const [drenando, setDrenando] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Auto-cierre a los 10 s; la barra inferior drena para avisarlo.
  useEffect(() => {
    if (resumen === null) return
    setDrenando(false)
    const arranque = setTimeout(() => setDrenando(true), 50)
    const cierre = setTimeout(() => onCloseRef.current(), AUTOCIERRE_MS)
    return () => {
      clearTimeout(arranque)
      clearTimeout(cierre)
      setDrenando(false)
    }
  }, [resumen])

  const sinTrabajo = resumen !== null && !resumen.generaTrabajo
  const excedido = resumen?.excedido ?? false
  const alLimite =
    !excedido &&
    (resumen?.estaciones.some(
      (est) => est.capacidad > 0 && est.ocupacion >= est.capacidad
    ) ??
      false)

  const colorEstado = sinTrabajo
    ? GRIS
    : excedido
    ? ROJO
    : alLimite
    ? AMBAR
    : VERDE

  const subtitulo = sinTrabajo
    ? 'Esta orden no genera trabajo en estaciones.'
    : excedido
    ? 'No entra completa: revise la carga.'
    : resumen?.abreCorteNuevo
    ? 'Abre un corte nuevo en cocina.'
    : alLimite
    ? 'Entró y la estación quedó al límite.'
    : 'La orden entró a producción.'

  return (
    <Dialog
      open={resumen !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className='max-w-[560px] gap-0 overflow-hidden border-0 p-0 [&>button]:hidden'>
        <DialogHeader className='space-y-0 p-0'>
          <div
            className='relative px-6 pb-4 pt-5'
            style={{
              backgroundColor: colorEstado,
              color: sinTrabajo ? '#ffffff' : TINTA
            }}
          >
            <DialogTitle className='text-4xl font-bold uppercase leading-none tracking-tight'>
              {sinTrabajo
                ? 'Sin trabajo en cocina'
                : `Corte ${resumen?.horaEtiqueta ?? ''}`}
            </DialogTitle>
            <p className='mt-2 text-xl font-semibold opacity-80'>{subtitulo}</p>
            <DialogClose
              className='absolute right-4 top-4 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#2c3236] text-white shadow-md transition-opacity hover:opacity-75 focus:outline-none'
              title='Cerrar'
            >
              <X className='h-6 w-6' />
              <span className='sr-only'>Cerrar</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {sinTrabajo ? (
          <div className='bg-white px-6 py-6 text-[#2c3236]'>
            <p className='text-2xl font-semibold'>
              Quedó pintada, pero ningún producto tiene componentes de cocina
              configurados.
            </p>
          </div>
        ) : (
          <div className='flex flex-col bg-white px-6 py-4 text-[#2c3236]'>
            {resumen?.estaciones.map((estacion) => {
              const excedida =
                estacion.capacidad > 0 &&
                estacion.ocupacion > estacion.capacidad
              const llena =
                estacion.capacidad > 0 &&
                estacion.ocupacion >= estacion.capacidad
              const porcentaje =
                estacion.capacidad > 0
                  ? Math.min(
                      100,
                      (estacion.ocupacion / estacion.capacidad) * 100
                    )
                  : 0
              const colorBarra = excedida ? ROJO : llena ? AMBAR : VERDE
              return (
                <div key={estacion.nombre} className='py-2.5'>
                  <div className='flex items-baseline justify-between gap-4'>
                    <span className='text-2xl font-bold'>
                      {estacion.nombre}{' '}
                      <span className='text-lg font-semibold opacity-70'>
                        · {estacion.unidades}{' '}
                        {estacion.unidades === 1 ? 'unidad' : 'unidades'}
                      </span>
                    </span>
                    <span className='whitespace-nowrap text-2xl font-bold tabular-nums'>
                      {estacion.capacidad === 0
                        ? `${estacion.ocupacion} / ∞`
                        : `${estacion.ocupacion} / ${estacion.capacidad}`}
                    </span>
                  </div>
                  {estacion.capacidad > 0 && (
                    <div className='mt-2 h-2.5 overflow-hidden rounded-full bg-gray-200'>
                      <div
                        className='h-full rounded-full'
                        style={{
                          width: `${porcentaje}%`,
                          backgroundColor: colorBarra
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {excedido && (
              <div
                className='mb-1 mt-3 rounded-lg px-4 py-3 text-xl font-bold text-white'
                style={{ backgroundColor: ROJO }}
              >
                Despinte esta orden y elija otra que quepa.
              </div>
            )}
          </div>
        )}

        <div className='h-1.5 w-full bg-gray-200'>
          <div
            className='h-full transition-[width] ease-linear'
            style={{
              width: drenando ? '0%' : '100%',
              backgroundColor: colorEstado,
              transitionDuration: `${AUTOCIERRE_MS}ms`
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
