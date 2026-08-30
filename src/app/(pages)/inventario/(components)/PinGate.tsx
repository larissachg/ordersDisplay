'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TecladoNumerico } from './TecladoNumerico'
import { SesionInventario } from '@/interfaces/Inventario'

// Los codigos del POS no tienen largo fijo (en las bases relevadas hay de 1, 3,
// 4 y 6 digitos), asi que no se puede validar "al cuarto digito". En su lugar se
// prueba sola tras una pausa de tecleo: si falla, se queda callada y deja seguir
// escribiendo (un 1234 que en realidad era 123456 sigue funcionando).
const PAUSA_AUTOENVIO_MS = 600
const LARGO_MINIMO_AUTOENVIO = 3

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
  // Ultimo PIN que ya se probo solo: evita reintentar lo mismo en loop.
  const yaProbadoRef = useRef('')

  const entrar = useCallback(
    async (automatico = false) => {
      if (pin.length === 0 || validando) return
      setValidando(true)
      if (!automatico) setError('')
      try {
        const resp = await fetch('/api/inventario/sesion', {
          method: 'POST',
          body: JSON.stringify({ pin })
        })
        const data = await resp.json()
        if (!resp.ok) {
          // El intento automatico no molesta: puede ser un codigo a medio teclear.
          if (!automatico) {
            setError(data.error ?? 'Código incorrecto')
            setPin('')
            yaProbadoRef.current = ''
          }
          return
        }
        onSesion(pin, data)
      } catch {
        if (!automatico) setError('Sin conexión con el servidor')
      } finally {
        setValidando(false)
      }
    },
    [pin, validando, onSesion]
  )

  // Autoenvio tras la pausa: el usuario no tiene que buscar el boton Entrar.
  useEffect(() => {
    if (pin.length < LARGO_MINIMO_AUTOENVIO || validando) return
    if (pin === yaProbadoRef.current) return
    const timer = setTimeout(() => {
      yaProbadoRef.current = pin
      entrar(true)
    }, PAUSA_AUTOENVIO_MS)
    return () => clearTimeout(timer)
  }, [pin, validando, entrar])

  // La pantalla puede ser una PC con teclado fisico (o un lector que teclea el
  // codigo): sin esto solo se podia tipear con los botones en pantalla.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null
      if (destino && (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA')) return
      if (/^[0-9]$/.test(e.key)) {
        setPin((p) => (p.length < 20 ? p + e.key : p))
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        setPin((p) => p.slice(0, -1))
        return
      }
      if (e.key === 'Escape') {
        setPin('')
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        entrar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [entrar])

  // Al menos 4 puntos, y uno mas por cada digito extra: los codigos de 6 tambien
  // se ven completos.
  const puntos = Math.max(4, Math.min(pin.length, 12))

  return (
    <div className='flex flex-1 flex-col justify-center gap-5 overflow-y-auto px-6 py-4'>
      <div className='flex flex-col items-center gap-2.5 text-center'>
        <p className='text-xl font-bold text-[#2c3236]'>{titulo}</p>
        <div className='flex gap-3.5'>
          {Array.from({ length: puntos }, (_, i) => (
            <span
              key={i}
              className={
                i < pin.length
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
        onClick={() => entrar()}
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
