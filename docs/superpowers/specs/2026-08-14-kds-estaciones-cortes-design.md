# Pantallas-estacion y cortes por pintado en el KDS

Fecha: 2026-08-14
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
  es meterla en produccion. No hay boton extra ni paso de confirmacion.
- **Despachar** (check verde de siempre, `DetalleCuenta.Terminado`) la saca de la
  produccion. Las ordenes despachadas y los items borrados **no computan**.
- Los cortes son el resultado de un calculo deterministico sobre las ordenes
  pintadas pendientes (ver regla de derivacion).

### Regla de derivacion de cortes

1. **Universo**: ordenes de hoy (ventana `startOfToday..startOfTomorrow`,
   `America/La_Paz`, igual que el resto del KDS) que esten pintadas
   (`Resaltado = 1`) y tengan al menos un item pendiente (sin `Terminado`, no
   borrado). Identidad de orden: par `(VisitaID, Orden)` como en todo el KDS.
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
4. **Llenado greedy secuencial**: cada orden entra al corte en construccion si,
   para **todas** las estaciones con `Capacidad > 0`,
   `ocupacion acumulada del corte + ocupacion de la orden <= Capacidad`. Si no
   cabe, cierra ese corte y abre el siguiente con esta orden. Las ordenes son
   atomicas: nunca se parten entre cortes.
5. **Orden sobredimensionada**: si una orden sola excede la capacidad de alguna
   estacion (30 carnes con plancha de 25), ocupa un corte propio con exceso
   visible. La cocina decide como partirla; el popup lo avisa.
6. **Etiqueta del corte**: no hay numero; la card se titula con la hora del pedido
   mas viejo del corte, formato `HH:mm` ("Corte 12:03").
7. **Estaciones**: solo computan y se muestran las estaciones con `Activo = 1`,
   ordenadas por `Orden` (empates por nombre). Los **componentes inactivos siguen
   computando**: la relacion producto-componente vigente representa trabajo real
   hasta que el POS la quite (decision alineada con la spec del POS).
8. `Capacidad = 0` = ilimitada: esa estacion nunca corta el llenado.

### Consecuencias aceptadas a conciencia

- Al despachar ordenes del corte activo se libera espacio y las ordenes del corte
  siguiente **suben solas** en el proximo recalculo: la card de la estacion siempre
  responde "que deberia estar en la plancha ahora".
- Si el encargado pinta salteado (pinta una orden vieja despues de una nueva) o
  despinta una orden del medio, los cortes se redistribuyen. Con pintado FIFO
  normal no pasa.
- Pintar una orden sin configuracion de cocina la marca amarilla como siempre, no
  ocupa capacidad ni abre cortes; el popup avisa que no genera trabajo en
  estaciones.

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

- Mismo lenguaje visual: masonry de cards, header gris, mismos colores y fuentes.
- **Una card por corte** (solo cortes con carga pendiente en **esta** estacion),
  ordenadas por hora. Titulo "Corte HH:mm" + el timer semaforo de siempre
  (`TimerComponent`) corriendo desde la hora del pedido mas viejo del corte.
- Contenido segun la estacion:
  - Normal: componentes pendientes agregados ("25x Carne", "2x Carnesota").
  - `MostrarProductos = 1`: productos pendientes agregados
    ("5x 1/4 DE LIBRA SPL", "5x AMERICANA DOBLE") de las ordenes del corte con al
    menos un componente en esta estacion.
- **Visor pasivo**: sin checks, sin snooze, sin resaltar, sin dialogs.
- Polling de 15 segundos como el resto del KDS. Sonido `neworder.mp3` cuando
  aparece una card de corte nueva (misma heuristica de comparar cantidad).
- Sin trabajo pendiente: pantalla vacia con mensaje neutro ("Sin trabajo
  pendiente").
- Si la estacion elegida fue desactivada o eliminada en el POS, la pantalla queda
  en el estado vacio con un aviso para reconfigurar desde /config; no revienta.

### 4. API y modulo de calculo

- **Un solo modulo servidor** (`src/actions/cortes.ts` o similar) implementa la
  derivacion completa: query SQL (pintadas pendientes + JOINs a `DetalleCuenta`,
  `Productos`, `ProductosCombos`, `CocinaComponentesProductos`,
  `CocinaComponentes`, `CocinaEstaciones`) + llenado greedy en TypeScript. El
  greedy no se hace en SQL.
- Lo consumen dos entradas:
  - `GET /api/estaciones/carga?estacion=N`: cortes con la carga de esa estacion
    (lo pollea la pantalla-estacion). Incluye la variante por producto cuando
    `MostrarProductos = 1`.
  - El PATCH de resaltar en `/api/ordenes`: tras escribir `Resaltado`, recalcula y
    devuelve el resumen del corte donde cayo la orden para el popup.
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
   - Pintar ordenes hasta llenar la Plancha: el popup muestra la carga y avisa
     cuando una orden abre el corte siguiente.
   - La pantalla Plancha muestra cards por corte con componentes agregados; la
     pantalla Armado muestra productos.
   - Despachar ordenes del primer corte: la card baja y las ordenes del corte
     siguiente suben al liberarse espacio.
   - Despintar una orden: desaparece del calculo sin popup.
   - Orden sin configuracion de cocina: popup "no genera trabajo", no ocupa
     capacidad.
   - Orden sobredimensionada: corte propio con exceso avisado.
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

## Criterios de aceptacion

1. Una pantalla puede configurarse como equipo (comportamiento actual intacto) o
   como estacion de cocina, con distincion clara en /config.
2. Pintar una orden la mete en produccion sin pasos extra y dispara el popup con
   la carga por estacion del corte donde cayo, validada contra capacidades.
3. Los cortes se derivan solos: sin tablas, columnas ni numeros nuevos en el KDS.
4. La pantalla-estacion muestra una card por corte con el agregado pendiente de su
   estacion, titulo con hora y timer semaforo, y es un visor pasivo.
5. Una estacion con `MostrarProductos` lista productos a armar en vez de
   componentes.
6. Despachar libera capacidad y el calculo se reacomoda solo; despachado y borrado
   no computan.
7. `Capacidad = 0` nunca limita. Ordenes sin configuracion no ocupan capacidad.
8. En bases sin tablas `Cocina*` el KDS funciona exactamente como hoy.

## Decisiones registradas

- **Corte = pintado, derivado puro** (decision del usuario, refinada en varias
  vueltas): se descartaron el boton "Enviar corte a cocina", la tabla `KDS_Corte`
  y la columna `CorteNumero`. La frontera entre cortes la define la capacidad; la
  identidad, la hora del pedido mas viejo.
- **Despachadas fuera del calculo** (decision del usuario): se descarto congelar
  los cortes hasta su cierre; el reacomodo al liberar espacio es comportamiento
  deseado.
- **Estaciones como visores pasivos** (decision del usuario): el cierre del corte
  es consecuencia del despacho del encargado, nunca de la estacion.
- **`MostrarProductos` como propiedad de la estacion en el POS** (decision del
  usuario): se descarto el toggle por pantalla en localStorage.
- **Greedy en TypeScript, no en SQL**: el llenado secuencial con corte multiple es
  torpe en T-SQL y trivial en TS; la query solo trae datos crudos.
- **Sin realtime nuevo**: se mantiene el polling de 15 s existente; el popup usa
  la respuesta del PATCH, no un canal aparte.
- **Popup rediseñado con auto-cierre** (pedido del usuario, mismo dia): header
  semaforo, barras de capacidad, `N / ∞` para ilimitada, X de 44px y auto-cierre
  a 10 s con barra de drenaje. Se descarto el layout plano original de filas
  grises.
