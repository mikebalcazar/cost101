# cost101

Costos de obra por análisis de precio unitario (APU), de la suite 101.
Precios base (materiales, mano de obra, equipo), cuadrillas, generador de
partidas y catálogo con borrador → aprobado e historial de precio.

- Producción: https://cost101.taller101.com (Worker `cost101`)
- Staging: Worker `cost101-staging` (workers.dev)

## Estado (6-oct-2026) — versión 0.1.0

Es el **prototipo de Claude Design publicado tal cual**: `public/index.html`
trae plantilla, lógica y datos semilla; `public/support.js` es su runtime.
**Guarda en el navegador de cada quien (localStorage, llave `costeo-apu-v1`)**:
no hay sesión, ni empresas, ni base compartida todavía. El selector de rol
(Admin / Equipo) es del prototipo.

Lo que sigue (pedido por Mike el 6-oct): entrar por la suite, licencia de uso
por empresa, y catálogo de productos compartido vía `suite101-api`. El Worker
ya trae el puente `/s101/*` con `X-App: cost101`. El detalle del diseño está en
`claude/handoff-diseno.md`.

## Cómo se prueba

```
npm ci
node pruebas/servidor.mjs 8795 &
node pruebas/pantalla.spec.mjs      # celular y escritorio, cuenta elementos
```

Publicar: push a `main`. El flujo `Publicar cost101` prueba, publica staging,
mide, publica producción, mide, y deja los números como comentario del commit.

Antes de tocar nada: `OPERAR.md`.
