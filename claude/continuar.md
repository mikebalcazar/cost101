# cost101 — por dónde va

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

## Pendiente, en orden (pedido por Mike el 6-oct)

1. Integrar a suite101: entrar con la sesión de la suite (`/s101/*`), dar de
   alta `cost101` como app en `suite101-api` (lista de apps, `X-App`).
2. Licencias de uso por empresa (prender/apagar desde master101).
3. Catálogo de productos compartido: sacar insumos, cuadrillas y partidas de
   localStorage a la base de la empresa (OrgDB) y compartirlos con las demás
   apps (quote101, supply101).
4. El rol sale de la sesión; quitar el selector Admin/Equipo.
5. Deuda del prototipo: Babel compila en el navegador en cada carga (3 MB);
   la letra Raleway viene de Google Fonts; el logotipo es PNG (falta el SVG
   de la suite); los precios semilla son de referencia, sin validar.
