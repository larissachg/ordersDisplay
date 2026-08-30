'use client'

import { useEffect, useState } from 'react'
import { Copy, X, Check } from 'lucide-react'
import { AlmacenInventario, ConteoResumen } from '@/interfaces/Inventario'

// Sheet inferior para crear conteo: almacen (si hay >1), tipo, y la opcion de
// copiar un conteo anterior.
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
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  // La mayoria de los dias se cuenta la misma lista: copiar un conteo previo del
  // mismo almacen y tipo evita rearmarla producto por producto. No se sugiere
  // ninguno solo: el usuario elige cual.
  const [previos, setPrevios] = useState<ConteoResumen[]>([])
  const [copiarDe, setCopiarDe] = useState<number | null>(null)
  const [eligiendo, setEligiendo] = useState(false)

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

    fetch('/api/inventario/conteos', { headers: { 'x-kds-pin': pin } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((lista: ConteoResumen[]) => setPrevios(lista))
      .catch(() => setPrevios([]))
  }, [pin])

  // Candidatos: mismo almacen, mismo tipo, con productos y no anulados.
  const candidatos =
    almacenId === null
      ? []
      : previos.filter(
          (c) =>
            c.almacenId === almacenId &&
            c.noVendibles === noVendibles &&
            c.contados > 0 &&
            c.estado !== 'anulado'
        )

  const elegido = candidatos.find((c) => c.conteoId === copiarDe)

  // Cambiar de almacen o tipo invalida la eleccion: los candidatos son otros.
  useEffect(() => {
    setCopiarDe(null)
    setEligiendo(false)
  }, [almacenId, noVendibles])

  // '2026-08-30 16:57:44' -> '30/08 16:57'
  const fechaCorta = (fecha: string) =>
    fecha.length >= 16 ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ${fecha.slice(11, 16)}` : fecha

  const crear = async () => {
    if (almacenId === null || creando) return
    setCreando(true)
    try {
      const resp = await fetch('/api/inventario/conteos', {
        method: 'POST',
        body: JSON.stringify({
          pin,
          almacenId,
          noVendibles,
          copiarDe
        })
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

        {candidatos.length > 0 && (
          <div className='space-y-2'>
            {elegido ? (
              <div className='flex items-center gap-3 rounded-lg border-2 border-[#80a76e] bg-[#f2f6ef] p-3'>
                <Copy className='h-5 w-5 shrink-0 text-[#5d8a4a]' />
                <span className='min-w-0 flex-1'>
                  <span className='block text-[15px] font-bold text-[#2c3236]'>
                    Copia del conteo #{elegido.conteoId}
                  </span>
                  <span className='block text-[13px] font-semibold text-[#8b949b]'>
                    {elegido.contados} productos · {fechaCorta(elegido.fechaCreacion)}
                  </span>
                </span>
                <button
                  onClick={() => setCopiarDe(null)}
                  aria-label='Quitar la copia'
                  className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#626e78]'
                >
                  <X className='h-4 w-4' />
                </button>
              </div>
            ) : eligiendo ? (
              <div className='max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[#dde0e3] p-2'>
                {candidatos.map((c) => (
                  <button
                    key={c.conteoId}
                    onClick={() => {
                      setCopiarDe(c.conteoId)
                      setEligiendo(false)
                    }}
                    className='flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-[#eef0f1]'
                  >
                    <Check className='h-4 w-4 shrink-0 text-[#b6bcc1]' />
                    <span className='min-w-0 flex-1'>
                      <span className='block text-[15px] font-bold text-[#2c3236]'>
                        Conteo #{c.conteoId} · {c.contados} productos
                      </span>
                      <span className='block text-[13px] font-semibold text-[#8b949b]'>
                        {fechaCorta(c.fechaCreacion)} · {c.meseroNombre} · {c.estado}
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setEligiendo(false)}
                  className='h-10 w-full rounded-lg text-sm font-bold text-[#626e78]'
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEligiendo(true)}
                className='flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#dde0e3] text-[15px] font-bold text-[#626e78]'
              >
                <Copy className='h-4 w-4' />
                Copiar de otro conteo
              </button>
            )}
          </div>
        )}

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
