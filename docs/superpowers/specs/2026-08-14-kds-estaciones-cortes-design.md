# Pantallas-estacion y cortes por pintado en el KDS

Fecha: 2026-08-14
Revision 2026-08-15: el pintado paso de "meter la orden a produccion" a **separador
de cortes** (ver regla de derivacion); la capacidad quedo como advertencia.
Contraparte POS: `Restotech\docs\superpowers\specs\2026-08-14-cocina-estaciones-componentes-design.md`
(modulo Cocina* ya implementado y probado en el POS el 2026-08-14).

## Problema

El POS ya administra estaciones de cocina (`CocinaEstaciones`, con `Capacidad` y
`Orden`), componentes (`CocinaComponentes`, con `Espacios`) y la configuracion por
producto (`CocinaComponentesProductos`, con `Cantidad`). El KDS todavia no consume
nada de eso: sus pantallas solo rutean productos enteros por
`TiposProductos.kitchenDisplayID`.

Falta el lado consumidor: que el encargado arme tandas de produccion ("cortes")
validadas contra la capacidad de cada estacion, y que cada estacion fisica tenga una
pantalla que le diga cuanto tiene que preparar ahora.

## Modelo elegido: corte derivado del pintado

No se agrega ninguna tabla, columna ni numero de secuencia del lado KDS. El corte se
**deriva** en cada consulta a partir de estado que ya existe:

- **Pintar una orden** (`KDS_Snooze.Resaltado = 1`, el boton balde amarillo de hoy)
  es **cortar ahi**: cierra el corte que la incluye a ella y a todas las ordenes no
  pintadas anteriores por hora. No hay boton extra ni paso de confirmacion.
- **Despachar** (check verde de siempre, `DetalleCuenta.Terminado`) la saca de la
  produccion. Las ordenes despachadas y los items borrados **no computan**.
- Los cortes son el resultado de un calculo deterministico sobre **todas** las
  ordenes pendientes del dia (ver regla de derivacion).

### Regla de derivacion de cortes

1. **Universo**: TODAS las ordenes de hoy (ventana `startOfToday..startOfTomorrow`,
   `America/La_Paz`, igual que el resto del KDS) con al menos un item pendiente
   (sin `Terminado`, no borrado), pintadas o no. Identidad de orden: par
   `(VisitaID, Orden)` como en todo el KDS.
2. **Carga de una orden por estacion**: por cada item pendiente,
   `unidades = cantidad vendida x Cantidad del componente` y
   `ocupacion = unidades x Espacios del componente`. Se suma por
   `EstacionCocinaID`. Productos sin configuracion de cocina no aportan carga.
   Para lineas de combo tambien computan los productos hijos (`ProductosCombos`),
   cada uno con su propia configuracion; en la practica el cliente configura el
   combo entero o sus hijos, no ambos.
3. **Orden de llenado**: las ordenes se ordenan por
   `MIN(COALESCE(HoraRecoger, Hora))` del par, con desempate por
   `(VisitaID, Orden)` para que el calculo sea estable.
4. **Pintado como separador**: recorriendo las ordenes en ese orden, cada orden
   pintada (`Resaltado = 1`) cierra el corte que la incluye a ella y a las no
   pintadas acumuladas desde el separador anterior. Las ordenes son atomicas:
   nunca se parten entre cortes.
5. **En espera**: las ordenes posteriores al ultimo separador no pertenecen a
   ningun corte; la pantalla-estacion las muestra agrupadas como carga entrante
   ("En espera", card gris punteada).
6. **Capacidad como advertencia**: la capacidad nunca divide ni bloquea un corte.
   Si la carga del corte (o del grupo en espera) supera la `Capacidad` de alguna
   estacion, se marca `excedido` y el popup/semaforo lo avisa en rojo; el
   encargado decide si despinta y corta antes.
7. **Etiqueta del corte**: no hay numero; la card se titula con la hora del pedido
   mas viejo del corte, formato `HH:mm` ("Corte 12:03").
8. **Estaciones**: solo computan y se muestran las estaciones con `Activo = 1`,
   ordenadas por `Orden` (empates por nombre). Los **componentes inactivos siguen
   computando**: la relacion producto-componente vigente representa trabajo real
   hasta que el POS la quite (decision alineada con la spec del POS).
9. `Capacidad = 0` = ilimitada: esa estacion nunca marca excedido.

### Consecuencias aceptadas a conciencia

- Las ordenes despachadas salen del universo en el proximo recalculo: los cortes
  se achican y, si el separador de un corte se despacha, ese corte se fusiona con
  el siguiente. La card de la estacion siempre responde "que deberia estar en la
  plancha ahora".
- Pintar una orden del medio (o despintarla) redistribuye los cortes: cada
  separador cierra lo acumulado hasta el. Con pintado FIFO normal el efecto es el
  intuitivo.
- Una orden nueva cuya hora efectiva cae antes de un separador existente entra a
  ese corte ya cerrado (los cortes son derivados, no congelados).
- Pintar una orden sin configuracion de cocina la marca amarilla como siempre y
  actua de separador; si el corte resultante no tiene carga, el popup avisa que no
  genera trabajo en estaciones y ninguna pantalla-estacion lo muestra.

## Componentes

### 1. /config: tipo de pantalla

`FormConfig.tsx` pasa a ofrecer un `Select` con **dos grupos** visualmente
separados (SelectGroup + SelectLabel de shadcn):

- **Equipos**: la lista actual de `getEquipos.ts` (impresoras con
  `esMonitorDigital = 1` + los 4 pseudo-equipos), sin cambios de comportamiento.
- **Estaciones de Cocina**: `CocinaEstaciones` activas ordenadas por `Orden`.

La seleccion se guarda en `localStorage.equipo` con el marcador
`estacion:<EstacionCocinaID>` para distinguirla de un equipo. Con una estacion
elegida, las opciones que no aplican (desglose, snooze) se ocultan del form.

`getEquipos.ts` (o una action hermana) agrega la lectura de `CocinaEstaciones`. Si
las tablas `Cocina*` no existen en esa base (POS viejo), el grupo Estaciones no
aparece y no hay error: el modulo entero se apaga en silencio.

La regla del SideMenu que muestra Configuracion solo si hay mas de un equipo cuenta
tambien las estaciones.

### 2. Pantalla de equipo: popup de carga al pintar

El boton pintar se mantiene identico (PATCH a `/api/ordenes`,
`KDS_Snooze.Resaltado`). Cambia la respuesta del PATCH al **pintar** (despintar
sigue silencioso): el servidor recalcula la derivacion y devuelve un resumen que el
cliente muestra en `CorteResumenDialog` (rediseñado el mismo 2026-08-14 a pedido
del usuario):

- **Header semaforo**: la banda superior toma el color del estado con la paleta
  del TimerComponent — verde OK, ambar estacion al limite, rojo excedida, gris
  para "sin trabajo en cocina" — con titulo grande ("CORTE 17:05") y un subtitulo
  de una linea ("La orden entro a produccion." / "Abre un corte nuevo en cocina."
  / "No entra completa: revise la carga.").
- **Filas por estacion**: nombre + unidades a la izquierda; `ocupacion / capacidad`
  a la derecha en tabular-nums; debajo una **barra de progreso** coloreada por el
  estado de esa estacion. Capacidad ilimitada se muestra `N / ∞` sin barra, alineada
  con el formato de las demas filas.
- **Excedido**: franja roja "Despinte esta orden y elija otra que quepa."
- **Auto-cierre a los 10 segundos** (`AUTOCIERRE_MS`), anunciado por una barra
  inferior que se drena en el color del estado; cierre manual con una **X grande
  de 44px** (touch-friendly, reemplaza a la X chica del shadcn base).
- Caso sin configuracion de cocina: header gris "Sin trabajo en cocina" con la
  explicacion.

Las cards pintadas se ven igual que hoy (fondo amarillo). No se muestra numero de
corte en la card del equipo: el popup es la unica devolucion.

### 3. Pantalla-estacion

Cuando `localStorage.equipo` es `estacion:N`, la pagina principal renderiza la
vista estacion en lugar de `Orders`:

- Mismo lenguaje visual: mismos colores y fuentes que el resto del KDS.
- **Una seccion por corte** (solo cortes con carga pendiente en **esta**
  estacion), ordenadas por hora, apiladas verticalmente (revision 2026-08-15;
  reemplaza al masonry de cards de corte). El header de la seccion lleva
  "Corte HH:mm", el agregado del corte inline y el timer semaforo de siempre
  (`TimerComponent`) desde la hora del pedido mas viejo. Adentro, una **card por
  pedido** (grilla `auto-fill`) con el numero de orden de la pantalla principal.
- Al final, la seccion gris punteada **"En espera"** con los pedidos posteriores
  al ultimo separador, mismo formato.
- Las **cards de pedido siempre muestran productos** ("1x 1/4 DE LIBRA SPL"): el
  cocinero tiene que saber a que hamburguesa va su componente. Los hijos de combo
  entran a la vista por producto (revision 2026-08-15; antes quedaban fuera),
  contando 1 por fila de `ProductosCombos` igual que la carga. Fallback por
  pedido a componentes si un producto con carga no aparece.
- Las **observaciones** (`Observaciones.DetalleCuentaID`; en el hijo de combo, la
  de su linea padre) salen debajo del producto en la card de pedido, y las lineas
  con observaciones distintas **no se agrupan** entre si. El agregado del header
  suma por nombre, sin abrir por observacion.
- El **agregado del header** segun la estacion:
  - Normal: componentes pendientes ("25x Carne"), la carga real de la estacion.
  - `MostrarProductos = 1`: productos pendientes ("5x 1/4 DE LIBRA SPL").
- **Visor pasivo**: sin checks, sin snooze, sin resaltar, sin dialogs.
- Polling de 15 segundos como el resto del KDS. Sonido `neworder.mp3` cuando
  aparece una card de corte nueva (misma heuristica de comparar cantidad).
- Sin trabajo pendiente: pantalla vacia con mensaje neutro ("Sin trabajo
  pendiente").
- Si la estacion elegida fue desactivada o eliminada en el POS, la pantalla queda
  en el estado vacio con un aviso para reconfigurar desde /config; no revienta.

### 4. API y modulo de calculo

- **Un solo modulo servidor** (`src/actions/getCocina.ts`) implementa la
  derivacion completa: query SQL (pendientes del dia + JOINs a `DetalleCuenta`,
  `Productos`, `ProductosCombos`, `CocinaComponentesProductos`,
  `CocinaComponentes`, `CocinaEstaciones`, flag `Resaltado` de `KDS_Snooze`) +
  particion por separadores en TypeScript (`src/utils/derivarCortes.ts`). La
  particion no se hace en SQL.
- Lo consumen dos entradas:
  - `GET /api/estaciones/carga?estacion=N`: cortes con la carga de esa estacion
    mas el grupo `enEspera` (lo pollea la pantalla-estacion). Incluye la variante
    por producto cuando `MostrarProductos = 1`.
  - El PATCH de resaltar en `/api/ordenes`: tras escribir `Resaltado`, recalcula y
    devuelve el resumen del corte que el pintado cerro para el popup.
- `GET /api/estaciones` (o extension de `/api/equipos`): lista de estaciones
  activas para /config.
- Deteccion de tablas `Cocina*`: una verificacion barata (sondeo tipo
  `select top 1`) cacheada por proceso; si fallan, `/api/estaciones` devuelve
  lista vacia y el PATCH responde sin resumen (el cliente no muestra popup).
- Todo parametrizado con `.input()` como el resto de `src/actions`.

### 5. Lado POS (cambio chico en Restotech)

- Columna nueva `MostrarProductos BIT NOT NULL DEFAULT 0` en `CocinaEstaciones`
  (`YESNO` en Access), agregada con ALTER perezoso dentro de
  `ctlCocina.AsegurarTablas` (sondeo de la columna; si falta, `ALTER TABLE ADD`).
- Checkbox en `frmEntCocinaEstacion`: "Mostrar productos a armar en vez de
  componentes", persistido via `clsCocinaEstaciones`.
- Pensado para estaciones tipo Armado, donde el que arma piensa en hamburguesas
  terminadas y no en componentes.

## Errores

- Fallo de BD en la pantalla-estacion: mismo patron de error a pantalla completa
  que `Orders.tsx` (texto rojo `animate-pulse`).
- Fallo del PATCH al pintar: toast de error como hoy; el pintado no se aplica.
- Popup sin datos (tablas `Cocina*` ausentes): el pintado funciona como siempre,
  sin popup. Nada de excepciones silenciosas en el servidor: se loguean y la API
  responde con error explicito.

## Pruebas

No hay infraestructura de tests en el repo. Verificacion:

1. `npm run build` y `npm run lint` limpios.
2. Smoke manual con el POS y SQL Server reales (config del POS: Plancha 25,
   Fritura 20, Armado 0 con `MostrarProductos`; Hamburguesa simple 1 Carne / 1
   Papas / 1 Armado; Doble con 2 Carnes; Carnesota con Espacios 2):
   - /config muestra los dos grupos; elegir una estacion y volver: el marcador
     `estacion:N` persiste.
   - Pintar una orden cierra el corte con ella y las no pintadas anteriores; el
     popup muestra la carga del corte cerrado ("Corte cerrado con N ordenes").
   - La pantalla Plancha muestra cards por corte con componentes agregados mas la
     card gris "En espera"; la pantalla Armado muestra productos.
   - Despachar ordenes de un corte: la card se achica; despachar el separador
     fusiona el corte con el siguiente.
   - Despintar una orden: su corte se fusiona con el siguiente (o pasa a espera).
   - Orden sin configuracion de cocina pintada: separa igual; si el corte no tiene
     carga, popup "no genera trabajo".
   - Corte que excede capacidad: sigue siendo uno solo, marcado excedido en rojo.
   - Base sin tablas `Cocina*`: /config sin grupo Estaciones, pintado sin popup,
     cero errores.
3. Lado POS: checkbox `MostrarProductos` guarda y la columna se crea sola en una
   base que no la tiene (SQL y Access).

### Verificado en vivo (2026-08-14, browser + BD real)

Smoke ejecutado la misma noche con las dos ordenes de prueba y las estaciones
Plancha 25 / Fritura 20 / Armado 0:

- /config con los dos grupos; elegir estacion oculta desglose y snooze; el
  marcador `estacion:N` persiste y la home rutea a la vista estacion.
- Pintar con configuracion: popup verde con cargas y barras; pintar sin
  configuracion: popup gris "sin trabajo", no ocupa capacidad.
- Auto-cierre a los 10 s y cierre con la X verificados.
- Pantalla Plancha: estado vacio y card "CORTE 17:05 — 1x Carnes" con timer;
  despintar la vacia al instante.
- Pantalla de equipo, despachos y snooze identicos a antes del branch (regresion
  visual cero); consola sin errores.

Pendiente de ver con volumen real: variantes ambar/rojo del popup, cards de
cortes multiples, y la vista por producto (`MostrarProductos`, requiere marcar el
checkbox en el ABM del POS).

### Verificado en vivo (2026-08-15, BD real, semantica separador)

Con 5 ordenes pendientes de 1 hamburguesa cada una (una via combo
"COMBO SPL + BEBIDA") y pintadas la 3ra y la 5ta: Plancha muestra
"Corte 3x Carnes" + "Corte 2x Carnes" sin grupo en espera; el hijo de combo
computa su carne. Resumen del PATCH con `cantidadOrdenes` 3 y 2.

## Criterios de aceptacion

1. Una pantalla puede configurarse como equipo (comportamiento actual intacto) o
   como estacion de cocina, con distincion clara en /config.
2. Pintar una orden cierra un corte sin pasos extra y dispara el popup con la
   carga por estacion del corte cerrado, contrastada contra capacidades como
   advertencia.
3. Los cortes se derivan solos: sin tablas, columnas ni numeros nuevos en el KDS.
4. La pantalla-estacion muestra una card por corte con el agregado pendiente de su
   estacion, titulo con hora y timer semaforo, y es un visor pasivo.
5. Una estacion con `MostrarProductos` lista productos a armar en vez de
   componentes.
6. Despachar saca la orden del calculo y los cortes se reacomodan solos;
   despachado y borrado no computan.
7. `Capacidad = 0` nunca marca excedido. Ordenes sin configuracion no aportan
   carga (pero pintadas separan).
8. En bases sin tablas `Cocina*` el KDS funciona exactamente como hoy.

## Decisiones registradas

- **Corte = pintado, derivado puro** (decision del usuario, refinada en varias
  vueltas): se descartaron el boton "Enviar corte a cocina", la tabla `KDS_Corte`
  y la columna `CorteNumero`. La identidad del corte es la hora del pedido mas
  viejo.
- **Pintado como separador, capacidad advisoria** (decision del usuario,
  2026-08-15): reemplaza al llenado greedy por capacidad de la version original.
  El encargado decide donde cortar pintando; todas las pendientes computan; la
  capacidad solo marca excedido. Lo no cortado se muestra "En espera".
- **Despachadas fuera del calculo** (decision del usuario): se descarto congelar
  los cortes hasta su cierre; el reacomodo al liberar espacio es comportamiento
  deseado.
- **Estaciones como visores pasivos** (decision del usuario): el cierre del corte
  es consecuencia del despacho del encargado, nunca de la estacion.
- **`MostrarProductos` como propiedad de la estacion en el POS** (decision del
  usuario): se descarto el toggle por pantalla en localStorage.
- **Particion en TypeScript, no en SQL**: recorrer las pendientes cerrando cortes
  por separador es torpe en T-SQL y trivial en TS; la query solo trae datos
  crudos.
- **Sin realtime nuevo**: se mantiene el polling de 15 s existente; el popup usa
  la respuesta del PATCH, no un canal aparte.
- **Popup rediseñado con auto-cierre** (pedido del usuario, mismo dia): header
  semaforo, barras de capacidad, `N / ∞` para ilimitada, X de 44px y auto-cierre
  a 10 s con barra de drenaje. Se descarto el layout plano original de filas
  grises.
