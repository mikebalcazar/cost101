# cost101

Costos de obra por análisis de precio unitario (APU), de la suite 101.
Precios base (materiales, mano de obra, equipo), cuadrillas, generador de
partidas y catálogo con borrador → aprobado e historial de precio.

- Producción: https://cost.suite101.app (Worker `cost101`); https://cost101.taller101.com redirige ahí
- Staging: Worker `cost101-staging` (workers.dev)

## Estado (7-oct-2026) — versión 0.2.0

**Es una app de la suite.** Se entra con la cuenta de la suite 101
(`entrar.html`, la misma puerta que quote101), y los datos viven en la base de
la empresa, en `suite101-api` (contrato 0.81.0): `costos_base`, `cuadrillas` y
`productos` con su receta. Nada se guarda en el navegador.

- **Licencia por empresa**: llave `cost` en `orgs.apps`; se prende en master101.
- **Por persona**: la lista de apps de cada quien, en workshop101.
- **Aprobar** una partida es de quien dirige la empresa (dueño o
  administración); lo que guarda cualquier otro queda en borrador. Lo decide
  la API, no esta pantalla.
- **El precio** de cada partida lo calcula también la API (para que quote101
  lo lea aunque nadie tenga cost101 abierto). La pantalla hace la misma cuenta
  en vivo mientras se teclea; `pruebas/pantalla.spec.mjs` comprueba que den lo
  mismo.
- **quote101** lee el catálogo de productos aprobados y los precios base. A
  quote101 llega el precio de cost101 **sin IVA** (decisión de Mike, 7-oct).

## Cómo está hecho

`public/index.html` es el diseño de Claude Design (plantilla + lógica), con
`public/support.js` como su runtime. Debajo de la lógica original hay una
pieza nueva, el **sincronizador**: compara lo que hay en pantalla con lo
último que confirmó el servidor, manda la diferencia y vuelve a leer. El
detalle del diseño original está en `claude/handoff-diseno.md`.

`worker/index.js` es la puerta: sin sesión sólo entrega la pantalla de
entrada; `/s101/*` va a la API por un service binding con `X-App: cost101`.

## Cómo se prueba

La pantalla se prueba contra una **suite101-api de verdad**, no una de mentiras:

```
# en una terminal, dentro de un clon de suite101-api:
npx wrangler d1 migrations apply suite101-master-staging --local --env staging
npx wrangler dev --env staging --local --port 8787

# en otra, aquí:
npm ci
node pruebas/servidor.mjs 8796 http://127.0.0.1:8787 &
node pruebas/pantalla.spec.mjs      # 55 comprobaciones, escritorio y celular
```

Publicar: push a `main`. El flujo `Publicar cost101` levanta la API, prueba,
publica staging, mide y prueba contra staging, publica producción, mide, y
deja los números como comentario del commit.

Antes de tocar nada: `OPERAR.md`.
