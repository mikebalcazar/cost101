# cost101 — por dónde va

## 8-oct-2026 (tarde) · los 193 costos base, listos para cargar (0.2.3)

- Precios revisados en tiendas en línea (Home Depot, Sodimac, Mercado Libre,
  Alumer, Herrashop y otras). Mike decidió con su mensaje: **el precio más
  alto** de lo encontrado; donde no hubo tienda (y la mano de obra y el
  equipo), **el estimado más 15 %**. Tablaroca normal 1/2" (MAT-201) a $399.
- Mike: «No le hagas caso a las marcas y ya agrega todo». Van los 193 en
  `public/costos-base.json` (centavos con IVA). A quien dirige le sale en el
  Resumen «Costos base listos para cargar · Cargar los N» mientras falte
  alguna clave; la carga es `POST /costos/importar` (no duplica ni pisa).
  El chat no tiene la sesión de Mike: el clic en forespot lo da él.
  **Mike los cargó en forespot el 8-oct-2026 («listo, cargados»).** El chat
  no lo puede leer sin su sesión; no hay que volver a ofrecerlo.
- 64/64 en local con la prueba nueva (carga, tipos, no pisa, el aviso se va,
  staff no lo ve).

## 8-oct-2026 · sólo el lienzo (0.2.2), y los costos base a revisión

- Mike: «Deja en cost101 solo la modalidad de lienzo. Ya quita las otras 2».
  Fuera «Hoja APU», «Por pasos» y su selector (#1). 57/57 local y staging;
  producción en a20d660.
- Costos base de carpintería, tablaroca y cancelería: 193 renglones en Excel
  para que Mike marque cuáles se quedan y corrija precios. **No se cargó
  nada**; al regresar, `POST /orgs/:o/costos/importar` con lo que quede.

## 7-oct-2026 (tarde) · publicado, y lo demás de la suite ya lo conoce

- **cost101 0.2.0 en producción**: https://cost101.taller101.com (c922d44).
  Medido por el corredor: local 55/55, staging 55/55, producción en verde.
- **quote101 G108** (cotizador-t101 #84, fusionado y publicado): «Buscar en
  catálogo» con Productos y Precios base.
- **Menú de la suite** (suite101-api #271), **master101** (#35),
  **workshop101** (#15) y **el sitio** (descargas #31): fusionados.
- Mike autorizó con botones (7-oct) que este chat fusione y publique.

**Sigue pendiente:** dominio propio de cada empresa para cost101
(`APPS_DOMINIO` y la puerta, en suite101-api); la base de forespot está
vacía (se llena a mano o con «Cargar catálogo de ejemplo», precios de
referencia sin validar); Babel compila en el navegador; logotipo en PNG.

## 7-oct-2026 · cost101 entra a la suite (0.2.0)

Mike, 7-oct: «una base de datos de los costos base, la cual puedo editar
(agregar, quitar, actualizar) sobre la plataforma como está ahorita. Luego los
generadores se alimentan de la base de datos de costos base, y de ahí se
generan los productos que son otra base de datos, los cuales van a alimentar
los precios de los productos para quote.» «Integrar el login igual que todas
las demás apps (…) al menú principal (…) y en la webpage de showcase.»

Decisión de Mike con botones: a quote101 llega el **precio cost101 sin IVA**
(con indirectos y utilidad de cost101; quote101 sólo le suma IVA).

**Hecho y medido** (55 de 55 en `pruebas/pantalla.spec.mjs`, contra
suite101-api 0.81.0 levantada en local, con el Worker de verdad):

- Entrar con la cuenta de la suite; sin sesión el Worker no entrega la app
  (ni `support.js`, ni la semilla).
- Los datos en la base de la empresa. Ya no hay localStorage ni selector de
  rol: el rol lo dice la API (`puede_aprobar`).
- Precios base: agregar, **quitar** (dos toques; lo que una partida usa no
  se quita y se dice quién lo usa), actualizar precio, **nombre**, **unidad**
  y categoría. Cuadrillas y partidas: también se quitan.
- Una base vacía ofrece «Cargar catálogo de ejemplo» a quien dirige
  (`public/semilla.json`: 60 insumos, 6 cuadrillas, 16 partidas; precios de
  referencia, sin validar).
- Sin dependencias de otros sitios: Raleway, React y Babel van en el propio
  origen.

**En suite101-api** (PR #270, fusionado y publicado): app `cost101`, tablas,
la cuenta y las rutas. **En quote101** (PR #84, sin fusionar): «agregar del
catálogo» con productos y precios base. **Menú de la suite** (API PR #271, sin
fusionar: espera a que este Worker conteste).

**Pendiente**

1. Este repositorio no se ha publicado nunca: lo crea Mike (repo + dos
   secretos + permisos de Actions). Todo lo de arriba está en commits locales
   de la sesión del 7-oct.
2. master101 y workshop101 traen la lista de apps escrita a mano: agregarles
   `cost` / `cost101` para prender la licencia por empresa y por persona
   desde la pantalla (hoy: forespot y demo la traen prendida por migración).
3. La ficha en el sitio (repo `descargas`, `sitio/`), con capturas de la
   empresa demo.
4. Dominio propio de cada empresa (`cost101.acme.com`): `APPS_DOMINIO` y la
   puerta (`puerta/destino.ts`) en suite101-api, cuando el Worker exista.
5. Deuda: Babel compila en el navegador en cada carga (3 MB); el logotipo es
   PNG (falta el SVG de la suite).

## 6-oct-2026 · nace el repositorio (0.1.0)

- Mike entregó el zip de Claude Design («Generador de costos de construcción»,
  handoff «costeo101»). Decisión de Mike: la app se llama **cost101** y vive en
  **cost101.taller101.com**. Primero se sube la webapp tal cual; después se
  integra a la suite.
- Publicado el diseño **v2** (el elegido en el handoff). Cambios sobre el zip:
  marca `costeo101` → `cost101`; título y `lang`; React, ReactDOM y Babel
  servidos desde `public/vendor/` (mismas huellas sha384 que unpkg); la fecha
  `HOY` ya no está fija en 2026-10-06, es la del día.
- La v1 «industrial» del zip NO se subió (alternativa descartada).

(Lo que el 6-oct quedó pendiente —sesión, licencias, catálogo compartido, rol—
se hizo el 7-oct: ver arriba.)
