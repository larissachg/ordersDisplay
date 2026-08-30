# KDS — Módulo de Conteo y Ajuste de Inventario

Fecha: 2026-08-30
Estado: aprobado en diseño, pendiente de plan de implementación.

## 1. Objetivo

Que un usuario camine por cocina/depósito con celular o tablet, haga un conteo
físico de inventario desde el KDS web, y un supervisor aplique el ajuste
resultante. El POS Restotech sigue siendo la fuente oficial del stock: el
ajuste final se materializa en las MISMAS tablas que usa `frmEntAjustes`
(`Ajustes`, `DetallesAjustes`, `Productos.Stock<AlmacenID>`), así los reportes
y la conciliación del POS siguen funcionando sin tocar VB.NET.

## 2. Contexto relevado del POS (Restotech)

Hallazgos decisivos del análisis de `frmAjustes.vb` / `frmEntAjustes.vb` /
`clsAjustes.vb` / `clsDetallesAjustes.vb` / `clsProductos.vb`:

- **Stock = snapshot en columnas dinámicas** `Productos.Stock<AlmacenID>`
  (una columna física por almacén con `Almacenes.Interno=1`). No hay kardex;
  `ProductosUsos` solo registra consumos y los ajustes NO escriben ahí.
- **El ajuste guarda**: cabecera en `Ajustes` (`AjusteID, Fecha, Observacion,
  AlmacenID, FechaRegistro`) y detalle en `DetallesAjustes`
  (`Cantidad` = delta con signo, `CantidadFinal` = cantidad contada,
  `Observacion, AjusteID, ProductoID, Costo, CostoBruto`). La cantidad teórica
  no se guarda: se reconstruye como `CantidadFinal - Cantidad`.
- **Aplicación** = `UPDATE Productos SET StockN = COALESCE(StockN,0) + delta`.
  Modelo delta: correcto cuando el movimiento ocurre DESPUÉS del conteo físico
  del producto; incorrecto si ocurre entre el snapshot y el conteo. El POS toma
  el snapshot al abrir el form (ventana de horas); el KDS lo tomará al guardar
  cada producto (ventana de segundos).
- **`AjusteID`**: IDENTITY en clientes nuevos; `max()+1` sin lock en clientes
  con `gStyleBoliches1 <= 42`. Detectable en runtime con
  `COLUMNPROPERTY(OBJECT_ID('Ajustes'),'AjusteID','IsIdentity')`.
- **Cero transacciones** en el POS: un ajuste grande son cientos de statements
  auto-commit; deuda reconocida en su auditoría. El KDS lo corrige aplicando
  todo en una transacción.
- **Sin autor**: `Ajustes` no registra quién ajustó. El POS tiene la bitácora
  `Logg (Fecha, UserID, Accion, Formulario)` que sí usa para anulaciones.
- **Productos ajustables** (filtro de `frmEntAjustes`): `Borrado=0 AND
  TienePreparacion=0 AND esCombo=0 AND COALESCE(TiposProductos.NoVendibles,0)=@tipo`.
  Modo merma = conteos de "No Vendibles"; el POS los distingue por el texto
  `'(No Vendibles)'` dentro de `Ajustes.Observacion` (sin flag).
- **Unidades**: texto libre `Productos.Presentacion` / `UnidadContenido`.
  Se cuenta en la misma unidad que la columna Stock (sin conversión
  `CantidadML`), igual que el POS.
- **Usuarios**: tabla `Meseros` (`Codigo` varchar texto plano, `Contrasenha`
  int PIN, `TipoUsuarioID`: 1=Administrador, 3=Cajero, 7=Supervisor,
  8=Almacenero, 13=Contador). Backdoor maestra `15071507` entra como Admin en
  el POS; en el KDS queda BLOQUEADA.
- **Almacenes**: `Almacenes (AlmacenID, Nombre, Interno, ResponsableID, ...)`.
  Visibilidad por usuario: `ResponsableID = 0 OR ResponsableID = @meseroId`.
- **`Productos.Codigo` es el código de barras** (confirmado). Los lectores
  físicos del POS son keyboard-wedge; no hay camino de lector dedicado.

## 3. Decisiones tomadas (con el usuario)

1. **Destino del ajuste**: tablas POS directo al aplicar (`Ajustes` +
   `DetallesAjustes` + `UPDATE Stock<N>`), dentro de una transacción.
2. **Concurrencia**: snapshot de stock POR PRODUCTO al momento de guardar su
   captura; delta = contado − snapshot. Revalidación informativa al aplicar.
3. **Permisos**: roles hardcodeados en el KDS por `TipoUsuarioID` (no se usan
   `PermisosCatalogo`/`PermisosTipos`).
4. **Conteo ciego**: el contador no ve stock del sistema ni diferencias, salvo
   rol con permiso de ver diferencias.
5. **Auth**: PIN por cada transacción, sin sesión ni cookies. El cliente
   retiene el PIN solo en memoria React durante la captura continua; el
   servidor revalida en CADA request. Re-tecleo obligatorio para aplicar y
   anular, y tras 10 min de inactividad o refresh.
6. **Un usuario por conteo**: el conteo pertenece a quien lo creó; solo él
   captura.
7. **Anular solo antes de aplicar**. Un ajuste aplicado no se revierte desde
   el KDS: se corrige con otro conteo o desde el POS.
8. **Código de barras**: búsqueda/lector físico por `Productos.Codigo` en v1;
   cámara (BarcodeDetector + zxing + foto) como etapa final.

## 4. Tablas nuevas (propias del KDS)

Creación idempotente al primer uso (`IF OBJECT_ID(...) IS NULL CREATE TABLE`),
mismo enfoque que `KDS_Snooze`.

```sql
KDS_Conteos (
  ConteoID int IDENTITY PRIMARY KEY,
  AlmacenID int NOT NULL,
  NoVendibles bit NOT NULL,            -- 0 = vendibles, 1 = mermas/no vendibles
  Estado varchar(10) NOT NULL,         -- 'abierto' | 'revision' | 'aplicado' | 'anulado'
  MeseroID int NOT NULL,               -- dueño (único que captura)
  Observacion varchar(500) NULL,
  FechaCreacion datetime NOT NULL,
  FechaAplicacion datetime NULL,
  AplicadoPorMeseroID int NULL,
  FechaAnulacion datetime NULL,
  AnuladoPorMeseroID int NULL,
  AjusteID int NULL                    -- Ajustes.AjusteID generado al aplicar
)

KDS_ConteoDetalles (
  ConteoDetalleID int IDENTITY PRIMARY KEY,
  ConteoID int NOT NULL,
  ProductoID int NOT NULL,
  CantidadContada float NOT NULL,
  StockSnapshot float NOT NULL,        -- Stock<N> vivo AL guardar esta captura
  FechaConteo datetime NOT NULL,
  Observacion varchar(500) NULL,
  CONSTRAINT UQ_KDS_ConteoDetalles UNIQUE (ConteoID, ProductoID)
)
```

- Recontar un producto = UPDATE de la fila: reemplaza `CantidadContada` y
  RE-CAPTURA `StockSnapshot` y `FechaConteo` en ese instante.
- Delta y diferencia no se almacenan: siempre derivados
  (`CantidadContada - StockSnapshot`).
- Sin FKs físicas hacia tablas POS (consistente con el estilo de la BD).

## 5. Autenticación y permisos

### PIN por transacción (stateless)

- Toda mutación lleva `pin` en el body; todo GET sensible lo lleva en header
  `x-kds-pin`. No hay cookies ni estado en servidor (compatible con PM2
  cluster x4).
- Validación en `src/actions/inventario/validarPin.ts`, SIEMPRE parametrizada:
  - entrada numérica → `Contrasenha = @pin`; cualquier entrada →
    `Codigo = @codigo` (igualdad exacta, NO `LIKE`: corrige el punto
    inyectable del POS).
  - Filtro `Activo = 1`.
  - `15071507` rechazada explícitamente ANTES de consultar (backdoor solo POS).
  - Devuelve `{ meseroId, nombre, tipoUsuarioId }` o null. Nunca se loguea el
    PIN.
- Cliente: pide PIN al entrar al módulo, lo retiene en estado React (nunca
  localStorage). Aplicar y anular SIEMPRE re-piden tecleo. Limpieza tras
  10 min sin actividad.
- Riesgo aceptado y documentado: el PIN viaja en claro por la LAN — mismo
  nivel de exposición que el POS actual (claves en texto plano en la BD).

### Roles (constantes en `src/contants/inventario.ts`)

| Acción                          | TipoUsuarioID permitidos                     |
|---------------------------------|----------------------------------------------|
| Crear conteo / capturar         | 1 Admin, 7 Supervisor, 8 Almacenero          |
| Ver stock sistema y diferencias | 1 Admin, 7 Supervisor                        |
| Aplicar ajuste                  | 1 Admin, 7 Supervisor                        |
| Anular                          | 1 Admin, 7 Supervisor; el dueño si `abierto` |
| Reabrir (`revision → abierto`)  | 1 Admin, 7 Supervisor                        |

Conteo ciego: al Almacenero el payload del GET ni siquiera incluye
`StockSnapshot`/stock vivo/diferencias (se filtra en servidor, no con CSS).

### Almacenes visibles

Solo `Interno = 1`, con la regla POS `ResponsableID = 0 OR ResponsableID =
@meseroId`. Si queda exactamente uno, se auto-selecciona al crear conteo.

## 6. Ciclo de vida del conteo

```
abierto ──(dueño: "Terminar conteo")──> revision ──(Admin/Sup: aplicar)──> aplicado
   │  ▲                                    │
   │  └──(Admin/Sup: reabrir)──────────────┤
   └──(dueño/Admin/Sup: anular)──> anulado <──(Admin/Sup: anular)──┘
```

- `abierto`: el dueño captura cantidades. Nadie más escribe.
- `revision`: captura congelada; Admin/Supervisor ve diferencias y decide.
- `aplicado` / `anulado`: terminales.

## 7. Aplicar — transacción única

Orden exacto dentro de `BEGIN TRAN ... COMMIT`:

1. **Gate anti-doble-aplicación**: `UPDATE KDS_Conteos SET Estado='aplicado',
   FechaAplicacion=@ahora, AplicadoPorMeseroID=@mesero WHERE ConteoID=@id AND
   Estado='revision'`. Si `rowsAffected = 0` → ROLLBACK y HTTP 409. Cubre
   doble tap y dos supervisores simultáneos.
2. `INSERT Ajustes (Fecha, Observacion, AlmacenID, FechaRegistro)`:
   - `Fecha` = ahora (`America/La_Paz`, formato del repo).
   - `Observacion` = `"Conteo KDS #<ConteoID>: <obs>"` + sufijo
     `" (No Vendibles)"` si `NoVendibles=1` (compatibilidad con el filtro
     `LIKE` del POS).
   - Si `AjusteID` es IDENTITY → `OUTPUT INSERTED.AjusteID`. Si no
     (cliente `max()+1`) → `sp_getapplock` sobre recurso `'Ajustes'` dentro de
     la transacción, luego `max()+1`, para no colisionar con una caja POS.
3. `INSERT DetallesAjustes` por producto contado: `Cantidad` = delta,
   `CantidadFinal` = contado, `Observacion` de la captura, `Costo` y
   `CostoBruto` leídos de `Productos` en ese momento. Solo productos contados
   (equivalente a `rbGuardarSoloProdAjustados`; el modo "guardar todo el
   inventario" queda fuera de v1).
4. `UPDATE Productos SET Stock<N> = COALESCE(Stock<N>,0) + delta` por producto
   (con el COALESCE que a la compra del POS le falta). `<N>` se interpola solo
   desde `AlmacenID` int ya validado.
5. `INSERT Logg (Fecha, UserID, Accion, Formulario)`:
   `Formulario='KDS Inventario'`, `Accion='Aplicó ajuste <AjusteID> del conteo
   <ConteoID>, almacén <nombre>, N productos'` — le da al ajuste el autor que
   el POS no registra.
6. `UPDATE KDS_Conteos SET AjusteID=@ajusteId WHERE ConteoID=@id`.
7. COMMIT. Cualquier error → ROLLBACK completo: o entra todo o no entra nada.

**Deriva (drift)**: en la pantalla de revisión, por cada producto se recomputa
stock vivo vs `StockSnapshot`; si difieren se muestra badge "movió desde
captura". Es informativo: el modelo delta ya absorbe movimientos posteriores
al conteo (venta post-conteo queda bien descontada). El supervisor decide
recontar esos productos (reabrir) o aplicar igual.

## 8. Productos contables

Query (mismo filtro que `frmEntAjustes`):

```sql
SELECT p.ID, p.Nombre, p.Codigo, p.Presentacion, p.UnidadContenido,
       COALESCE(p.Stock<N>, 0) AS stock     -- omitido para rol sin permiso
FROM Productos p
LEFT JOIN TiposProductos tp ON tp.TipoProductoID = p.TipoProductoID
WHERE p.Borrado = 0 AND p.TienePreparacion = 0 AND p.esCombo = 0
  AND COALESCE(tp.NoVendibles, 0) = @noVendibles
ORDER BY p.Nombre
```

Búsqueda client-side por `Nombre` y `Codigo` sobre la lista ya cargada
(catálogos de cientos de filas, no miles; un solo fetch por conteo).

## 9. API (sub-rutas estilo `api/estaciones/carga`)

```
POST /api/inventario/sesion                 valida PIN → { meseroId, nombre, tipoUsuarioId }
GET  /api/inventario/almacenes              internos visibles para el PIN
GET  /api/inventario/conteos                lista (abierto/revision siempre + aplicado/anulado últimos 7 días)
POST /api/inventario/conteos                crear { almacenId, noVendibles, observacion, pin }
GET  /api/inventario/conteos/[id]           cabecera + detalles (payload ciego o completo según rol)
PUT  /api/inventario/conteos/[id]/detalles  upsert captura { productoId, cantidad, observacion, pin }
POST /api/inventario/conteos/[id]/cerrar    abierto → revision (dueño)
POST /api/inventario/conteos/[id]/reabrir   revision → abierto (Admin/Sup)
POST /api/inventario/conteos/[id]/aplicar   transacción §7 (Admin/Sup, re-PIN)
POST /api/inventario/conteos/[id]/anular    (según §5)
```

- El upsert de captura toma el snapshot en el MISMO statement SQL:
  `StockSnapshot = (SELECT COALESCE(Stock<N>,0) FROM Productos WHERE ID=@p)`.
- Validaciones de params numéricos al estilo `api/estaciones/carga`.
- Degradación grácil patrón `getCocina.ts`: error 208 (tablas ausentes) →
  respuestas vacías y módulo oculto; el SideMenu hace `.catch(() => null)`.

## 10. Pantallas (mobile-first, `src/app/(pages)/inventario/`)

1. **Gate PIN** — teclado numérico grande (eco de `frmInputBoxPassword`).
2. **Lista de conteos** — activos arriba con antigüedad visible, históricos
   abajo; botón "Nuevo conteo" (almacén si hay más de uno, tipo
   vendibles/no vendibles, observación).
3. **Captura** — buscador fijo arriba (nombre o código; Enter de lector físico
   = match exacto por `Codigo` → abre teclado de cantidad directo; duplicados
   → mini-lista), lista de productos con unidad, tap → teclado numérico +
   observación opcional, check en contados, contador "N de M". Ciega salvo rol.
4. **Revisión** (Admin/Sup) — tabla producto / unidad / sistema / contado /
   diferencia / valorizado a costo, badge de deriva; acciones Aplicar
   (re-PIN) / Reabrir / Anular.
5. **Resumen aplicado** — totales positivos/negativos valorizados, `AjusteID`
   POS generado.

Entrada por `SideMenu` (link "Inventario", oculto si el POS no tiene las
tablas) y URL directa `/inventario`.

## 11. Escaneo con cámara (etapa final)

Botón "Escanear" junto al buscador; 3 capas elegidas en runtime:

1. `BarcodeDetector` API (Chrome/Android nativo, sin dependencias).
2. `@zxing/browser` wasm, lazy-load al abrir el escáner (iOS/desktop).
3. Sin contexto seguro: `<input type="file" accept="image/*"
   capture="environment">` → foto decodificada con zxing (funciona por HTTP).

Restricción: cámara en vivo requiere `isSecureContext` y el KDS se sirve por
HTTP en LAN. Solución recomendada por dispositivo:
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` con la URL del KDS
(documentar en `Instrucciones.txt`). Flujo ráfaga: escanear → cantidad →
guardar → cámara sigue abierta. Código no encontrado → toast con el código.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble aplicación (doble tap, 2 supervisores) | gate por UPDATE condicional de Estado dentro de la transacción |
| Ajuste a medias (corte de luz/red) | transacción única: todo o nada |
| Colisión de AjusteID en clientes `max()+1` | `sp_getapplock('Ajustes')` en ese camino |
| Ventas/compras durante el conteo | delta por producto contra snapshot del momento de captura + badge de deriva en revisión |
| `Stock<N>` en NULL | `COALESCE` en snapshot y en el UPDATE |
| PIN en claro por LAN | aceptado y documentado; backdoor bloqueada; PIN jamás en logs ni localStorage |
| Conteo abandonado abierto por días | antigüedad visible en lista; Admin/Sup puede anular |
| Inyección SQL | todo parametrizado; los únicos interpolados son ints validados (`AlmacenID` en nombre de columna) |
| POS sin tablas Cocina/Ajustes (versión vieja) | degradación 208: módulo oculto |

## 13. Etapas de implementación

1. **Fundaciones** — creación idempotente de `KDS_Conteos`/`KDS_ConteoDetalles`,
   `validarPin`, constantes de roles, `GET almacenes` + productos contables,
   degradación 208, script de sanidad (`npx -y tsx`) para la lógica pura de
   deltas/deriva (`src/utils/conteo.ts`).
2. **Conteo** — crear/listar conteos, pantalla de captura con upsert+snapshot,
   modo ciego, soporte lector físico (Enter = match exacto por `Codigo`).
3. **Cierre y aplicación** — revisión con diferencias/deriva, transacción de
   aplicar (IDENTITY vs `max()+1`, `Logg`), anular/reabrir, resumen.
4. **Pulido** — valorizado a costo, `SideMenu` con gating, spec y `CLAUDE.md`
   al día, `Instrucciones.txt`.
5. **Cámara** — BarcodeDetector + zxing + fallback foto, doc del flag Chrome.

Cada etapa termina compilable y usable por sí sola.
