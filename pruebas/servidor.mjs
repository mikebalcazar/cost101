/* cost101 en local, con el Worker DE VERDAD.
 *
 * No es un servidor de mentiras: importa `worker/index.js` y lo corre aquí,
 * dándole lo que en Cloudflare le dan los bindings —`ASSETS` son los archivos
 * de `public/` y `API` es una suite101-api de verdad a la que se le reenvía—.
 * Así lo que se prueba es el candado y el puente que se publican.
 *
 *   node pruebas/servidor.mjs <puerto> <url de la API>
 *   node pruebas/servidor.mjs 8795 http://127.0.0.1:8787
 *
 * La API local se levanta con `npx wrangler dev --env staging --local` en el
 * repositorio suite101-api (en staging `/auth/codigo` devuelve el código).
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const RAIZ = join(fileURLToPath(new URL('..', import.meta.url)), 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const puerto = Number(process.argv[2] || 8795);
const API = (process.argv[3] || process.env.API_LOCAL || 'http://127.0.0.1:8787').replace(/\/$/, '');

const env = {
  ASSETS: {
    async fetch(req) {
      const ruta = decodeURIComponent(new URL(req.url).pathname);
      const archivo = normalize(join(RAIZ, ruta));
      if (!archivo.startsWith(RAIZ)) return new Response('no', { status: 403 });
      try {
        return new Response(await readFile(archivo), { status: 200, headers: { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream' } });
      } catch {
        return new Response('no existe', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
    },
  },
  API: {
    // El service binding: la misma petición, a la API. Sólo cambia el origen.
    async fetch(req) {
      const u = new URL(req.url);
      const cabeceras = new Headers(req.headers);
      cabeceras.delete('host'); cabeceras.delete('content-length');
      const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
      return fetch(API + u.pathname + u.search, { method: req.method, headers: cabeceras, body: cuerpo, redirect: 'manual' });
    },
  },
};

http.createServer(async (req, res) => {
  try {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const cabeceras = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) cabeceras.set(k, Array.isArray(v) ? v.join(', ') : v);
    const peticion = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: cabeceras,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(trozos),
    });
    const r = await worker.fetch(peticion, env);
    const salida = {};
    r.headers.forEach((v, k) => { if (k !== 'set-cookie' && k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding') salida[k] = v; });
    // En local no hay https: a la cookie de la suite se le quita `Secure` y
    // `SameSite=None` para que el navegador de pruebas la guarde.
    const galletas = (r.headers.getSetCookie?.() || []).map((c) => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax'));
    if (galletas.length) salida['set-cookie'] = galletas;
    res.writeHead(r.status, salida);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('falla del servidor de pruebas: ' + (e?.stack || e));
  }
}).listen(puerto, '127.0.0.1', () => console.log(`cost101 en http://127.0.0.1:${puerto}  →  API ${API}`));
