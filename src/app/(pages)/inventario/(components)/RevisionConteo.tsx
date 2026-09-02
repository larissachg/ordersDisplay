'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Lock, TriangleAlert, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { derivarRevision } from '@/utils/conteoInventario'
import { puedeAplicar, puedeReabrir, puedeAnular } from '@/contants/inventario'
import { ConteoDetalleDb, ConteoResumen, SesionInventario } from '@/interfaces/Inventario'
import { PinGate } from './PinGate'

type Filtro = 'todos' | 'diferencia' | 'deriva' | 'copiado'

// Anchos compartidos entre el encabezado y las filas: si divergen, las columnas
// dejan de alinearse. El encabezado ademas repite el padding y el borde de la
// tarjeta (border + px-4) para caer en la misma grilla.
const COL_STOCK = 'w-[72px] shrink-0 overflow-hidden text-right'
const COL_CONTADO = 'w-[72px] shrink-0 overflow-hidden pl-2 text-right'
const COL_DIF = 'w-[64px] shrink-0 overflow-hidden pl-2 text-right'

export const RevisionConteo = ({
  pin,
  sesion,
  conteoId,
  onVolver,
  onReabierto
}: {
  pin: string
  sesion: SesionInventario
  conteoId: number
  onVolver: () => void
  // Reabrir devuelve el conteo a captura: lo natural es caer ahi, no en la lista.
  onReabierto: () => void
}) => {
  const [conteo, setConteo] = useState<ConteoResumen | null>(null)
  const [detalles, setDetalles] = useState<ConteoDetalleDb[]>([])
  const [conDiferencias, setConDiferencias] = useState(false)
  // Cuantos productos tenia el catalogo del conteo: la diferencia con los
  // capturados son los que NO se van a ajustar.
  const [totalContables, setTotalContables] = useState(0)
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
    setTotalContables(data.totalContables ?? 0)
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const revision = useMemo(() => derivarRevision(detalles), [detalles])
  const filas = useMemo(() => {
    if (filtro === 'diferencia') return revision.filas.filter((f) => f.delta !== 0)
    if (filtro === 'deriva') return revision.filas.filter((f) => f.deriva)
    if (filtro === 'copiado') return revision.filas.filter((f) => f.copiado)
    return revision.filas
  }, [revision, filtro])
  const conDif = revision.filas.filter((f) => f.delta !== 0).length
  const conDeriva = revision.filas.filter((f) => f.deriva).length
  const sinRecontar = revision.filas.filter((f) => f.copiado).length

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
    if (accion === 'reabrir') onReabierto()
    else await cargar()
  }

  if (conteo === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  // Sin 'Bs' y con coma decimal: la moneda se dice una vez en el rotulo, si no
  // el valor no entra en un tercio del ancho y se parte en dos lineas.
  const fmtBs = (n: number) =>
    `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`
  // El stock del POS es float y llega con basura de coma flotante
  // (-1.7333333333333334): se redondea a 3 decimales y se recortan los ceros,
  // si no el numero desborda su columna y se monta sobre la de al lado.
  const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')
  const enRevision = conteo.estado === 'revision'
  const sinContar = totalContables > 0 ? Math.max(0, totalContables - detalles.length) : 0

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      {/* Una sola linea, igual que la captura: el estado adelante y el resto en
          tono apagado, que es contexto y no titulo. */}
      <div
        className='flex items-center gap-1.5 py-1.5 pl-1 pr-3'
        style={{
          backgroundColor: enRevision ? '#eac568' : '#626e78',
          color: enRevision ? '#2c3236' : '#ffffff'
        }}
      >
        <button
          onClick={onVolver}
          aria-label='Volver a la lista de conteos'
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'
        >
          <ChevronLeft className='h-5 w-5' strokeWidth={2.5} />
        </button>
        <p className='min-w-0 flex-1 truncate text-[15px] font-bold uppercase leading-tight tracking-wide'>
          {conteo.estado === 'aplicado'
            ? `Ajuste #${conteo.ajusteId ?? ''}`
            : conteo.estado === 'anulado'
              ? 'Anulado'
              : 'Revisión'}
          <span className='font-semibold normal-case tracking-normal opacity-75'>
            {' · '}
            {conteo.almacenNombre} · #{conteoId} · {conteo.meseroNombre}
          </span>
        </p>
        <span className='shrink-0 rounded-full bg-[#2c3236] px-2.5 py-1 text-[13px] font-bold tabular-nums text-white'>
          {detalles.length}
          {totalContables > 0 ? `/${totalContables}` : ''}
        </span>
      </div>

      {conteo.observacion !== '' && (
        <p className='bg-[#f7ecd2] px-4 py-2.5 text-[13px] font-semibold text-[#8a6d1f]'>
          &quot;{conteo.observacion}&quot;
        </p>
      )}

      {sinContar > 0 && (
        <p className='flex items-center gap-2 bg-[#f7ecd2] px-4 py-2.5 text-[13px] font-semibold text-[#8a6d1f]'>
          <TriangleAlert className='h-4 w-4 shrink-0' />
          {sinContar} de {totalContables} productos quedaron sin contar. No se ajustan: su
          stock queda como está.
        </p>
      )}

      {sinRecontar > 0 && (
        <p className='flex items-center gap-2 bg-[#eef0f1] px-4 py-2.5 text-[13px] font-semibold text-[#626e78]'>
          <Copy className='h-4 w-4 shrink-0' />
          {sinRecontar} cantidad{sinRecontar === 1 ? '' : 'es'} viene{sinRecontar === 1 ? '' : 'n'}
          {' '}copiada{sinRecontar === 1 ? '' : 's'} de un conteo anterior y nadie las volvió a
          contar. Se aplican igual.
        </p>
      )}

      {conDiferencias && (
        <div className='flex gap-px bg-[#dde0e3]'>
          <div className='flex-1 bg-white px-3 py-2'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>
              Sobrante <span className='opacity-70'>Bs</span>
            </p>
            <p className='whitespace-nowrap text-lg font-bold tabular-nums text-[#5d8a4a]'>{fmtBs(revision.sobrante)}</p>
          </div>
          <div className='flex-1 bg-white px-3 py-2'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>
              Faltante <span className='opacity-70'>Bs</span>
            </p>
            <p className='whitespace-nowrap text-lg font-bold tabular-nums text-[#b85c5c]'>{fmtBs(revision.faltante)}</p>
          </div>
          <div className='flex-1 bg-white px-3 py-2'>
            <p className='text-xs font-bold uppercase tracking-wider text-[#8b949b]'>
              Neto <span className='opacity-70'>Bs</span>
            </p>
            <p className='whitespace-nowrap text-lg font-bold tabular-nums text-[#2c3236]'>{fmtBs(revision.neto)}</p>
          </div>
        </div>
      )}

      {conDiferencias && (
        <div className='flex gap-2 overflow-x-auto px-3 pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          {(
            [
              ['todos', `Todos (${revision.filas.length})`],
              ['diferencia', `Con diferencia (${conDif})`],
              ['deriva', `Se movió (${conDeriva})`],
              ...(sinRecontar > 0
                ? ([['copiado', `Sin recontar (${sinRecontar})`]] as [Filtro, string][])
                : [])
            ] as [Filtro, string][]
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setFiltro(clave)}
              className={
                filtro === clave
                  ? 'h-9 shrink-0 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                  : 'h-9 shrink-0 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}

      {conDiferencias && (
        <div className='px-3 pt-1.5'>
          <div className='flex justify-end border border-transparent px-4 text-[11px] font-bold uppercase tracking-wider text-[#8b949b]'>
            <span className={COL_STOCK}>Stock</span>
            <span className={COL_CONTADO}>Contado</span>
            <span className={COL_DIF}>Dif</span>
          </div>
        </div>
      )}

      <div className='flex-1 space-y-2 overflow-y-auto px-3 pb-4 pt-1.5'>
        {filas.map((f) => (
          <div
            key={f.productoId}
            className='space-y-2 rounded-[10px] border border-[#e5e8ea] bg-white px-4 py-3'
          >
            {/* El nombre ocupa su propia linea entera: truncado no se distinguen
                dos productos de la misma familia ("AROS GRAN...", "PAPAS GRA..."). */}
            <p className='text-[16px] font-bold leading-snug text-[#2c3236]'>{f.nombre}</p>
            <div className='flex items-baseline gap-2'>
              <p className='min-w-0 flex-1 truncate text-[13px] font-semibold text-[#8b949b]'>
                {[
                  f.presentacion,
                  f.fechaConteo.slice(11, 16),
                  f.observacion !== '' ? `"${f.observacion}"` : ''
                ]
                  .filter((x) => x !== '')
                  .join(' · ')}
              </p>
              {conDiferencias ? (
                <div className='flex shrink-0 items-baseline tabular-nums'>
                  <span className={`${COL_STOCK} text-[15px] font-semibold text-[#8b949b]`}>
                    {fmtNum(f.stockSnapshot)}
                  </span>
                  <span className={`${COL_CONTADO} text-[15px] font-bold text-[#2c3236]`}>
                    {fmtNum(f.cantidadContada)}
                  </span>
                  <span
                    className={`${COL_DIF} text-[15px] font-bold`}
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
            {f.copiado && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-[#eef0f1] px-3 py-1 text-xs font-bold text-[#626e78]'>
                <Copy className='h-3.5 w-3.5' />
                Copiado, sin recontar
              </span>
            )}
            {conDiferencias && f.deriva && (
              <span className='inline-flex items-center gap-1.5 rounded-full bg-[#f7ecd2] px-3 py-1 text-xs font-bold text-[#8a6d1f]'>
                <TriangleAlert className='h-3.5 w-3.5' />
                Movió desde la captura (stock hoy: {fmtNum(f.stockVivo)})
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
            {confirmando === 'aplicar' && (
              <p className='px-6 pb-1 pt-2 text-center text-[13px] font-semibold text-[#626e78]'>
                Se ajustan {revision.filas.filter((f) => f.delta !== 0).length} productos con
                diferencia, de {detalles.length} contados
                {sinContar > 0 ? ` · ${sinContar} sin contar quedan fuera` : ''}.
              </p>
            )}
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
