'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'

// Escaner de codigos de barras en 3 capas (spec seccion 11):
// 1. BarcodeDetector nativo (Chrome/Android) — requiere isSecureContext.
// 2. @zxing/browser sobre getUserMedia — idem.
// 3. Foto con <input capture> decodificada por zxing — funciona por HTTP.
type Capa = 'nativo' | 'zxing' | 'foto'

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
    }
  }
}

export const EscanerCodigo = ({
  abierto,
  onCodigo,
  onCerrar
}: {
  abierto: boolean
  onCodigo: (codigo: string) => void
  onCerrar: () => void
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pararRef = useRef<(() => void) | null>(null)
  const [capa, setCapa] = useState<Capa | null>(null)
  const [error, setError] = useState('')

  const detener = useCallback(() => {
    pararRef.current?.()
    pararRef.current = null
  }, [])

  useEffect(() => {
    if (!abierto) {
      detener()
      return
    }
    let cancelado = false

    const arrancar = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCapa('foto')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        if (window.BarcodeDetector) {
          setCapa('nativo')
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'qr_code']
          })
          const intervalo = setInterval(async () => {
            try {
              const codigos = await detector.detect(video)
              if (codigos.length > 0) {
                onCodigo(codigos[0].rawValue)
              }
            } catch {
              /* frame no listo */
            }
          }, 300)
          pararRef.current = () => {
            clearInterval(intervalo)
            stream.getTracks().forEach((t) => t.stop())
          }
        } else {
          setCapa('zxing')
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const lector = new BrowserMultiFormatReader()
          const controles = await lector.decodeFromStream(stream, video, (resultado) => {
            if (resultado) onCodigo(resultado.getText())
          })
          pararRef.current = () => {
            controles.stop()
            stream.getTracks().forEach((t) => t.stop())
          }
        }
      } catch {
        setCapa('foto')
      }
    }
    arrancar()
    return () => {
      cancelado = true
      detener()
    }
  }, [abierto, onCodigo, detener])

  const decodificarFoto = async (archivo: File) => {
    setError('')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const lector = new BrowserMultiFormatReader()
      const url = URL.createObjectURL(archivo)
      try {
        const resultado = await lector.decodeFromImageUrl(url)
        onCodigo(resultado.getText())
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      setError('No se pudo leer el código en la foto. Probá de nuevo, más cerca.')
    }
  }

  if (!abierto) return null

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-[#2c3236]'>
      <div className='flex items-center justify-between p-4 text-white'>
        <p className='text-lg font-bold'>Escanear código</p>
        <button
          onClick={onCerrar}
          className='flex h-11 w-11 items-center justify-center rounded-full bg-white/15'
        >
          <X className='h-6 w-6' />
        </button>
      </div>
      {capa === 'foto' ? (
        <div className='flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-white'>
          <Camera className='h-12 w-12 opacity-60' />
          <p className='text-sm opacity-80'>
            La cámara en vivo necesita HTTPS o el flag de Chrome (ver Instrucciones.txt). Mientras
            tanto: sacá una foto del código.
          </p>
          {error !== '' && <p className='text-sm font-bold text-[#eac568]'>{error}</p>}
          <label className='flex h-14 cursor-pointer items-center justify-center rounded-lg bg-[#80a76e] px-8 text-lg font-bold text-[#2c3236]'>
            Tomar foto
            <input
              type='file'
              accept='image/*'
              capture='environment'
              className='hidden'
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (archivo) decodificarFoto(archivo)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      ) : (
        <div className='relative flex-1'>
          <video ref={videoRef} className='h-full w-full object-cover' muted playsInline />
          <div className='pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-[#d17f7f]' />
        </div>
      )}
    </div>
  )
}
