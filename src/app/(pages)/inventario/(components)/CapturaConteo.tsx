'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Search, ScanBarcode, Check, MessageSquare, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { TecladoNumerico } from './TecladoNumerico'
import { EscanerCodigo } from './EscanerCodigo'
import { ConteoDetalleDb, ProductoContable, SesionInventario } from '@/interfaces/Inventario'

interface PayloadConteo {
  conteo: { conteoId: number; almacenNombre: string; noVendibles: boolean; estado: string }
  detalles: ConteoDetalleDb[]
  productos: ProductoContable[]
}

export const CapturaConteo = ({
  pin,
  sesion,
  conteoId,
  onVolver,
  onTerminar
}: {
  pin: string
  sesion: SesionInventario
  conteoId: number
  onVolver: () => void
  onTerminar: () => void
}) => {
  void sesion
  const [datos, setDatos] = useState<PayloadConteo | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [activo, setActivo] = useState<ProductoContable | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [observacion, setObservacion] = useState('')
  const [conObservacion, setConObservacion] = useState(false)
  const [escanerAbierto, setEscanerAbierto] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)
  // Modo rafaga: si el producto se eligio escaneando, al guardar se reabre la camara.
  const veniaDelEscanerRef = useRef(false)

  const cargar = useCallback(async () => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}`, {
      headers: { 'x-kds-pin': pin }
    })
    if (resp.ok) setDatos(await resp.json())
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  const contadosPorProducto = useMemo(() => {
    const mapa = new Map<number, number>()
    datos?.detalles.forEach((d) => mapa.set(d.productoId, d.cantidadContada))
    return mapa
  }, [datos])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = datos?.productos ?? []
    if (q === '') return lista
    return lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || (p.codigo !== '' && p.codigo.toLowerCase().includes(q))
    )
  }, [datos, busqueda])

  const grupos = useMemo(() => {
    const mapa = new Map<string, ProductoContable[]>()
    filtrados.forEach((p) => {
      const lista = mapa.get(p.tipoProducto) ?? []
      lista.push(p)
      mapa.set(p.tipoProducto, lista)
    })
    return Array.from(mapa.entries())
  }, [filtrados])

  // Memoizado: el escaner lo recibe dentro de onCodigo y no debe reiniciar la camara
  // en cada render.
  const abrirProducto = useCallback(
    (p: ProductoContable, desdeEscaner = false) => {
      veniaDelEscanerRef.current = desdeEscaner
      setActivo(p)
      const previa = contadosPorProducto.get(p.productoId)
      setCantidad(previa !== undefined ? String(previa).replace('.', ',') : '')
      setObservacion('')
      setConObservacion(false)
    },
    [contadosPorProducto]
  )

  const onCodigoEscaneado = useCallback(
    (codigo: string) => {
      const limpio = codigo.trim().toLowerCase()
      const matches = (datos?.productos ?? []).filter(
        (p) => p.codigo !== '' && p.codigo.toLowerCase() === limpio
      )
      if (matches.length === 1) {
        setEscanerAbierto(false)
        abrirProducto(matches[0], true)
      } else if (matches.length === 0) {
        toast.error(`Código no registrado: ${codigo}`)
      } else {
        setEscanerAbierto(false)
        setBusqueda(codigo)
      }
    },
    [datos, abrirProducto]
  )

  // Lector fisico (keyboard wedge): Enter en el buscador = match exacto por Codigo.
  const onEnterBuscador = () => {
    const codigo = busqueda.trim().toLowerCase()
    if (codigo === '') return
    const matches = (datos?.productos ?? []).filter((p) => p.codigo.toLowerCase() === codigo)
    if (matches.length === 1) {
      abrirProducto(matches[0])
      setBusqueda('')
    } else if (matches.length === 0) {
      toast.error(`Código no registrado: ${busqueda.trim()}`)
      setBusqueda('')
    }
    // matches > 1: se deja la lista filtrada para elegir a mano.
  }

  const guardar = async () => {
    if (activo === null) return
    const valor = parseFloat(cantidad.replace(',', '.'))
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Cantidad inválida')
      return
    }
    const resp = await fetch(`/api/inventario/conteos/${conteoId}/detalles`, {
      method: 'PUT',
      body: JSON.stringify({ pin, productoId: activo.productoId, cantidad: valor, observacion })
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      toast.error(data.error ?? 'No se pudo guardar la captura')
      return
    }
    setActivo(null)
    // Modo rafaga: volver a la camara si el producto vino de un escaneo.
    if (veniaDelEscanerRef.current) {
      veniaDelEscanerRef.current = false
      setEscanerAbierto(true)
    } else {
      buscadorRef.current?.focus()
    }
    await cargar()
  }

  if (datos === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  const total = datos.productos.length
  const contados = contadosPorProducto.size

  return (
    <div className='relative flex flex-1 flex-col overflow-hidden'>
      <div className='flex items-center gap-2 bg-[#626e78] py-3 pl-2 pr-3 text-white'>
        <button onClick={onVolver} className='flex h-11 w-11 items-center justify-center rounded-lg'>
          <ChevronLeft className='h-6 w-6' strokeWidth={2.5} />
        </button>
        <div className='flex-1'>
          <p className='text-lg font-bold leading-tight'>{datos.conteo.almacenNombre}</p>
          <p className='text-[13px] font-semibold opacity-75'>
            {datos.conteo.noVendibles ? 'No vendibles' : 'Vendibles'} · Conteo #{conteoId}
          </p>
        </div>
        <div className='text-right'>
          <p className='text-lg font-bold tabular-nums'>
            {contados} / {total}
          </p>
          <p className='text-xs font-semibold opacity-75'>contados</p>
        </div>
      </div>
      <div className='h-1.5 bg-[#4d575f]'>
        <div
          className='h-full bg-[#80a76e] transition-all'
          style={{ width: total > 0 ? `${(contados / total) * 100}%` : '0%' }}
        />
      </div>

      <div className='flex gap-2.5 px-4 py-3'>
        <div className='flex h-[52px] flex-1 items-center gap-2.5 rounded-lg border border-[#dde0e3] bg-white px-3.5'>
          <Search className='h-5 w-5 shrink-0 text-[#8b949b]' />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnterBuscador()
            }}
            placeholder='Buscar o escanear código…'
            className='w-full text-base font-semibold text-[#2c3236] outline-none placeholder:text-[#8b949b]'
          />
        </div>
        <button
          onClick={() => setEscanerAbierto(true)}
          className='flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-[#626e78] text-white'
        >
          <ScanBarcode className='h-6 w-6' />
        </button>
      </div>

      <div className='flex-1 space-y-2 overflow-y-auto px-4 pb-24'>
        {grupos.map(([grupo, productos]) => {
          const contadosGrupo = productos.filter((p) => contadosPorProducto.has(p.productoId)).length
          return (
            <div key={grupo} className='space-y-2'>
              <p className='sticky top-0 bg-[#eef0f1] py-1 text-[13px] font-bold uppercase tracking-widest text-[#8b949b]'>
                {grupo} · {contadosGrupo} de {productos.length}
              </p>
              {productos.map((p) => {
                const contado = contadosPorProducto.get(p.productoId)
                return (
                  <button
                    key={p.productoId}
                    onClick={() => abrirProducto(p)}
                    className='flex w-full items-center gap-3 rounded-[10px] border border-[#e5e8ea] bg-white px-4 py-3.5 text-left'
                  >
                    <span className='flex-1'>
                      <span className='block text-[16px] font-bold text-[#2c3236]'>{p.nombre}</span>
                      <span className='block text-sm font-semibold text-[#8b949b]'>
                        {[p.presentacion, p.unidad, p.codigo].filter((x) => x !== '').join(' · ')}
                      </span>
                    </span>
                    {contado !== undefined ? (
                      <span className='flex items-center gap-2 rounded-full bg-[#80a76e] px-3.5 py-2'>
                        <span className='text-[17px] font-bold tabular-nums text-[#2c3236]'>
                          {String(contado).replace('.', ',')}
                        </span>
                        <Check className='h-4 w-4 text-[#2c3236]' strokeWidth={3} />
                      </span>
                    ) : (
                      <span className='h-[34px] w-[34px] rounded-full border-2 border-dashed border-[#b6bcc1]' />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className='absolute inset-x-0 bottom-0 p-4'>
        <button
          onClick={onTerminar}
          disabled={contados === 0}
          className='flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2c3236] text-base font-bold text-white shadow-lg disabled:opacity-40'
        >
          Terminar conteo
          <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
        </button>
      </div>

      {activo !== null && (
        <div
          className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/35'
          onClick={() => setActivo(null)}
        >
          <div
            className='w-full space-y-3 rounded-t-2xl bg-white px-4 pb-6 pt-2.5 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mx-auto h-1.5 w-11 rounded-full bg-[#dde0e3]' />
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-lg font-bold text-[#2c3236]'>{activo.nombre}</p>
                <p className='text-[13px] font-semibold text-[#8b949b]'>
                  Cantidad{activo.unidad !== '' ? ` en ${activo.unidad}` : ''}
                </p>
              </div>
              <p className='border-b-[3px] border-[#80a76e] px-1.5 text-4xl font-bold tabular-nums text-[#2c3236]'>
                {cantidad === '' ? '0' : cantidad}
              </p>
            </div>
            <TecladoNumerico
              conComa
              onTecla={(d) =>
                setCantidad((c) => {
                  if (d === ',' && (c.includes(',') || c === '')) return c
                  return c.length < 12 ? c + d : c
                })
              }
              onBorrar={() => setCantidad((c) => c.slice(0, -1))}
            />
            {conObservacion && (
              <input
                autoFocus
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder='Observación'
                className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
              />
            )}
            <div className='flex gap-2.5'>
              <button
                onClick={() => setConObservacion((v) => !v)}
                className='flex h-14 w-14 items-center justify-center rounded-lg border border-[#dde0e3] text-[#626e78]'
              >
                <MessageSquare className='h-5 w-5' />
              </button>
              <button
                onClick={guardar}
                disabled={cantidad === ''}
                className='flex h-14 flex-1 items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
              >
                Guardar y siguiente
                <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      <EscanerCodigo
        abierto={escanerAbierto}
        onCerrar={() => setEscanerAbierto(false)}
        onCodigo={onCodigoEscaneado}
      />
    </div>
  )
}
