'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Lock, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { derivarRevision } from '@/utils/conteoInventario'
import { puedeAplicar, puedeReabrir, puedeAnular } from '@/contants/inventario'
import { ConteoDetalleDb, ConteoResumen, SesionInventario } from '@/interfaces/Inventario'
import { PinGate } from './PinGate'

type Filtro = 'todos' | 'diferencia' | 'deriva'

export const RevisionConteo = ({
  pin,
  sesion,
  conteoId,
  onVolver
}: {
  pin: string
  sesion: SesionInventario
  conteoId: number
  onVolver: () => void
}) => {
  const [conteo, setConteo] = useState<ConteoResumen | null>(null)
  const [detalles, setDetalles] = useState<ConteoDetalleDb[]>([])
  const [conDiferencias, setConDiferencias] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  // accion pendiente que exige re-tecleo de PIN
  const [confirmando, setConfirmando] = useState<'aplicar' | 'anular' | null>(null)

  const cargar = useCallback(async () => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}`, {
      headers: { 'x-kds-pin': pin }
    })
    if (!resp.ok) return
    const data = await resp.json()
    setConteo(data.conteo)
    setDetalles(data.detalles)
    setConDiferencias(data.conDiferencias)
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const revision = useMemo(() => derivarRevision(detalles), [detalles])
  const filas = useMemo(() => {
    if (filtro === 'diferencia') return revision.filas.filter((f) => f.delta !== 0)
    if (filtro === 'deriva') return revision.filas.filter((f) => f.deriva)
    return revision.filas
  }, [revision, filtro])
  const conDif = revision.filas.filter((f) => f.delta !== 0).length
  const conDeriva = revision.filas.filter((f) => f.deriva).length

  const ejecutar = async (accion: 'aplicar' | 'anular' | 'reabrir', pinConfirmado?: string) => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}/${accion}`, {
      method: 'POST',
      body: JSON.stringify({ pin: pinConfirmado ?? pin })
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      toast.error(data.error ?? `No se pudo ${accion}`)
      return
    }
    toast.success(data.message ?? 'Listo')
    if (accion === 'reabrir') onVolver()
    else await cargar()
  }

  if (conteo === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  const fmtBs = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}Bs ${Math.abs(n).toFixed(2)}`
  const fmtNum = (n: number) => String(n).replace('.', ',')
  const enRevision = conteo.estado === 'revision'

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div
        className='flex items-center gap-2 py-3 pl-2 pr-3'
        style={{
          backgroundColor: enRevision ? '#eac568' : '#626e78',
          color: enRevision ? '#2c3236' : '#ffffff'
        }}
      >
        <button onClick={onVolver} className='flex h-11 w-11 items-center justify-center rounded-lg'>
          <ChevronLeft className='h-6 w-6' strokeWidth={2.5} />
        </button>
        <div className='flex-1'>
          <p className='text-lg font-bold uppercase leading-tight tracking-wide'>
            {conteo.estado === 'aplicado'
              ? `Ajuste #${conteo.ajusteId ?? ''}`
              : conteo.estado === 'anulado'
                ? 'Anulado'
                : 'Revisión'}
          </p>
          <p className='text-[13px] font-semibold opacity-80'>
            {conteo.almacenNombre} · Conteo #{conteoId} · {conteo.meseroNombre}
          </p>
        </div>
        <span className='rounded-full bg-[#2c3236] px-3 py-1.5 text-[13px] font-bold tabular-nums text-white'>
          {detalles.length} contados
        </span>
      </div>

      {conDiferencias && (
        <div className='flex gap-px bg-[#dde0e3]'>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Sobrante</p>
            <p className='text-xl font-bold tabular-nums text-[#5d8a4a]'>{fmtBs(revision.sobrante)}</p>
          </div>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Faltante</p>
            <p className='text-xl font-bold tabular-nums text-[#b85c5c]'>{fmtBs(revision.faltante)}</p>
          </div>
          <div className='flex-1 bg-white px-4 py-3'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>Neto</p>
            <p className='text-xl font-bold tabular-nums text-[#2c3236]'>{fmtBs(revision.neto)}</p>
          </div>
        </div>
      )}

      {conDiferencias && (
        <div className='flex gap-2 px-4 pb-1 pt-3'>
          {(
            [
              ['todos', `Todos (${revision.filas.length})`],
              ['diferencia', `Con diferencia (${conDif})`],
              ['deriva', `Deriva (${conDeriva})`]
            ] as [Filtro, string][]
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setFiltro(clave)}
              className={
                filtro === clave
                  ? 'h-11 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                  : 'h-11 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      {conDiferencias && (
        <div className='flex justify-end px-8 pt-1.5 text-xs font-bold uppercase tracking-wider text-[#8b949b]'>
          <span className='w-[60px] text-right'>Sistema</span>
          <span className='w-[62px] text-right'>Contado</span>
          <span className='w-[44px] text-right'>Dif</span>
        </div>
      )}

      <div className='flex-1 space-y-2 overflow-y-auto px-4 pb-4 pt-1.5'>
        {filas.map((f) => (
          <div
            key={f.productoId}
            className='space-y-2 rounded-[10px] border border-[#e5e8ea] bg-white px-4 py-3'
          >
            <div className='flex items-center gap-3'>
              <div className='flex-1'>
                <p className='text-[16px] font-bold text-[#2c3236]'>{f.nombre}</p>
                <p className='text-[13px] font-semibold text-[#8b949b]'>
                  {[
                    f.unidad,
                    f.fechaConteo.slice(11, 16),
                    f.observacion !== '' ? `"${f.observacion}"` : ''
                  ]
                    .filter((x) => x !== '')
                    .join(' · ')}
                </p>
              </div>
              {conDiferencias ? (
                <div className='flex items-baseline tabular-nums'>
                  <span className='w-[60px] text-right text-[17px] font-semibold text-[#8b949b]'>
                    {fmtNum(f.stockSnapshot)}
                  </span>
                  <span className='w-[62px] text-right text-[17px] font-bold text-[#2c3236]'>
                    {fmtNum(f.cantidadContada)}
                  </span>
                  <span
                    className='w-[44px] text-right text-[17px] font-bold'
                    style={{ color: f.delta > 0 ? '#5d8a4a' : f.delta < 0 ? '#b85c5c' : '#8b949b' }}
                  >
                    {f.delta > 0 ? `+${fmtNum(f.delta)}` : fmtNum(f.delta)}
                  </span>
                </div>
              ) : (
                <span className='text-[17px] font-bold tabular-nums text-[#2c3236]'>
                  {fmtNum(f.cantidadContada)}
                </span>
              )}
            </div>
            {conDiferencias && f.deriva && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-[#f7ecd2] px-3 py-1 text-xs font-bold text-[#8a6d1f]'>
                <TriangleAlert className='h-3.5 w-3.5' />
                Movió desde la captura (sistema hoy: {fmtNum(f.stockVivo)})
              </span>
            )}
          </div>
        ))}
      </div>

      {enRevision && conDiferencias && (
        <div className='space-y-2.5 bg-white p-4 pb-5 shadow-[0_-2px_12px_rgba(44,50,54,0.12)]'>
          {puedeAplicar(sesion.tipoUsuarioId) && (
            <button
              onClick={() => setConfirmando('aplicar')}
              className='flex h-14 w-full items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236]'
            >
              <Lock className='h-5 w-5' />
              Aplicar ajuste · pide PIN
            </button>
          )}
          <div className='flex gap-2.5'>
            {puedeReabrir(sesion.tipoUsuarioId) && (
              <button
                onClick={() => ejecutar('reabrir')}
                className='h-12 flex-1 rounded-lg border border-[#dde0e3] text-base font-bold text-[#2c3236]'
              >
                Reabrir conteo
              </button>
            )}
            {puedeAnular(sesion.tipoUsuarioId, conteo.meseroId === sesion.meseroId, conteo.estado) && (
              <button
                onClick={() => setConfirmando('anular')}
                className='h-12 flex-1 rounded-lg border border-[#e6c9c9] text-base font-bold text-[#b85c5c]'
              >
                Anular
              </button>
            )}
          </div>
        </div>
      )}

      {confirmando !== null && (
        <div
          className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/50'
          onClick={() => setConfirmando(null)}
        >
          <div className='w-full rounded-t-2xl bg-white pb-4 pt-2' onClick={(e) => e.stopPropagation()}>
            <PinGate
              titulo={
                confirmando === 'aplicar'
                  ? 'Confirmá con tu PIN para aplicar'
                  : 'Confirmá con tu PIN para anular'
              }
              onSesion={(pinConfirmado) => {
                const accion = confirmando
                setConfirmando(null)
                ejecutar(accion, pinConfirmado)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
