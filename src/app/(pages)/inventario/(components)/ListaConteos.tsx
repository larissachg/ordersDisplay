'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { ConteoResumen, SesionInventario } from '@/interfaces/Inventario'
import { puedeVerDiferencias } from '@/contants/inventario'

const COLOR_ESTADO: Record<string, string> = {
  abierto: '#80a76e',
  revision: '#eac568',
  aplicado: '#626e78',
  anulado: '#d17f7f'
}

export const ListaConteos = ({
  pin,
  sesion,
  onAbrirCaptura,
  onAbrirRevision,
  onNuevo
}: {
  pin: string
  sesion: SesionInventario
  onAbrirCaptura: (conteoId: number) => void
  onAbrirRevision: (conteoId: number) => void
  onNuevo: () => void
}) => {
  const [conteos, setConteos] = useState<ConteoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const resp = await fetch('/api/inventario/conteos', {
        headers: { 'x-kds-pin': pin }
      })
      if (!resp.ok) throw new Error()
      setConteos(await resp.json())
      setError('')
    } catch {
      setError('No se pudieron cargar los conteos')
    } finally {
      setCargando(false)
    }
  }, [pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activos = conteos.filter((c) => c.estado === 'abierto' || c.estado === 'revision')
  const historicos = conteos.filter((c) => c.estado === 'aplicado' || c.estado === 'anulado')
  const esSupervisor = puedeVerDiferencias(sesion.tipoUsuarioId)

  const abrir = (c: ConteoResumen) => {
    if (c.estado === 'abierto' && c.meseroId === sesion.meseroId) onAbrirCaptura(c.conteoId)
    else if (esSupervisor || c.estado !== 'abierto') onAbrirRevision(c.conteoId)
  }

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div className='flex-1 space-y-4 overflow-y-auto px-4 pt-4'>
        {cargando && <p className='text-center text-[#8b949b]'>Cargando…</p>}
        {error !== '' && <p className='text-center font-semibold text-[#b85c5c]'>{error}</p>}

        {activos.length > 0 && (
          <section className='space-y-2.5'>
            <h2 className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>
              En curso
            </h2>
            {activos.map((c) => (
              <button
                key={c.conteoId}
                onClick={() => abrir(c)}
                className='w-full rounded-[10px] bg-white p-4 text-left shadow-sm'
              >
                <div className='flex items-center justify-between gap-2.5'>
                  <span className='text-lg font-bold text-[#2c3236]'>{c.almacenNombre}</span>
                  <span
                    className='rounded-full px-3 py-1 text-xs font-bold uppercase text-[#2c3236]'
                    style={{ backgroundColor: COLOR_ESTADO[c.estado] }}
                  >
                    {c.estado === 'revision' ? 'Revisión' : c.estado}
                  </span>
                </div>
                <p className='mt-1.5 text-sm font-semibold text-[#8b949b]'>
                  {c.noVendibles ? 'No vendibles' : 'Vendibles'} · Conteo #{c.conteoId} ·{' '}
                  {c.meseroNombre} · {c.contados} contados
                </p>
              </button>
            ))}
          </section>
        )}

        {historicos.length > 0 && (
          <section className='space-y-2.5'>
            <h2 className='text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>
              Últimos 7 días
            </h2>
            <div className='divide-y divide-[#eef0f1] rounded-[10px] bg-white shadow-sm'>
              {historicos.map((c) => (
                <button
                  key={c.conteoId}
                  onClick={() => abrir(c)}
                  className='flex w-full items-center gap-3 px-4 py-3.5 text-left'
                >
                  <span
                    className='h-2.5 w-2.5 shrink-0 rounded-full'
                    style={{ backgroundColor: COLOR_ESTADO[c.estado] }}
                  />
                  <span className='flex-1'>
                    <span className='block text-[15px] font-bold text-[#2c3236]'>
                      {c.almacenNombre}
                      {c.noVendibles ? ' · No vendibles' : ''}
                    </span>
                    <span className='block text-[13px] font-semibold text-[#8b949b]'>
                      {c.estado === 'aplicado'
                        ? `Aplicado ${c.fechaAplicacion ?? ''}${c.ajusteId ? ` · Ajuste #${c.ajusteId}` : ''}`
                        : `Anulado · por ${c.meseroNombre}`}
                    </span>
                  </span>
                  <ChevronRight className='h-4 w-4 text-[#b6bcc1]' />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className='px-4 pb-5 pt-3.5'>
        <button
          onClick={onNuevo}
          className='flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] shadow-md'
        >
          <Plus className='h-5 w-5' strokeWidth={2.5} />
          Nuevo conteo
        </button>
      </div>
    </div>
  )
}
