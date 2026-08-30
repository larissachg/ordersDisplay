'use client'

import { useEffect, useState } from 'react'
import { AlmacenInventario } from '@/interfaces/Inventario'

// Sheet inferior para crear conteo: almacen (si hay >1), tipo, observacion.
export const NuevoConteoSheet = ({
  pin,
  onCreado,
  onCerrar
}: {
  pin: string
  onCreado: (conteoId: number) => void
  onCerrar: () => void
}) => {
  const [almacenes, setAlmacenes] = useState<AlmacenInventario[]>([])
  const [cargados, setCargados] = useState(false)
  const [almacenId, setAlmacenId] = useState<number | null>(null)
  const [noVendibles, setNoVendibles] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    fetch('/api/inventario/almacenes', { headers: { 'x-kds-pin': pin } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((lista: AlmacenInventario[]) => {
        setAlmacenes(lista)
        if (lista.length >= 1) setAlmacenId(lista[0].almacenId)
        setCargados(true)
      })
      .catch(() => {
        setError('No se pudieron cargar los almacenes')
        setCargados(true)
      })
  }, [pin])

  const crear = async () => {
    if (almacenId === null || creando) return
    setCreando(true)
    try {
      const resp = await fetch('/api/inventario/conteos', {
        method: 'POST',
        body: JSON.stringify({ pin, almacenId, noVendibles, observacion })
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.error ?? 'Error al crear el conteo')
        return
      }
      onCreado(data.conteoId)
    } catch {
      setError('Sin conexión con el servidor')
    } finally {
      setCreando(false)
    }
  }

  // Degradacion: POS sin tabla Almacenes o sin almacenes internos visibles.
  const sinAlmacenes = cargados && almacenes.length === 0 && error === ''

  return (
    <div className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/35' onClick={onCerrar}>
      <div
        className='w-full space-y-4 rounded-t-2xl bg-white p-4 pb-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mx-auto h-1.5 w-11 rounded-full bg-[#dde0e3]' />
        <h2 className='text-lg font-bold text-[#2c3236]'>Nuevo conteo</h2>
        {error !== '' && <p className='text-sm font-semibold text-[#b85c5c]'>{error}</p>}
        {sinAlmacenes && (
          <p className='text-sm font-semibold text-[#8b949b]'>
            El POS no tiene almacenes configurados para contar.
          </p>
        )}

        {almacenes.length > 1 && (
          <div className='space-y-2'>
            <p className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>Almacén</p>
            <div className='flex flex-wrap gap-2'>
              {almacenes.map((a) => (
                <button
                  key={a.almacenId}
                  onClick={() => setAlmacenId(a.almacenId)}
                  className={
                    a.almacenId === almacenId
                      ? 'h-11 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                      : 'h-11 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
                  }
                >
                  {a.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className='space-y-2'>
          <p className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>Tipo</p>
          <div className='flex gap-2'>
            <button
              onClick={() => setNoVendibles(false)}
              className={
                !noVendibles
                  ? 'h-11 flex-1 rounded-lg bg-[#626e78] text-sm font-bold text-white'
                  : 'h-11 flex-1 rounded-lg border border-[#dde0e3] text-sm font-bold text-[#626e78]'
              }
            >
              Vendibles
            </button>
            <button
              onClick={() => setNoVendibles(true)}
              className={
                noVendibles
                  ? 'h-11 flex-1 rounded-lg bg-[#626e78] text-sm font-bold text-white'
                  : 'h-11 flex-1 rounded-lg border border-[#dde0e3] text-sm font-bold text-[#626e78]'
              }
            >
              No vendibles
            </button>
          </div>
        </div>

        <input
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder='Observación (opcional)'
          className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
        />

        <button
          onClick={crear}
          disabled={almacenId === null || creando}
          className='flex h-14 w-full items-center justify-center rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
        >
          {creando ? 'Creando…' : 'Empezar a contar'}
        </button>
      </div>
    </div>
  )
}
