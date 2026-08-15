'use client'

import Masonry from 'react-masonry-css'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import TimerComponent from '@/components/TimerComponent'
import useSound from 'use-sound'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CargaEstacionResponse } from '@/interfaces/Cocina'
import Link from 'next/link'

const themeColors = {
  primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? '626e78'
}

// Visor pasivo de una estacion de cocina: una card por corte con el agregado
// a preparar. Sin checks, sin snooze, sin resaltar. Mismo poll de 15 s del KDS.
export const EstacionView = ({ estacionId }: { estacionId: number }) => {
  const [data, setData] = useState<CargaEstacionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [columns, setColumns] = useState('3')
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
    setColumns(localStorage.getItem('columns') ?? '3')
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

  const breakpointColumns = {
    default: parseInt(columns),
    1100: Math.max(2, parseInt(columns) - 1),
    700: 1
  }

  return (
    <>
      <div
        className='fixed top-2 right-2 z-10 px-4 py-1 rounded-full text-white text-xl font-bold shadow-lg'
        style={{ backgroundColor: `#${themeColors.primaryBg}` }}
      >
        {data?.estacion?.nombre}
      </div>

      {!data || data.cortes.length === 0 ? (
        <div className='flex items-center justify-center h-[90vh]'>
          <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500'>
            Sin trabajo pendiente.
          </h2>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumns}
          className='flex w-auto gap-3 mt-1 px-1 break-inside-avoid'
          columnClassName='masonry-column'
        >
          {data.cortes.map((corte, index) => (
            <Card
              key={`${corte.horaInicio}-${index}`}
              className='relative mb-3 break-inside-avoid overflow-hidden shadow-xl sm:min-h-[20vh]'
              style={{ borderColor: `#${themeColors.primaryBg}` }}
            >
              <CardHeader
                style={{ backgroundColor: `#${themeColors.primaryBg}` }}
              >
                <div className='flex justify-between border-b-[1px] p-2 items-center'>
                  <p className='text-3xl font-bold uppercase text-white'>
                    Corte {corte.horaEtiqueta}
                  </p>
                  <TimerComponent startTime={corte.horaInicio.replace('Z', '')} />
                </div>
              </CardHeader>
              <CardContent className='flex-1 min-h-20 pt-3'>
                {corte.items.map((item) => (
                  <h2
                    key={item.nombre}
                    className='font-bold text-4xl leading-10 py-1 px-2 capitalize'
                  >
                    {item.cantidad}x {item.nombre}
                  </h2>
                ))}
              </CardContent>
            </Card>
          ))}
        </Masonry>
      )}
    </>
  )
}
