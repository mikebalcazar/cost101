/* La puerta del Worker de cost101.
 *
 * Mismo patrón que master101 (decisión D1): la app vive en su propio Worker y
 * le habla a `suite101-api` desde su mismo origen, por `/s101/*`, con un
 * service binding. El Worker pone `X-App: cost101`.
 *
 * HOY (6-oct-2026) la interfaz todavía NO usa la API: es el prototipo de
 * Claude Design tal cual, y guarda en el navegador (localStorage). El puente
 * `/s101/*` queda puesto para la integración que sigue (sesión, licencias por
 * empresa, catálogo compartido).
 *
 * Lo demás son archivos de `public/`, servidos por `env.ASSETS`. */

const PREFIJO = '/s101';

/* workers.dev redirige al dominio propio y http sube a https; sólo lecturas y
 * nunca la puerta a la suite. Staging no tiene DOMINIO_PROPIO y no redirige. */
export function aDominioPropio(req, env, u) {
  const d = env.DOMINIO_PROPIO;
  const lectura = req.method === 'GET' || req.method === 'HEAD';
  if (d && u.protocol === 'http:' && u.hostname === d && lectura) {
    return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
  }
  if (!d || u.hostname === d || !u.hostname.endsWith('.workers.dev')) return null;
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
      r.headers.set('X-App', 'cost101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  },
};
