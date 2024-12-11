'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Orden } from '@/interfaces/Orden'
import { Search, Undo } from 'lucide-react'
import { redirect, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export const HistoryPage = () => {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [loading, setLoading] = useState(true)
  const [nombreEquipo, setNombreEquipo] = useState('')
  const [filteredOrdenes, setFilteredOrdenes] = useState<Orden[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const router = useRouter()

  const themeColors = {
    primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
    secondaryBg: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
    done: process.env.NEXT_PUBLIC_DONE_COLOR
  }

  const getHistory = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/history?equipo=${encodeURIComponent(nombreEquipo)}`,
        {
          method: 'GET'
        }
      )
      if (!resp.ok) {
        throw new Error('Error al obtener los equipos')
      }
      const data = await resp.json()

      setOrdenes(data)
      setFilteredOrdenes(data) //
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [nombreEquipo])

  useEffect(() => {
    const equipo = localStorage.getItem('equipo') ?? ''

    if (equipo.length === 0) {
      redirect('/config')
    }

    setNombreEquipo(equipo)

    getHistory()

    const interval = setInterval(() => {
      console.log('Actualizando órdenes...')
      getHistory()
    }, 15000)

    return () => clearInterval(interval)
  }, [getHistory])

  // Manejar cambios en el buscador
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const term = event.target.value.toLowerCase()
    setSearchTerm(term)

    // Filtrar órdenes por término de búsqueda
    const filtered = ordenes.filter(
      (orden) =>
        orden.orden?.toString().includes(term) ||
        orden.mesa?.toLowerCase().includes(term) ||
        orden.mesero?.toLowerCase().includes(term) ||
        orden.productos.some((producto) =>
          producto.producto.toLowerCase().includes(term)
        )
    )

    setFilteredOrdenes(filtered)
  }

  const rehacerOrden = async (
    idVisita: number,
    idOrden: number,
    terminado: boolean,
    nombreEquipo: string
  ) => {
    try {
      const resp = await fetch(`/api/ordenes`, {
        method: 'PUT',
        body: JSON.stringify({ idVisita, idOrden, terminado, nombreEquipo })
      })
      if (!resp.ok) {
        throw new Error('Error al actualizar la orden')
      }

      router.push('/')
    } catch (error) {
      console.error(error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[90vh]">
        <div className="spinner">
          <div className="bounce1"></div>
          <div className="bounce2"></div>
          <div className="bounce3"></div>
        </div>
      </div>
    )
  }

  return (
    <>
      {ordenes.length === 0 ? (
        <div className="flex items-center justify-center h-[90vh]">
          <h2 className="text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500">
            No hay historial de pedidos.
          </h2>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center overflow-hidden mb-3">
          <h2 className="text-2xl sm:text-3xl font-bold my-5 sm:mb-8">
            Historial de Pedidos
          </h2>

          <div className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[50vw] mb-4 flex items-center gap-2 border rounded-lg px-4 shadow-sm">
            <Search />
            <input
              type="text"
              placeholder="Buscar pedidos por orden, mesa, mesero o producto..."
              value={searchTerm}
              onChange={handleSearch}
              className="w-full py-2 focus:outline-none"
            />
          </div>

          <div className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[50vw] flex flex-col gap-2">
            {filteredOrdenes.map((orden) => (
              <Card
                key={`${orden.id}${orden.orden}`}
                className="py-1 px-2 overflow-hidden relative shadow-xl"
                style={{ borderColor: `#${themeColors.primaryBg}` }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between font-bold text-xl uppercase pb-1 gap-1 sm:gap-3">
                    <div className="border bg-[#2c3236] rounded-full min-w-8 md:min-w-10 min-h-8 md:min-h-10 flex items-center justify-center px-1 shadow-md">
                      <p className="text-2xl text-white">{orden.orden}</p>
                    </div>
                    <p>
                      {orden.mesa
                        ? orden.mesa
                        : orden.tipoEnvio + ' - ' + orden.paraLlevar}
                    </p>

                    <p>{orden.mesero}</p>

                    <p>{orden.hora.substring(11, 16)}</p>
                  </div>
                </CardHeader>
                <CardContent className="mt-2 min-h-10">
                  {orden.productos.map((producto) => (
                    <div
                      key={`${producto.producto}${orden.orden}`}
                      className={`capitalize font-bold text-lg leading-5 ${
                        producto.borrada
                          ? 'line-through text-[#d17f7f] animate-pulse'
                          : ''
                      }`}
                    >
                      <h2>
                        {producto.cantidad}x {producto.producto}
                      </h2>

                      {producto.combos.map((combo, index) => (
                        <ul key={index} className="text-base font-semibold">
                          <li>
                            +{combo.cantidad} {combo.descripcion}
                          </li>
                        </ul>
                      ))}
                      {producto.observacion && (
                        <p className="text-base font-semibold">
                          {' '}
                          - {producto.observacion}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="absolute bottom-2 right-4 rounded-full w-[40px] h-[40px] shadow-lg"
                      variant="outline"
                      style={{
                        backgroundColor: '#d17f7f'
                      }}
                    >
                      <Undo className="text-white !w-[25px] !h-[25px]" />
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent className="rounded-lg max-w-[400px] flex flex-col items-center">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-bold">
                        ¿Desea reintegrar la orden?
                      </AlertDialogTitle>
                      <AlertDialogDescription></AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          rehacerOrden(
                            orden.id,
                            orden.orden,
                            false,
                            nombreEquipo
                          )
                        }
                        style={{
                          backgroundColor: '#d17f7f'
                        }}
                      >
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
