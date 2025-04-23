'use client'

import Masonry from 'react-masonry-css'
import { CheckCheck, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../../../../components/ui/card'
import { Button } from '../../../../components/ui/button'
import { toast } from 'sonner'
import { redirect } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Orden } from '@/interfaces/Orden'
import TimerComponent from '../../../../components/TimerComponent'
import useSound from 'use-sound'
import { OrderDetailDialog } from '@/components/OrderDetailDialog'

const themeColors = {
  primaryBg: process.env.NEXT_PUBLIC_PRIMARY_COLOR,
  secondaryBg: process.env.NEXT_PUBLIC_SECONDARY_COLOR,
  done: process.env.NEXT_PUBLIC_DONE_COLOR
}

export const OrdersPage = () => {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [loading, setLoading] = useState(true)
  const [nombreEquipo, setNombreEquipo] = useState('')
  const [conDesglose, setconDesglose] = useState('1')
  const [columns, setColumns] = useState('3')
  const [rows, setRows] = useState('3')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [activeOrder, setActiveOrder] = useState<{
    orden: number
    detalle: string
  }>({ orden: 0, detalle: '' })

  const [playDone] = useSound('/sounds/success.mp3')
  const [playNewOrder] = useSound('/sounds/neworder.mp3')

  const maxOrders = parseInt(columns) * parseInt(rows)

  const getOrdenes = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/ordenes?equipo=${encodeURIComponent(
          nombreEquipo
        )}&limit=${maxOrders}`,
        {
          method: 'GET'
        }
      )
      if (!resp.ok) {
        throw new Error('Error al obtener las ordenes')
      }
      const data = await resp.json()

      if (data.length > ordenes.length) {
        playNewOrder()
      }

      setOrdenes(data)
    } catch (error) {
      console.error(error)
      setErrorMessage('No se pudo conectar a la base de datos')
    } finally {
      setLoading(false)
    }
  }, [nombreEquipo, ordenes.length, playNewOrder, maxOrders])

  useEffect(() => {
    const equipo = localStorage.getItem('equipo') ?? ''
    const conDesglose = localStorage.getItem('conDesglose') ?? '1'
    const storedColumns = localStorage.getItem('columns') ?? '3'
    const storedRows = localStorage.getItem('rows') ?? '3'
    if (equipo.length === 0) {
      redirect('/config')
    }

    setNombreEquipo(equipo)
    setconDesglose(conDesglose)
    setColumns(storedColumns)
    setRows(storedRows)

    getOrdenes()

    const interval = setInterval(() => {
      console.log('Actualizando órdenes...')
      getOrdenes()
    }, 15000)

    return () => clearInterval(interval)
  }, [getOrdenes])

  const actualizarItem = async (
    detalleCuentaId: number,
    terminado: boolean,
    nombreEquipo: string
  ) => {
    try {
      const resp = await fetch(`/api/ordenes`, {
        method: 'PUT',
        body: JSON.stringify({ detalleCuentaId, terminado, nombreEquipo })
      })
      if (!resp.ok) {
        setErrorMessage('Error al actualizar el item, recarge la pantalla')
        return
      }

      if (terminado) {
        toast.success('Item entregado exitosamente!', {
          action: {
            actionButtonStyle: {
              backgroundColor: `blue`,
              color: 'black'
            },
            label: 'Deshacer',
            onClick: () => actualizarItem(detalleCuentaId, false, nombreEquipo)
          },
          richColors: true,
          position: 'bottom-center'
        })
      }

      await getOrdenes()
    } catch (error) {
      console.error(error)
    }
  }

  const actualizarOrden = async (
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
        setErrorMessage('Error al actualizar la orden, recarge la pantalla')
        return
      }

      if (terminado) {
        toast.success('Pedido entregado exitosamente!', {
          action: {
            actionButtonStyle: {
              backgroundColor: `blue`,
              color: 'black'
            },
            label: 'Deshacer',
            onClick: () =>
              actualizarOrden(idVisita, idOrden, false, nombreEquipo)
          },
          richColors: true,
          position: 'bottom-center'
        })
      }

      await getOrdenes()
    } catch (error) {
      console.error(error)
    }
  }

  const mostrarDetallesOrden = (orden: Orden) => {
    // Formatear los detalles de la orden
    try {
      let detalles = ``
      orden.productos.forEach((producto) => {
        if (producto.borrada) return

        detalles += `- ${producto.cantidad}x ${producto.producto}\n`
        producto.combos.forEach((combo) => {
          detalles += `  + ${combo.cantidad} ${combo.descripcion}\n`
        })
        if (producto.observacion) {
          detalles += `  - Observación: ${producto.observacion}\n`
        }
      })

      setActiveOrder({ orden: orden.orden, detalle: detalles })
      setDetailsDialogOpen(true)
    } catch (error) {
      console.error(error)
    }
  }

  const colorPalette = [
    '#3B82F6', // Azul
    '#8B5CF6', // Violeta
    '#6B7280', // Gris
    '#6366F1', // Indigo
    '#EC4899', // Rosa
    '#F97316', // Naranja
    '#14B8A6', // Verde Azulado
    '#A855F7', // Púrpura
    '#F43F5E', // Rosa Intenso
    '#22C55E', // Verde Claro
    '#0EA5E9', // Azul Claro
    '#DB2777', // Fucsia
    '#EC4899', // Rosa Medio
    '#F87171', // Rosa Claro
    '#34D399' // Verde Menta
  ]

  const getColorForTipoEnvio = (
    tipoEnvio: string | null,
    colorDefault: string
  ) => {
    if (!tipoEnvio) return colorDefault // Color por defecto (Gris) '#6B7280'

    if (tipoEnvio.toLowerCase() === 'pedidos ya') return '#EF4444' // Rojo
    if (tipoEnvio.toLowerCase() === 'whatsapp') return '#10B981' // Verde
    if (tipoEnvio.toLowerCase() === 'restomenu') return '#F59E0B' // Amarillo
    // Crear un hash simple a partir del tipoEnvio
    let hash = 0
    for (let i = 0; i < tipoEnvio.length; i++) {
      hash = tipoEnvio.charCodeAt(i) + ((hash << 5) - hash)
      hash = hash & hash // Convertir a entero de 32 bits
    }

    // Obtener el índice del color en la paleta
    const index = Math.abs(hash) % colorPalette.length
    return colorPalette[index]
  }

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

  const breakpointColumns = {
    default: parseInt(columns),
    1100: Math.max(2, parseInt(columns) - 1),
    700: 1
  }

  return (
    <>
      {ordenes.length === 0 ? (
        <div className='flex items-center justify-center h-[90vh]'>
          <h2 className='text-xl sm:text-4xl lg:text-7xl font-bold text-gray-500'>
            No hay pedidos pendientes.
          </h2>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumns}
          className='flex w-auto gap-3 mt-1 px-1 break-inside-avoid'
          columnClassName='masonry-column'
        >
          {ordenes.map((orden, index) => (
            <Card
              key={`${orden.id}${orden.orden}`}
              className={`relative mb-3 break-inside-avoid overflow-hidden shadow-xl ${
                conDesglose === '0' ? 'h-[30vh]' : 'sm:min-h-[30vh]'
              }`}
              style={{ borderColor: `#${themeColors.primaryBg}` }}
            >
              <CardHeader>
                <div
                  className='flex justify-between border-b-[1px] p-2 items-center'
                  style={{
                    backgroundColor: getColorForTipoEnvio(
                      orden.tipoEnvio,
                      index < 3
                        ? `#${themeColors.primaryBg}`
                        : `#${themeColors.secondaryBg}`
                    )
                  }}
                >
                  <div className='flex gap-2'>
                    <div className=' bg-[#2c3236] rounded-full text-center m-auto border border-white shadow-md min-w-16 min-h-16 flex items-center justify-center px-2'>
                      <span className={`text-[2rem] font-bold text-white`}>
                        {orden.orden}
                      </span>
                    </div>
                    <div>
                      <p
                        className={`text-2xl font-bold uppercase ${
                          orden.tipoEnvio
                            ? 'text-black'
                            : index < 3
                            ? 'text-white'
                            : 'text-black'
                        }`}
                      >
                        {orden.tipoEnvio
                          ? orden.tipoEnvio +
                            ' - ' +
                            (orden.mesa ? orden.mesa : orden.paraLlevar)
                          : orden.mesa}
                      </p>
                      <p
                        className={`text-lg uppercase font-semibold ${
                          orden.tipoEnvio
                            ? 'text-black'
                            : index < 3
                            ? 'text-white'
                            : 'text-black'
                        }`}
                      >
                        {orden.mesero}
                      </p>
                    </div>
                  </div>

                  <TimerComponent startTime={orden.hora.replace('Z', '')} />
                </div>
              </CardHeader>

              {conDesglose === '0' ? (
                // Vista Resumida: Solo cantidad de ítems
                <div>
                  <CardContent className='flex-1 min-h-20 p-4 bg-gray-100 rounded'>
                    <p className='text-2xl font-semibold'>
                      {orden.productos.reduce((total, producto) => {
                        if (producto.borrada) return total
                        return total + producto.cantidad
                      }, 0)}{' '}
                      {orden.productos.reduce(
                        (total, producto) => total + producto.cantidad,
                        0
                      ) === 1
                        ? 'Item'
                        : 'Items'}
                    </p>
                  </CardContent>

                  <Button
                    className='absolute bottom-2 left-4 rounded-full w-[55px] h-[55px] text-[20px] shadow-lg'
                    style={{ backgroundColor: `#${themeColors.secondaryBg}` }}
                    variant='outline'
                    onClick={() => mostrarDetallesOrden(orden)}
                  >
                    <Eye className='!w-[25px] !h-[25px] text-[#fff]' />
                  </Button>
                </div>
              ) : (
                // Vista Detallada: Mostrar todos los detalles
                <CardContent className='flex-1 min-h-20'>
                  {orden.productos.map((producto, index) => (
                    <div
                      key={`${producto.producto}${orden.orden}${index}`}
                      className={`py-1 px-2 flex flex-col capitalize relative ${
                        producto.borrada
                          ? 'line-through text-[#d17f7f] animate-pulse'
                          : producto.terminado
                          ? 'line-through text-[#a0bd93]'
                          : ''
                      }`}
                    >
                      <div className='flex items-center gap-2'>
                        <Button
                          className='w-[40px] h-[40px] text-[16px] shadow-lg'
                          style={{
                            backgroundColor: `#${themeColors.done}`,
                            opacity:
                              producto.borrada === 1 ||
                              producto.terminado !== null
                                ? 0
                                : 1
                          }}
                          variant='outline'
                          onClick={() => {
                            playDone()
                            actualizarItem(
                              producto.detalleCuentaId,
                              true,
                              nombreEquipo
                            )
                          }}
                        >
                          <CheckCheck className='!w-[20px] !h-[20px] text-[#fff]' />
                        </Button>
                        <h2 className='font-bold text-3xl leading-8'>
                          {producto.cantidad}x {producto.producto}
                        </h2>
                      </div>

                      {producto.combos.map((combo, index) => (
                        <ul
                          className='font-semibold pl-5 text-2xl leading-6'
                          key={index}
                        >
                          <li>
                            +{combo.cantidad} {combo.descripcion}
                          </li>
                        </ul>
                      ))}

                      {producto.observacion && (
                        <p className='font-semibold pl-5 text-2xl leading-6'>
                          - {producto.observacion}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
              <Button
                className='absolute bottom-2 right-4 rounded-full w-[55px] h-[55px] text-[20px] shadow-lg'
                style={{ backgroundColor: `#${themeColors.done}` }}
                variant='outline'
                onClick={() => {
                  playDone()
                  actualizarOrden(orden.id, orden.orden, true, nombreEquipo)
                }}
              >
                <CheckCheck className='!w-[25px] !h-[25px] text-[#fff' />
              </Button>
            </Card>
          ))}
        </Masonry>
      )}

      <OrderDetailDialog
        open={detailsDialogOpen}
        onClose={setDetailsDialogOpen}
        orden={activeOrder.orden}
        detalle={activeOrder.detalle}
      />
    </>
  )
}
