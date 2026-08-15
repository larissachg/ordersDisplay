'use client'

import { Card, CardContent } from '@/components/ui/card'
import TimerComponent from '@/components/TimerComponent'
import useSound from 'use-sound'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CargaEstacionResponse, CorteEstacion } from '@/interfaces/Cocina'
import Link from 'next/link'

const themeColors = {
  primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? '626e78'
}
const GRIS_ESPERA = '#9ca3af'

// Visor pasivo de una estacion de cocina: una seccion por corte (header con el
// agregado + timer, y adentro una card por pedido con lo relevante a la
// estacion), mas la seccion "En espera" con lo aun no cortado. Sin checks, sin
// snooze, sin resaltar. Mismo poll de 15 s del KDS.
const SeccionGrupo = ({
  grupo,
  titulo,
  color,
  columnas,
  punteada = false
}: {
  grupo: CorteEstacion
  titulo: string
  color: string
  columnas: number
  punteada?: boolean
}) => (
  <section
    className={`overflow-hidden rounded-xl border-2 shadow-xl ${
      punteada ? 'border-dashed' : ''
    }`}
    style={{ borderColor: color }}
  >
    <div
      className='flex flex-wrap items-center justify-between gap-2 px-4 py-3'
      style={{ backgroundColor: color }}
    >
      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <p className='mr-2 text-3xl font-bold uppercase text-white'>{titulo}</p>
        {grupo.items.map((item) => (
          <span
            key={item.nombre}
            className='whitespace-nowrap rounded-full bg-white/20 px-3 py-0.5 text-xl font-semibold capitalize text-white'
          >
            {item.cantidad}x {item.nombre}
          </span>
        ))}
      </div>
      <TimerComponent startTime={grupo.horaInicio.replace('Z', '')} />
    </div>
    <div
      className='grid gap-3 p-3'
      style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
    >
      {grupo.pedidos.map((pedido) => (
        <Card
          key={`${pedido.visitaId}|${pedido.orden}`}
          className='break-inside-avoid shadow-md'
          style={{ borderColor: color }}
        >
          <CardContent className='flex items-start gap-3 p-3'>
            <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#2c3236] text-2xl font-bold text-white'>
              {pedido.orden}
            </div>
            <ul className='min-w-0 flex-1'>
              {pedido.items.map((item) => (
                <li
                  key={`${item.nombre}|${item.observacion ?? ''}`}
                  className='flex items-start gap-2.5 py-1'
                >
                  <span
                    className='flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-2xl font-bold text-white'
                    style={{ backgroundColor: color }}
                  >
                    {item.cantidad}
                  </span>
                  <div className='min-w-0'>
                    <span className='text-2xl font-semibold capitalize leading-7'>
                      {item.nombre}
                    </span>
                    {item.observacion && (
                      <p className='text-xl font-semibold leading-6'>
                        - {item.observacion}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  </section>
)

export const EstacionView = ({ estacionId }: { estacionId: number }) => {
  const [data, setData] = useState<CargaEstacionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [columnas, setColumnas] = useState(3)
  const [playNewOrder] = useSound('/sounds/neworder.mp3')
  const cortesPrevios = useRef(0)

  const getCarga = useCallback(async () => {
    try {
      const resp = await fetch(`/api/estaciones/carga?estacion=${estacionId}`, {
        method: 'GET'
      })
      if (!resp.ok) {
        throw new Error('Error al obtener la carga de la estación')
      }
      const nueva: CargaEstacionResponse = await resp.json()
      if (nueva.cortes.length > cortesPrevios.current) playNewOrder()
      cortesPrevios.current = nueva.cortes.length
      setData(nueva)
      setErrorMessage(null)
    } catch (error) {
      console.error(error)
      setErrorMessage('No se pudo conectar a la base de datos')
    } finally {
      setLoading(false)
    }
  }, [estacionId, playNewOrder])

  useEffect(() => {
    // Misma configuracion 3x3 / 4x4 de /config que la pantalla principal.
    setColumnas(parseInt(localStorage.getItem('columns') ?? '3') || 3)
    getCarga()
    const interval = setInterval(getCarga, 15000)
    return () => clearInterval(interval)
  }, [getCarga])

  if (loading) {
    return (
      <div className='flex items-center justify-center h-[90vh]'>
        <div className='spinner'>
          <div className='bounce1'></div>
          <div className='bounce2'></div>
          <div className='bounce3'></div>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className='flex items-center justify-center h-[90vh]'>
        <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-red-500 animate-pulse'>
          {errorMessage}
        </h2>
      </div>
    )
  }

  if (data && data.estacion === null) {
    return (
      <div className='flex flex-col items-center justify-center h-[90vh] gap-4'>
        <h2 className='text-xl sm:text-3xl font-bold text-gray-500 text-center'>
          La estación configurada ya no existe o está inactiva.
        </h2>
        <Link href='/config' className='text-2xl underline text-blue-500'>
          Volver a configurar la pantalla
        </Link>
      </div>
    )
  }

  return (
    <>
      {!data || (data.cortes.length === 0 && data.enEspera === null) ? (
        <div className='flex items-center justify-center h-[90vh]'>
          <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500'>
            Sin trabajo pendiente.
          </h2>
        </div>
      ) : (
        <div className='mt-2 flex flex-col gap-4 px-1 pb-4'>
          {data.cortes.map((corte, index) => (
            <SeccionGrupo
              key={`${corte.horaInicio}-${index}`}
              grupo={corte}
              titulo={
                data.estacion?.mostrarProductos
                  ? corte.horaEtiqueta
                  : `Corte ${corte.horaEtiqueta}`
              }
              color={`#${themeColors.primaryBg}`}
              columnas={columnas}
            />
          ))}
          {data.enEspera && (
            <SeccionGrupo
              grupo={data.enEspera}
              titulo='En espera'
              color={GRIS_ESPERA}
              columnas={columnas}
              punteada
            />
          )}
        </div>
      )}
    </>
  )
}
