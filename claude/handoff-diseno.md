# Handoff: costeo101 — Generador de partidas (APU) y catálogo

## Overview
Herramienta interna de Taller 101 para costear partidas de construcción por análisis de precio unitario (APU). Una base de **precios base** (materiales por unidad de venta, mano de obra y equipo por hora) y **cuadrillas** alimenta un **generador** que arma partidas (ej. "Muro de tablaroca 2 caras con aislante y pintura, m²"). Las partidas se guardan en un **catálogo** con flujo borrador → aprobado (solo admin) e historial de precio. Cuando cambia un precio base o una cuadrilla, todas las partidas afectadas se recalculan solas y registran el cambio.

Destino sugerido: la suite 101 (`mikebalcazar/suite101-api`: Cloudflare Worker + D1, páginas HTML con identidad Taller 101). Puede vivir como una app más de la suite (p. ej. `costeo101.taller101.com`) o como módulo de quote101.

## About the Design Files
Los archivos de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran apariencia y comportamiento, **no código de producción para copiar**. La tarea es **recrearlos en el entorno existente de la plataforma** (sus patrones de rutas, D1, autenticación de la suite, roles) usando sus librerías y convenciones. El prototipo guarda todo en `localStorage` (`costeo-apu-v1`); en producción eso debe ir a la base de datos con API.

Abrir `Generador de Costos v2.dc.html` en un navegador (necesita `support.js` y la carpeta `_ds/` al lado). Toda la lógica está en la clase `Component` dentro del `<script data-dc-script>` del mismo archivo — es la referencia exacta del modelo de datos, el cálculo y los datos semilla.

## Fidelity
**Alta fidelidad (hifi)** en flujo, cálculo, copy y estructura. Visual: **v2** (vidrio sobre degradado azul) es la dirección elegida; **v1** (industrial oscuro) se incluye solo como alternativa. Usar la paleta y tipografía de Taller 101 ya presentes en la suite (`src/paginas/suite.html`).

## Fórmulas (núcleo — implementar exacto)
Por componente de una partida (cantidades por **1 unidad** de la partida):
- **Material**: `cant × (1 + desp%/100) × precio`
- **Mano de obra por oficio**: `horas × precio_hora`
- **Cuadrilla**: `costo_jornada / rendimiento` — `costo_jornada = Σ(cant_miembro × precio_hora) × horas_jornada (8)`; rendimiento = unidades por jornada. Suma a MO.
- **Equipo**: `horas × precio_hora`
- **Subpartida**: `cant × CD(subpartida)` (usa costo directo de la subpartida, sin sus indirectos/utilidad). Recursivo; impedir ciclos (no ofrecer partidas que ya contienen a la actual; profundidad máx. 5).

Totales:
```
herr  = MO × herr%          (herramienta menor, default 3%)
CD    = mat + MO + equipo + herr + sub
ind   = CD × ind%           (default 12%)
util  = (CD + ind) × util%  (default 10%)
PU    = CD + ind + util     (precios base ya traen IVA → PU con IVA incluido)
IVA desglosado = PU − PU/1.16
```

## Modelo de datos
```
insumo     { id, sku (MAT-001 | MO-001 | EQ-001), nombre, tipo: material|mo|equipo, unidad, precio, cat, hist:[{f, precio}] }
cuadrilla  { id, sku (CUA-01), nombre, cat, horas: 8, miembros:[{ref: insumo.id (tipo mo), cant}] }
partida    { id, sku (PAR-101), nombre, unidad, cat, estado: borrador|aprobado, herr, ind, util,
             comps:[{k, tipo: insumo|cuadrilla|partida, ref, cant, desp}],
             hist:[{f, pu, m (motivo)}] }
cats       { material:[], mo:[], equipo:[], cuadrilla:[], partida:[] }   // listas editables por dominio
```
- `cat` guarda el nombre; renombrar categoría actualiza todos los elementos; eliminarla los deja en `''` ("Sin categoría"). En BD conviene tabla `categorias(id, dominio, nombre, orden)` con FK.
- Precios en MXN con IVA incluido. Unidades: m², m³, ml, pza, kg, l, pt, h, lote, jgo.
- Roles: `admin` (aprueba, puede "Guardar y aprobar") y `equipo` (solo guarda borradores). Mapear a los roles de la suite (workshop101).

## Recalculo automático e historial
Al confirmar un cambio de precio base (blur/Enter), de miembros de cuadrilla o al guardar una partida usada como subpartida:
1. Calcular PU de todas las partidas antes y después.
2. Para cada partida cuyo PU cambió > $0.005, agregar `{f: hoy, pu, m: "Precio base: <insumo>" | "Cuadrilla: <nombre>" | "Subpartida: <nombre>"}`. Si la última entrada es del mismo día y motivo, reemplazarla (evita ruido).
3. En el insumo, agregar `{f, precio}` a su `hist` (mismo día → reemplaza).
4. Toast: "<insumo> → $X · N partidas recalculadas".
Guardar partida: si PU cambió → "Edición de partida"; al aprobar → "Aprobada por admin".

## Screens / Views
Barra superior fija: logo (cuadro 40×40) + "costeo**101**" (101 en acento), navegación (Resumen · Generador · Catálogo · Precios base · Cuadrillas) y selector de rol (solo prototipo; en producción viene de la sesión). Contenido `max-width:1360px`, padding `32px 20px 80px`. Todo es responsive: filas con `flex-wrap`, tablas en contenedores con `overflow-x:auto` y `min-width` (640–840px).

Encabezado de cada vista: kicker 11px mayúsculas tracking .12em color acento-700, H1 40–44px con la última palabra en acento, párrafo descriptivo en neutral-700.

1. **Resumen** — 4 celdas de conteo (Partidas aprobadas, Borradores por aprobar, Insumos base, Cuadrillas; número 52px) en `grid auto-fit minmax(200px,1fr)`. Debajo dos tarjetas (`minmax(min(100%,460px),1fr)`): **Por aprobar** (clave · fecha, nombre, PU/unidad, botones Revisar / Aprobar si admin) y **Cambios recientes en precios base** (últimos 6: nombre, fecha, precio anterior → nuevo / unidad, nº de partidas que lo usan, tag con % de cambio). Botón primario "Nueva partida".
2. **Generador** — selector de enfoque (Hoja APU / Por pasos / Lienzo; elegido: el que prefiera el equipo, recomendado "Por pasos" en móvil y "Hoja" en escritorio). Columna principal `flex:1 1 620px` + panel resumen `flex:1 1 300px; max-width:400px; sticky top:84px`.
   - Datos: Descripción (ancho completo), Clave (auto PAR-5xx), Unidad, Categoría.
   - Secciones: **Materiales** (cantidad + desperdicio %), **Mano de obra** (oficio en horas o cuadrilla con rendimiento por jornada; muestra línea "Herramienta menor (n% de MO)"), **Equipo** (horas), **Subpartidas**. Cada sección: título, ayuda, total y % del CD; filas con Clave · Descripción · Unidad · Precio · Cantidad + unidad compuesta ("pza / m²", "m² / jornada", "h / m²") · Desp. · Importe · quitar; select "Agregar …" al pie.
   - Hoja: todas las secciones apiladas. Por pasos: stepper 1 Datos · 2 Materiales · 3 Mano de obra · 4 Equipo · 5 Subpartidas (cada paso muestra su total), botones Anterior/Siguiente. Lienzo: biblioteca a la izquierda (buscador + filtros Materiales/Oficios/Cuadrillas/Equipo/Partidas, clic para agregar) y composición en tarjetas con barra de proporción.
   - Panel resumen: "Precio unitario" PU 48px + "/ unidad", "IVA incluido · $x de IVA", barra apilada (materiales, MO, herramienta, equipo, subpartidas), desglose hasta CD, indirectos, utilidad; campos Herr. menor %, Indirectos %, Utilidad %; nota según rol; botones: admin → "Guardar y aprobar" (primario) + "Guardar borrador"; equipo → "Guardar borrador"; "Cancelar".
   - Validación: descripción requerida (vuelve al paso 1) y al menos un componente.
3. **Catálogo** — buscador (clave/descripción), filtro de categoría, segmentado Todas/Aprobadas/Borradores, botón Categorías, "Nueva partida". Lista: Clave · Descripción (+categoría · nº componentes) · Unidad · P. unitario · Estado (tag) · Actualizado; fila seleccionada con fondo acento-100. Panel detalle (sticky): clave + estado, nombre, categoría · unidad, PU 44px, "IVA incluido · CD · Ind. · Util.", acciones Aprobar (admin y borrador) / Editar / Duplicar, aviso si borrador para equipo, Composición (nombre + fórmula legible: "18 ml × $14.50 + 8% desp.", importe), herramienta menor, **Historial de precio** (sparkline 320×72 + últimas 8 entradas con fecha, motivo, PU y Δ%).
4. **Precios base** — segmentado Materiales / Mano de obra / Equipo (con conteos), buscador, filtro de categoría, botón Categorías. Fila de alta: Descripción, Unidad (MO/equipo fijo "h"), Precio, Categoría, Agregar (clave auto MAT-0xx/MO-0xx/EQ-0xx). Tabla: Clave · Insumo · Categoría (select editable por fila) · Unidad · Precio (input editable; confirma en blur/Enter) · Último cambio (fecha + Δ%) · Usado en (n partidas, directo o vía cuadrilla).
5. **Cuadrillas** — filtro de categoría, Categorías, Nueva cuadrilla. Tarjetas (`auto-fill minmax(min(100%,360px),1fr)`): clave, "Usada en n partidas", nombre editable, select de categoría, miembros (oficio, $/h, stepper −/+ de 0.5, quitar), "+ Agregar oficio…", pie "Jornada 8 h · $/hora" y "Costo por jornada" 30px.
6. **Diálogo Categorías** (por dominio) — lista con input de nombre (renombra en blur/Enter), conteo de elementos, eliminar; fila "Sin categoría" con conteo; alta con Enter; botón "Listo". Cierra al clic fuera.

## Interactions & Behavior
- Navegar a Generador sin borrador abierto crea uno nuevo. Editar/Duplicar desde catálogo abre el generador (Duplicar: nueva clave, "(copia)", borrador).
- Guardar → va al catálogo con la partida seleccionada; toast 3.4 s abajo al centro.
- Si un usuario `equipo` edita una aprobada, se guarda como borrador (requiere reaprobación).
- Todos los totales se recalculan en vivo al teclear.
- Estados: hover en filas (`text 4%` tint), foco `2px solid acento`, deshabilitado 45% opacidad.

## Design Tokens (v2)
- Fondo: `#060d13` + `radial-gradient(130% 70% at 50% -12%, #2a9be0 0%, #0a6aa6 22%, #0b3655 48%, #07141e 72%, #05090d 100%)` fijo.
- Marca: azul `#0080C1` (claro: texto `#0074ad`), acento sobre oscuro `#3AA3DC`. Texto `#e8eef2`, suave `#a9c0ce`, líneas `rgba(255,255,255,.10)`.
- Rampa acento (oscuro): 100 `rgba(58,163,220,.16)`, 300 `#155a86`, 400 `#0080C1`, 600 `#5fb6e4`, 700 `#86c9ec`, 800 `#addcf3`, 900 `#d9eff9`.
- Neutros: 500 `#5f7482`, 600 `#8094a2`, 700 `#a9c0ce`.
- Tarjeta vidrio: `linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.035))`, borde `1px rgba(255,255,255,.13)`, radio 20px, `backdrop-filter: blur(16px)`, `inset 0 1px 0 rgba(255,255,255,.08)`.
- Header: `rgba(5,12,18,.38)` + blur 18px.
- Inputs: fondo `rgba(255,255,255,.06)`, borde `rgba(255,255,255,.14)`, radio 12px, alto mín. 36px (30px compactos en tablas).
- Botones píldora (radio 999px, Raleway 600 14px): primario blanco `#fff` / texto `#0b1b26` (hover `#e3f2fb`, activo `#c9e6f6`); secundario `rgba(255,255,255,.07)` borde `.16` (hover `.14`); ghost transparente.
- Segmentado: radio 14px, opción activa blanca con texto `#0b1b26`. Nav activo: píldora `rgba(255,255,255,.14)`.
- Tipografía: **Raleway** 400/500/600/700/800 (cuerpo 15px/1.55; H1 40–44px; H3 22–26px; etiquetas 11px mayúsculas tracking .08–.12em; cifras con `tabular-nums`).
- Espaciado frecuente: 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32px.

## Datos semilla
En `seed()` del archivo v2: 43 materiales (tableros, maderas, herrajes, eléctrico, hidráulico, obra civil, mármoles, pintura, aislantes, acero), 10 oficios, 7 equipos, 6 cuadrillas y 16 partidas (concretos, morteros, muros de block y tablaroca, plafón, firmes, pintura, salidas eléctricas, centro de carga, puerta MDF, muebles de melamina, salida hidráulica PPR, piso de mármol). Precios aproximados de referencia — validar con el equipo antes de cargarlos.

## Assets
- `assets/logo-taller101.png` — logo Taller 101 (cuadro azul 800×800). En producción usar el logotipo SVG de la suite (`sitio/marca/`, aro "101").
- Íconos: Lucide inline, stroke 1.5 (plus, minus, x, search, check, chevron-left/right, pencil, copy, trash-2, tag).

## Files
- `Generador de Costos v2.dc.html` — diseño elegido (plantilla + lógica completa + semilla).
- `Generador de Costos (v1 industrial).dc.html` — alternativa visual anterior, misma lógica.
- `support.js`, `_ds/…/styles.css`, `_ds/…/_ds_bundle.js` — solo para abrir los prototipos.
