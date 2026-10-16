/* cost101 como Worker de Cloudflare — la puerta.
 *
 * Igual que quote101 y las demás apps de la suite (decisión D1): la app vive
 * en su propio Worker y le habla a `suite101-api` desde su mismo origen, por
 * `/s101/*`, con un service binding. La sesión es la cookie `s101` de la
 * suite; servida desde el mismo origen es cookie propia (Safari no la
 * bloquea) y no hay CORS que configurar.
 *
 * **La app no se entrega sin sesión.** La única página pública es
 * `entrar.html`; a `index.html` sólo se llega con una sesión de la suite que
 * traiga cost101 entre sus apps. El candado vive aquí y no dentro de la app:
 * el Worker se niega a entregarla, en vez de entregarla y pedirle a su
 * JavaScript que se esconda solo.
 *
 * El Worker pone `X-App: cost101` y lo sobrescribe si la interfaz manda otro:
 * la app no decide quién dice ser. Qué empresa trae cost101 prendido
 * (licencia) y quién puede aprobar lo decide la API, no este archivo.
 */

const PREFIJO = '/s101';
const APP = 'cost101';
/** La llave corta con la que la suite guarda la lista de apps por persona
 *  (`LLAVE_APP` en schema/tipos.ts de suite101-api). */
const LLAVE = 'cost';

/** Lo que se entrega sin sesión: la pantalla de entrada y lo que ella pide. */
const ABIERTO = new Set(['/entrar.html', '/entrar.js', '/404.html', '/huella.txt', '/assets/logo-taller101.png', '/assets/cost101-claro.svg',
  // El ícono de la pestaña y del celular: el navegador lo pide sin sesión.
  '/favicon.ico', '/icono.svg', '/apple-touch-icon.png']);
const esAbierto = (ruta) => ABIERTO.has(ruta) || ruta.startsWith('/fonts/');

const archivo = (u) => {
  const p = u.pathname;
  if (p === '/' || p === '/index.html') return '/index.html';
  if (p === '/entrar') return '/entrar.html';
  return p;
};
const pedirArchivo = (req, u, env) => {
  const destino = new URL(req.url);
  destino.pathname = archivo(u);
  return env.ASSETS.fetch(new Request(destino, req));
};

/** ¿Quién viene, según la suite? Lo que contesta `/yo`, o null. */
async function laSuiteDiceQuien(req, env) {
  const galleta = req.headers.get('cookie');
  if (!galleta || !galleta.includes('s101=')) return null;
  const r = await env.API.fetch(new Request('https://suite101-api/yo', { headers: { cookie: galleta, 'X-App': APP } }));
  if (!r.ok) return null;
  const cuerpo = await r.json().catch(() => null);
  return cuerpo?.data || null;
}

/* ─────────── la sesión que ya pasó, recordada (16-oct-2026) ───────────
 * Cada archivo de la app (la página, cada .js, cada .css) le preguntaba a la
 * suite «¿quién es?» (/yo, ~0.7 s medido en staging): nueve veces por cada
 * carga. Ahora, cuando la suite dice que sí, se recuerda 5 min por sesión en
 * la memoria de este Worker. Sólo se recuerda el sí: quien no pasó vuelve a
 * preguntar, así entra en cuanto tenga sesión. No abre ningún dato: la API
 * sigue revisando sesión, empresa y permiso en CADA pedido por `/s101`. Si la
 * API contesta 401 a esa sesión, o sale por `/auth/salir`, se olvida.
 * La llave es un SHA-256 de la galleta `s101`: aquí no se guarda ninguna. */
const PASARON = new Map();
const VIVE_MS = 5 * 60 * 1000;
const CUANTAS = 2000;
async function llaveDeSesion(req) {
  const galleta = req.headers.get('cookie') || '';
  const s101 = galleta.split(';').map((x) => x.trim()).find((x) => x.startsWith('s101='));
  if (!s101) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s101));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function recuerda(llave) {
  if (PASARON.size >= CUANTAS) PASARON.delete(PASARON.keys().next().value);
  PASARON.set(llave, Date.now() + VIVE_MS);
}
function yaPaso(llave) {
  const vence = PASARON.get(llave);
  if (!vence) return false;
  if (vence < Date.now()) { PASARON.delete(llave); return false; }
  return true;
}
/** Para las pruebas: empezar sin nada recordado. */
export const olvidaSesiones = () => PASARON.clear();

/** ¿Se le entrega la app? Pregunta a la suite sólo si no la recuerda. */
async function pasaLaPuerta(req, env) {
  const llave = await llaveDeSesion(req);
  if (!llave) return false;
  if (yaPaso(llave)) return true;
  const abre = laSuiteLeAbre(await laSuiteDiceQuien(req, env));
  if (abre) recuerda(llave);
  return abre;
}

/** El dueño de la suite entra a todo; a los demás se lo dice la lista de apps
 *  que les puso quien administra su empresa. Vacía quiere decir todas. */
export const laSuiteLeAbre = (yo) =>
  !!yo && (yo.superadmin === true ||
    (yo.orgs || []).some((o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP)));

/* workers.dev redirige al dominio propio y http sube a https; sólo lecturas y
 * nunca la puerta a la suite. Staging no tiene DOMINIO_PROPIO y no redirige.
 * 11-oct-2026 · lo mismo para DOMINIO_ANTERIOR (lista separada por comas):
 * la suite se mudó a suite101.app y las ligas de taller101.com acaban aquí. */
export function aDominioPropio(req, env, u) {
  const d = env.DOMINIO_PROPIO;
  const lectura = req.method === 'GET' || req.method === 'HEAD';
  if (d && u.protocol === 'http:' && u.hostname === d && lectura) {
    return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
  }
  const anteriores = String(env.DOMINIO_ANTERIOR || '').split(',').map((s) => s.trim()).filter(Boolean);
  const vieja = u.hostname.endsWith('.workers.dev') || anteriores.includes(u.hostname);
  if (!d || u.hostname === d || !vieja) return null;
  if (!lectura) return null;
  if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) return null;
  return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const ida = aDominioPropio(req, env, u);
    if (ida) return ida;

    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', APP);
      const resp = await env.API.fetch(r);
      // La suite ya no reconoce esta sesión, o se fue: que la puerta lo sepa.
      if (resp.status === 401 || u.pathname === '/auth/salir') {
        const llave = await llaveDeSesion(req);
        if (llave) PASARON.delete(llave);
      }
      return resp;
    }

    if (esAbierto(archivo(u))) return pedirArchivo(req, u, env);

    // Todo lo demás —empezando por la app y su semilla— pide sesión.
    if (!(await pasaLaPuerta(req, env))) {
      // Una página se manda a entrar; un archivo suelto (un .js, la semilla)
      // contesta 401, que es lo que un `fetch` sabe leer.
      const esPagina = archivo(u) === '/index.html' || (req.headers.get('accept') || '').includes('text/html');
      if (!esPagina) return new Response('sin sesión', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return Response.redirect(new URL('/entrar.html', u.origin).toString(), 302);
    }
    return pedirArchivo(req, u, env);
  },
};
