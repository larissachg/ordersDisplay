'use client'

import { useState } from 'react'
import { TecladoNumerico } from './TecladoNumerico'
import { SesionInventario } from '@/interfaces/Inventario'

export const PinGate = ({
  titulo = 'Ingresá tu código',
  onSesion
}: {
  titulo?: string
  onSesion: (pin: string, sesion: SesionInventario) => void
}) => {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [validando, setValidando] = useState(false)

  const entrar = async () => {
    if (pin.length === 0 || validando) return
    setValidando(true)
    setError('')
    try {
      const resp = await fetch('/api/inventario/sesion', {
        method: 'POST',
        body: JSON.stringify({ pin })
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Código incorrecto')
        setPin('')
        return
      }
      onSesion(pin, data)
    } catch {
      setError('Sin conexión con el servidor')
    } finally {
      setValidando(false)
    }
  }

  return (
    <div className='flex flex-1 flex-col justify-center gap-5 px-6'>
      <div className='flex flex-col items-center gap-2.5 text-center'>
        <p className='text-xl font-bold text-[#2c3236]'>{titulo}</p>
        <div className='flex gap-3.5'>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={
                i < Math.min(pin.length, 4)
                  ? 'h-4 w-4 rounded-full bg-[#2c3236]'
                  : 'h-4 w-4 rounded-full border-2 border-[#b6bcc1] bg-white'
              }
            />
          ))}
        </div>
        {error !== '' && <p className='text-sm font-semibold text-[#b85c5c]'>{error}</p>}
      </div>
      <TecladoNumerico
        onTecla={(d) => setPin((p) => (p.length < 20 ? p + d : p))}
        onBorrar={() => setPin((p) => p.slice(0, -1))}
        onLimpiar={() => setPin('')}
      />
      <button
        onClick={entrar}
        disabled={validando}
        className='flex h-14 items-center justify-center rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
      >
        {validando ? 'Validando…' : 'Entrar'}
      </button>
      <p className='text-center text-[13px] leading-relaxed text-[#8b949b]'>
        Mismo código que usás en el POS.
        <br />
        El PIN no se guarda en el dispositivo.
      </p>
    </div>
  )
}
