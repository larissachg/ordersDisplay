import Masonry from 'react-masonry-css'
import { CheckCheck, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../../../../components/ui/card'
import { Button } from '../../../../components/ui/button'
import TimerComponent from '../../../../components/TimerComponent'
import { ResetIcon } from '@radix-ui/react-icons'

import { Orden } from '@/interfaces/Orden'

const SnoozedOrdersList = ({
  snoozedOrdenes,
  nombreEquipo,
  conDesglose,
  themeColors,
  getColorForTipoEnvio,
  handleUnsnooze,
  enableSnooze,
  playDone,
  actualizarItem,
  actualizarOrden,
  mostrarDetallesOrden
}: {
  snoozedOrdenes: Orden[]
  nombreEquipo: string
  conDesglose: string
  themeColors: { primaryBg: string; secondaryBg: string; done: string }
  getColorForTipoEnvio: (
    tipoEnvio: string | null,
    colorDefault: string
  ) => string
  handleUnsnooze: (visitaId: number, orden: number) => Promise<void>
  enableSnooze: string
  playDone: () => void
  actualizarItem: (
    detalleCuentaId: number,
    terminado: boolean,
    nombreEquipo: string
  ) => Promise<void>
  actualizarOrden: (
    idVisita: number,
    idOrden: number,
    terminado: boolean,
    nombreEquipo: string
  ) => Promise<void>
  mostrarDetallesOrden: (orden: Orden) => void
}) => {
  const breakpointColumns = {
    default: 3,
    1100: 2,
    700: 1
  }

  return (
    <div className='overflow-y-auto h-[calc(100vh-80px)] p-4'>
      {snoozedOrdenes.length === 0 ? (
        <div className='flex items-center justify-center h-full'>
          <h2 className='text-xl font-bold text-gray-500'>
            No hay órdenes dormidas.
          </h2>
        </div>
      ) : (
        <Masonry
          breakpointCols={breakpointColumns}
          className='flex w-auto gap-3 mt-1 px-1 break-inside-avoid'
          columnClassName='masonry-column'
        >
          {snoozedOrdenes.map((orden, index) => (
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
                    <div className='bg-[#2c3236] rounded-full text-center m-auto border border-white shadow-md min-w-16 min-h-16 flex items-center justify-center px-2'>
                      <span className='text-[2rem] font-bold text-white'>
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
                  <div className='flex items-center gap-2'>
                    {enableSnooze === '1' && (
                      <Button
                        className='rounded-full w-[40px] h-[40px] text-white text-[16px] shadow-lg p-0 bg-[#2c3236] hover:opacity-75 hover:bg-[#a0bd93]'
                        variant='outline'
                        title='Restaurar pedido'
                        onClick={() => handleUnsnooze(orden.id, orden.orden)}
                      >
                        <ResetIcon className='!w-[20px] !h-[20px]' />
                      </Button>
                    )}
                    <TimerComponent startTime={orden.hora.replace('Z', '')} />
                  </div>
                </div>
              </CardHeader>
              {conDesglose === '0' ? (
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
                <CheckCheck className='!w-[25px] !h-[25px] text-[#fff]' />
              </Button>
            </Card>
          ))}
        </Masonry>
      )}
    </div>
  )
}

export default SnoozedOrdersList
