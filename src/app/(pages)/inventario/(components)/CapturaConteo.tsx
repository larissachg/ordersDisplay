'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  Search,
  ScanBarcode,
  Check,
  MessageSquare,
  ChevronRight,
  CloudOff,
  RefreshCw,
  Copy
} from 'lucide-react'
import { toast } from 'sonner'
import { TecladoNumerico } from './TecladoNumerico'
import { EscanerCodigo } from './EscanerCodigo'
import { ConteoDetalleDb, ProductoContable, SesionInventario } from '@/interfaces/Inventario'

// Rango de marcas diacriticas combinantes que deja NFD (acentos, dieresis):
// U+0300 a U+036F. Se arma con fromCharCode para no meter caracteres
// invisibles en el fuente.
const DIACRITICOS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']',
  'g'
)

// Compara sin acentos ni mayusculas: "cafe" tiene que encontrar "CAFÉ".
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()

// Los stocks del POS son float y llegan con basura de coma flotante.
const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')

// Valor del chip "Ya contados". No es una categoria: se usa un sentinel que no
// puede coincidir con un TiposProductos.Descripcion real.
const CHIP_CONTADOS = '__contados__'

// Captura guardada en el dispositivo pero todavia no confirmada por el servidor.
interface CapturaPendiente {
  productoId: number
  nombre: string
  cantidad: number
  observacion: string
  // Version de la captura: si el usuario recuenta el producto mientras hay un
  // reintento en vuelo, el viejo no puede pisar al nuevo al confirmarse.
  seq: number
}

type ResultadoEnvio = 'ok' | 'reintentar' | 'permanente'

// Backoff de la cola de reintento: 2s, 4s, 8s, y de ahi cada 15s.
const esperaReintento = (ronda: number) => Math.min(15000, 2000 * 2 ** ronda)

interface PayloadConteo {
  conteo: { conteoId: number; almacenNombre: string; noVendibles: boolean; estado: string }
  detalles: ConteoDetalleDb[]
  productos: ProductoContable[]
  conDiferencias: boolean
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
  onTerminar: (observacion: string) => void
}) => {
  void sesion
  const [datos, setDatos] = useState<PayloadConteo | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  // Un conteo copiado abre directo en "Contados": lo unico que queda por
  // hacer es corregir cantidades, no recorrer el catalogo entero.
  const filtroInicialAplicadoRef = useRef(false)
  const [terminando, setTerminando] = useState(false)
  const [obsConteo, setObsConteo] = useState('')
  const [activo, setActivo] = useState<ProductoContable | null>(null)
  const [cantidad, setCantidad] = useState('')
  // La cantidad mostrada viene del conteo previo y todavia no se toco: la
  // primera tecla la reemplaza en vez de concatenar (si no, sobre un 10 tipear
  // 9 daba 109).
  const [cantidadEsPrevia, setCantidadEsPrevia] = useState(false)
  const esPreviaRef = useRef(false)
  const [observacion, setObservacion] = useState('')
  const [conObservacion, setConObservacion] = useState(false)
  const [escanerAbierto, setEscanerAbierto] = useState(false)
  // Cola de capturas que no llegaron al servidor (red caida o 5xx). Se reintenta
  // sola; los 4xx no entran aca porque repetirlos no los arregla.
  const [pendientes, setPendientes] = useState<CapturaPendiente[]>([])
  const [reintentando, setReintentando] = useState(false)
  const rondaRef = useRef(0)
  const seqRef = useRef(0)
  const pendientesRef = useRef<CapturaPendiente[]>([])
  // Evita que dos rondas de la cola corran a la vez (timer + boton + evento online).
  const enviandoRef = useRef(false)
  const buscadorRef = useRef<HTMLInputElement>(null)
  // Modo rafaga: si el producto se eligio escaneando, al guardar se reabre la camara.
  const veniaDelEscanerRef = useRef(false)

  pendientesRef.current = pendientes

  const cargar = useCallback(async () => {
    const resp = await fetch(`/api/inventario/conteos/${conteoId}`, {
      headers: { 'x-kds-pin': pin }
    })
    if (resp.ok) setDatos(await resp.json())
  }, [conteoId, pin])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (datos === null || filtroInicialAplicadoRef.current) return
    filtroInicialAplicadoRef.current = true
    if (datos.detalles.length > 0) setCategoria(CHIP_CONTADOS)
  }, [datos])

  const contadosPorProducto = useMemo(() => {
    const mapa = new Map<number, number>()
    datos?.detalles.forEach((d) => mapa.set(d.productoId, d.cantidadContada))
    // Lo pendiente ya cuenta como capturado en pantalla: el usuario sigue
    // avanzando y la cola se encarga de que llegue.
    pendientes.forEach((p) => mapa.set(p.productoId, p.cantidad))
    return mapa
  }, [datos, pendientes])

  const pendientePorProducto = useMemo(
    () => new Set(pendientes.map((p) => p.productoId)),
    [pendientes]
  )

  // Cantidades heredadas de un conteo anterior que todavia nadie reconto.
  const copiadoPorProducto = useMemo(
    () => new Set((datos?.detalles ?? []).filter((d) => d.copiado).map((d) => d.productoId)),
    [datos]
  )

  // Categorias con su avance, para los chips de filtro sobre el buscador.
  const categorias = useMemo(() => {
    const mapa = new Map<string, { total: number; contados: number }>()
    ;(datos?.productos ?? []).forEach((p) => {
      const acc = mapa.get(p.tipoProducto) ?? { total: 0, contados: 0 }
      acc.total++
      if (contadosPorProducto.has(p.productoId)) acc.contados++
      mapa.set(p.tipoProducto, acc)
    })
    return Array.from(mapa.entries())
  }, [datos, contadosPorProducto])

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const lista = (datos?.productos ?? []).filter((p) => {
      if (categoria === '') return true
      if (categoria === CHIP_CONTADOS) return contadosPorProducto.has(p.productoId)
      return p.tipoProducto === categoria
    })
    if (q === '') return lista
    // La busqueda tambien pega contra la categoria: tipear "bebida" trae toda
    // la categoria, no solo los productos que la nombran.
    return lista.filter(
      (p) =>
        normalizar(p.nombre).includes(q) ||
        normalizar(p.tipoProducto).includes(q) ||
        (p.codigo !== '' && normalizar(p.codigo).includes(q))
    )
  }, [datos, busqueda, categoria, contadosPorProducto])

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
      setCantidad(previa !== undefined ? fmtNum(previa) : '')
      esPreviaRef.current = previa !== undefined
      setCantidadEsPrevia(previa !== undefined)
      setObservacion('')
      setConObservacion(false)
    },
    [contadosPorProducto]
  )

  // El flag se lee ANTES de bajarlo: con dos teclas rapidas, la segunda ya ve
  // false y concatena, que es lo correcto.
  const escribirDigito = useCallback((tecla: string) => {
    const reemplazar = esPreviaRef.current
    esPreviaRef.current = false
    setCantidadEsPrevia(false)
    setCantidad((c) => {
      const base = reemplazar ? '' : c
      if (tecla === ',' && (base.includes(',') || base === '')) return base
      return base.length < 12 ? base + tecla : base
    })
  }, [])

  const borrarDigito = useCallback(() => {
    esPreviaRef.current = false
    setCantidadEsPrevia(false)
    setCantidad((c) => c.slice(0, -1))
  }, [])

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

  // El PUT del servidor es un upsert por (ConteoID, ProductoID) con UNIQUE, asi
  // que reenviar la misma captura nunca duplica: a lo sumo reescribe la fila.
  const enviarCaptura = useCallback(
    async (item: CapturaPendiente): Promise<ResultadoEnvio> => {
      try {
        const resp = await fetch(`/api/inventario/conteos/${conteoId}/detalles`, {
          method: 'PUT',
          body: JSON.stringify({
            pin,
            productoId: item.productoId,
            cantidad: item.cantidad,
            observacion: item.observacion
          })
        })
        if (resp.ok) return 'ok'
        // 5xx puede ser pasajero; un 4xx (conteo cerrado, de otro usuario,
        // cantidad invalida) no se arregla repitiendolo.
        if (resp.status >= 500) return 'reintentar'
        const data = await resp.json().catch(() => ({}))
        toast.error(data.error ?? 'No se pudo guardar la captura')
        return 'permanente'
      } catch {
        return 'reintentar' // sin red
      }
    },
    [conteoId, pin]
  )

  const quitarDeLaCola = (productoId: number, seq: number) =>
    setPendientes((prev) => prev.filter((x) => !(x.productoId === productoId && x.seq === seq)))

  const procesarCola = useCallback(async () => {
    if (enviandoRef.current || pendientesRef.current.length === 0) return
    enviandoRef.current = true
    setReintentando(true)
    try {
      let alguno = false
      for (const item of [...pendientesRef.current]) {
        const resultado = await enviarCaptura(item)
        if (resultado === 'reintentar') {
          // Sigue sin haber red: no tiene sentido martillar el resto de la cola.
          rondaRef.current += 1
          break
        }
        alguno = true
        quitarDeLaCola(item.productoId, item.seq)
      }
      if (alguno) {
        rondaRef.current = 0
        await cargar()
      }
    } finally {
      enviandoRef.current = false
      setReintentando(false)
    }
  }, [enviarCaptura, cargar])

  // Reintento con backoff mientras quede algo en la cola.
  useEffect(() => {
    if (pendientes.length === 0) {
      rondaRef.current = 0
      return
    }
    const timer = setTimeout(procesarCola, esperaReintento(rondaRef.current))
    return () => clearTimeout(timer)
  }, [pendientes, procesarCola])

  // Al volver la conexion no hay que esperar al backoff.
  useEffect(() => {
    const alVolver = () => procesarCola()
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [procesarCola])

  const guardar = async () => {
    if (activo === null) return
    const valor = parseFloat(cantidad.replace(',', '.'))
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Cantidad inválida')
      return
    }
    seqRef.current += 1
    const item: CapturaPendiente = {
      productoId: activo.productoId,
      nombre: activo.nombre,
      cantidad: valor,
      observacion,
      seq: seqRef.current
    }
    const resultado = await enviarCaptura(item)
    // Un rechazo definitivo deja el sheet abierto: el usuario ve por que fallo.
    if (resultado === 'permanente') return
    if (resultado === 'reintentar') {
      // Indexada por producto: recontar reemplaza la pendiente, no apila otra.
      setPendientes((prev) => [...prev.filter((x) => x.productoId === item.productoId ? false : true), item])
      toast.warning(`Sin conexión: ${item.nombre} se guarda apenas vuelva`)
    }
    setActivo(null)
    // Modo rafaga: volver a la camara si el producto vino de un escaneo.
    if (veniaDelEscanerRef.current) {
      veniaDelEscanerRef.current = false
      setEscanerAbierto(true)
    } else {
      buscadorRef.current?.focus()
    }
    if (resultado === 'ok') await cargar()
  }

  // guardar() se recrea en cada tecla (cierra sobre `cantidad`); el ref evita
  // reenganchar el listener de teclado con cada digito.
  const guardarRef = useRef(guardar)
  guardarRef.current = guardar

  // Teclado fisico en el sheet de cantidad (PC): mismos gestos que el teclado
  // en pantalla. Solo activo con un producto abierto, para no robarle las teclas
  // al buscador ni al lector de codigos.
  useEffect(() => {
    if (activo === null) return
    const alTeclear = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null
      if (destino && (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA')) return
      if (/^[0-9]$/.test(e.key)) {
        escribirDigito(e.key)
        return
      }
      if (e.key === ',' || e.key === '.') {
        e.preventDefault()
        escribirDigito(',')
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        borrarDigito()
        return
      }
      if (e.key === 'Escape') {
        setActivo(null)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        guardarRef.current()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [activo, escribirDigito, borrarDigito])

  if (datos === null) return <p className='p-6 text-center text-[#8b949b]'>Cargando…</p>

  const total = datos.productos.length
  const contados = contadosPorProducto.size

  return (
    <div className='relative flex flex-1 flex-col overflow-hidden'>
      {/* Una sola linea: el detalle del conteo no justifica dos renglones cuando
          lo que importa es la lista de productos. */}
      <div className='flex items-center gap-1.5 bg-[#626e78] py-1.5 pl-1 pr-3 text-white'>
        <button
          onClick={onVolver}
          aria-label='Volver a la lista de conteos'
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'
        >
          <ChevronLeft className='h-5 w-5' strokeWidth={2.5} />
        </button>
        <p className='min-w-0 flex-1 truncate text-[15px] font-bold leading-tight'>
          {datos.conteo.almacenNombre}
          <span className='font-semibold opacity-70'>
            {' · '}
            {datos.conteo.noVendibles ? 'No vendibles' : 'Vendibles'} · #{conteoId}
          </span>
        </p>
        <p className='shrink-0 text-[15px] font-bold tabular-nums'>
          {contados}/{total}
        </p>
      </div>
      <div className='h-1 bg-[#4d575f]'>
        <div
          className='h-full bg-[#80a76e] transition-all'
          style={{ width: total > 0 ? `${(contados / total) * 100}%` : '0%' }}
        />
      </div>

      {pendientes.length > 0 && (
        <button
          onClick={procesarCola}
          className='flex items-center gap-2 bg-[#f7ecd2] px-4 py-2.5 text-left text-[13px] font-semibold text-[#8a6d1f]'
        >
          {reintentando ? (
            <RefreshCw className='h-4 w-4 shrink-0 animate-spin' />
          ) : (
            <CloudOff className='h-4 w-4 shrink-0' />
          )}
          <span className='flex-1'>
            {pendientes.length} sin guardar — {reintentando ? 'reintentando…' : 'se reintenta solo'}
          </span>
          <span className='underline'>Reintentar</span>
        </button>
      )}

      <div className='flex gap-2 px-3 py-2'>
        <div className='flex h-11 flex-1 items-center gap-2.5 rounded-lg border border-[#dde0e3] bg-white px-3'>
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
          className='flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#626e78] text-white'
        >
          <ScanBarcode className='h-6 w-6' />
        </button>
      </div>

      {(categorias.length > 1 || contados > 0) && (
        <div className='flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
          {/* Primero: repasar lo ya cargado antes de terminar el conteo. */}
          {contados > 0 && (
            <button
              onClick={() => setCategoria(categoria === CHIP_CONTADOS ? '' : CHIP_CONTADOS)}
              className={
                categoria === CHIP_CONTADOS
                  ? 'flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#80a76e] px-4 text-sm font-bold text-[#2c3236]'
                  : 'flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#80a76e] bg-white px-4 text-sm font-bold text-[#5d8a4a]'
              }
            >
              <Check className='h-4 w-4' strokeWidth={3} />
              Contados ({contados})
            </button>
          )}
          <button
            onClick={() => setCategoria('')}
            className={
              categoria === ''
                ? 'h-9 shrink-0 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                : 'h-9 shrink-0 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
            }
          >
            Todas ({contados}/{total})
          </button>
          {categorias.map(([nombre, avance]) => (
            <button
              key={nombre}
              onClick={() => setCategoria(nombre === categoria ? '' : nombre)}
              className={
                nombre === categoria
                  ? 'h-9 shrink-0 rounded-full bg-[#626e78] px-4 text-sm font-bold text-white'
                  : 'h-9 shrink-0 rounded-full border border-[#dde0e3] bg-white px-4 text-sm font-bold text-[#626e78]'
              }
            >
              {nombre} ({avance.contados}/{avance.total})
            </button>
          ))}
        </div>
      )}

      <div className='flex-1 space-y-2 overflow-y-auto px-3 pb-16'>
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
                    <span className='min-w-0 flex-1'>
                      <span className='block text-[16px] font-bold text-[#2c3236]'>{p.nombre}</span>
                      <span className='block text-sm font-semibold text-[#8b949b]'>
                        {[p.presentacion, p.codigo].filter((x) => x !== '').join(' · ')}
                        {p.stock !== null && ` · Stock ${fmtNum(p.stock)}`}
                        {p.stock !== null && contado !== undefined && (
                          <span
                            className='font-bold'
                            style={{
                              color:
                                contado - p.stock > 0
                                  ? '#5d8a4a'
                                  : contado - p.stock < 0
                                    ? '#b85c5c'
                                    : '#8b949b'
                            }}
                          >
                            {' · '}
                            {contado - p.stock > 0 ? '+' : ''}
                            {fmtNum(Math.round((contado - p.stock) * 1000) / 1000)}
                          </span>
                        )}
                      </span>
                    </span>
                    {contado !== undefined ? (
                      <span
                        className='flex items-center gap-2 rounded-full px-3.5 py-2'
                        style={{
                          backgroundColor: pendientePorProducto.has(p.productoId)
                            ? '#eac568'
                            : copiadoPorProducto.has(p.productoId)
                              ? '#dde0e3'
                              : '#80a76e'
                        }}
                      >
                        <span className='text-[17px] font-bold tabular-nums text-[#2c3236]'>
                          {fmtNum(contado)}
                        </span>
                        {pendientePorProducto.has(p.productoId) ? (
                          <CloudOff className='h-4 w-4 text-[#2c3236]' strokeWidth={2.5} />
                        ) : copiadoPorProducto.has(p.productoId) ? (
                          <Copy className='h-4 w-4 text-[#626e78]' strokeWidth={2.5} />
                        ) : (
                          <Check className='h-4 w-4 text-[#2c3236]' strokeWidth={3} />
                        )}
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

      {/* Flotante sobre la lista: no ocupa alto del layout. El degrade despega la
          pastilla del producto que pasa por debajo, que si no la volvia ilegible.
          El contenedor no intercepta toques salvo en el boton. */}
      <div className='pointer-events-none absolute inset-x-0 bottom-0'>
        <div className='h-10 bg-gradient-to-t from-[#eef0f1] via-[#eef0f1]/85 to-transparent' />
        <div className='flex justify-center bg-[#eef0f1] px-3 pb-3'>
          <button
            onClick={() => setTerminando(true)}
            disabled={contados === 0}
            className='pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-[#2c3236] pl-6 pr-5 text-[15px] font-bold tracking-wide text-white shadow-[0_6px_20px_rgba(44,50,54,0.45)] disabled:opacity-40'
          >
            Terminar conteo
            <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
          </button>
        </div>
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
                  Cantidad{activo.presentacion !== '' ? ` en ${activo.presentacion}` : ''}
                </p>
              </div>
              <p
                className='border-b-[3px] px-1.5 text-4xl font-bold tabular-nums'
                style={{
                  borderColor: cantidadEsPrevia ? '#b6bcc1' : '#80a76e',
                  color: cantidadEsPrevia ? '#8b949b' : '#2c3236'
                }}
              >
                {cantidad === '' ? '0' : cantidad}
              </p>
            </div>
            {/* Arriba del teclado: si va abajo, el teclado del sistema la tapa. */}
            {conObservacion && (
              <input
                autoFocus
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder='Observación del producto'
                className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
              />
            )}
            <TecladoNumerico conComa onTecla={escribirDigito} onBorrar={borrarDigito} />
            <div className='flex gap-2.5'>
              <button
                onClick={guardar}
                disabled={cantidad === ''}
                className='flex h-14 flex-1 items-center justify-center gap-2.5 rounded-lg bg-[#80a76e] text-lg font-bold text-[#2c3236] disabled:opacity-50'
              >
                Guardar y siguiente
                <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
              </button>
              <button
                onClick={() => setConObservacion((v) => !v)}
                className={
                  conObservacion
                    ? 'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#626e78] text-white'
                    : 'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[#dde0e3] text-[#626e78]'
                }
              >
                <MessageSquare className='h-5 w-5' />
              </button>
            </div>
          </div>
        </div>
      )}

      {terminando && (
        <div
          className='fixed inset-0 z-50 flex items-end bg-[#2c3236]/35'
          onClick={() => setTerminando(false)}
        >
          <div
            className='w-full space-y-3 rounded-t-2xl bg-white px-4 pb-6 pt-2.5 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mx-auto h-1.5 w-11 rounded-full bg-[#dde0e3]' />
            <div>
              <p className='text-lg font-bold text-[#2c3236]'>Terminar conteo</p>
              <p className='text-[13px] font-semibold text-[#8b949b]'>
                {contados} de {total} productos contados
                {contados < total ? ' · los no contados quedan fuera del ajuste' : ''}
              </p>
            </div>
            <input
              autoFocus
              value={obsConteo}
              onChange={(e) => setObsConteo(e.target.value)}
              placeholder='Observación del conteo (opcional)'
              className='h-12 w-full rounded-lg border border-[#dde0e3] px-3.5 text-[15px] font-semibold text-[#2c3236] outline-none'
            />
            {pendientes.length > 0 && (
              <p className='flex items-center gap-2 rounded-lg bg-[#f7ecd2] px-3 py-2.5 text-[13px] font-semibold text-[#8a6d1f]'>
                <CloudOff className='h-4 w-4 shrink-0' />
                {pendientes.length} captura{pendientes.length === 1 ? '' : 's'} sin confirmar. No
                cierres el conteo hasta que lleguen, o quedan fuera del ajuste.
              </p>
            )}
            <div className='flex gap-2.5'>
              <button
                onClick={() => setTerminando(false)}
                className='h-14 flex-1 rounded-lg border border-[#dde0e3] text-base font-bold text-[#626e78]'
              >
                Seguir contando
              </button>
              {pendientes.length > 0 ? (
                <button
                  onClick={procesarCola}
                  disabled={reintentando}
                  className='flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-[#eac568] text-base font-bold text-[#2c3236] disabled:opacity-60'
                >
                  <RefreshCw className={`h-5 w-5 ${reintentando ? 'animate-spin' : ''}`} />
                  {reintentando ? 'Enviando…' : 'Reintentar'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTerminando(false)
                    onTerminar(obsConteo)
                  }}
                  className='flex h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-[#80a76e] text-base font-bold text-[#2c3236]'
                >
                  Terminar
                  <ChevronRight className='h-5 w-5' strokeWidth={2.5} />
                </button>
              )}
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
