'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ResumenPintado } from '@/interfaces/Cocina'

// Colores del semaforo existente (TimerComponent): rojo #d17f7f, ambar #eac568.
export const CorteResumenDialog = ({
  resumen,
  onClose
}: {
  resumen: ResumenPintado | null
  onClose: () => void
}) => {
  return (
    <Dialog
      open={resumen !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className='max-w-[520px]'>
        <DialogHeader>
          <DialogTitle className='text-3xl'>
            {resumen && !resumen.generaTrabajo
              ? 'Sin trabajo en estaciones'
              : resumen?.abreCorteNuevo
              ? `Esta orden abre el corte de las ${resumen.horaEtiqueta}`
              : `Corte ${resumen?.horaEtiqueta ?? ''}`}
          </DialogTitle>
        </DialogHeader>
        {resumen && !resumen.generaTrabajo ? (
          <p className='text-2xl'>
            Esta orden no genera trabajo en estaciones de cocina.
          </p>
        ) : (
          <div className='flex flex-col gap-2'>
            {resumen?.estaciones.map((estacion) => {
              const excedida =
                estacion.capacidad > 0 && estacion.ocupacion > estacion.capacidad
              const llena =
                estacion.capacidad > 0 &&
                estacion.ocupacion >= estacion.capacidad
              return (
                <div
                  key={estacion.nombre}
                  className={`flex justify-between text-2xl font-semibold px-3 py-2 rounded ${
                    excedida
                      ? 'bg-[#d17f7f] text-white'
                      : llena
                      ? 'bg-[#eac568]'
                      : 'bg-gray-100'
                  }`}
                >
                  <span>
                    {estacion.nombre}: {estacion.unidades}{' '}
                    {estacion.unidades === 1 ? 'unidad' : 'unidades'}
                  </span>
                  <span>
                    {estacion.capacidad === 0
                      ? `${estacion.ocupacion} / sin límite`
                      : `${estacion.ocupacion} / ${estacion.capacidad}`}
                  </span>
                </div>
              )
            })}
            {resumen?.excedido && (
              <p className='text-xl font-bold text-[#d17f7f]'>
                Una estación quedó excedida: despinte esta orden o elija otra
                que quepa.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
