'use client'

import { Delete } from 'lucide-react'

// Teclado 3x4 del mockup (spec seccion 14): teclas >= 44px.
export const TecladoNumerico = ({
  onTecla,
  onBorrar,
  onLimpiar,
  conComa = false
}: {
  onTecla: (d: string) => void
  onBorrar: () => void
  onLimpiar?: () => void
  conComa?: boolean
}) => {
  const abajoIzquierda = conComa ? ',' : 'C'
  return (
    <div className='grid grid-cols-3 gap-2.5'>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          onClick={() => onTecla(d)}
          className='flex h-[58px] items-center justify-center rounded-lg bg-[#eef0f1] text-2xl font-bold text-[#2c3236] active:bg-[#dde0e3]'
        >
          {d}
        </button>
      ))}
      <button
        onClick={() => (abajoIzquierda === ',' ? onTecla(',') : onLimpiar?.())}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#e5e8ea] text-2xl font-bold text-[#626e78] active:bg-[#dde0e3]'
      >
        {abajoIzquierda}
      </button>
      <button
        onClick={() => onTecla('0')}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#eef0f1] text-2xl font-bold text-[#2c3236] active:bg-[#dde0e3]'
      >
        0
      </button>
      <button
        onClick={onBorrar}
        className='flex h-[58px] items-center justify-center rounded-lg bg-[#e5e8ea] text-[#626e78] active:bg-[#dde0e3]'
      >
        <Delete className='h-6 w-6' />
      </button>
    </div>
  )
}
