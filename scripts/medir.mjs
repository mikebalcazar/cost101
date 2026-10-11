/* Mide lo publicado, desde el corredor. Mirar, no tocar.
 *   STAGING=https://…  o  PROD=https://…   VERSION_ESPERADA=<sha>
 *
 * Desde el 7-oct-2026 cost101 no se entrega sin sesión: aquí se mide justo
 * eso —que la puerta esté cerrada— y que lo público (la pantalla de entrada)
 * sí conteste. Lo de adentro lo mide `pruebas/pantalla.spec.mjs`, con sesión. */
const base = (process.env.STAGING || process.env.PROD || '').replace(/\/$/, '');
const esperada = process.env.VERSION_ESPERADA || '';
const esProd = !!process.env.PROD && !process.env.STAGING;
if (!base) { console.error('falta STAGING o PROD'); process.exit(1); }
let fallas = 0;
const dice = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${que}${dato !== '' ? '  →  ' + dato : ''}`); };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/* Un Worker recién nacido tarda en llegar a todos los bordes de Cloudflare:
 * durante el primer minuto, de dos peticiones seguidas una contesta el Worker
 * y la otra la página de «aquí no hay nada» de Cloudflare (un 404 con su
 * HTML, ~20 KB). Le pasó al primer despliegue de staging el 7-oct-2026: seis
 * «fallas» que no eran de cost101. Esa página se reconoce y se vuelve a
 * pedir; un 404 del propio Worker (el de `404.html`) no se reintenta. */
const esDeCloudflare = (estado, cuerpo) => estado >= 500 || (estado === 404 && /cf-error|no-js ie6|cloudflare/i.test(cuerpo));
async function pide(ruta, o = {}) {
  let ultimo = null;
  for (let i = 0; i < 24; i++) {
    const r = await fetch((ruta.startsWith('http') ? '' : base) + ruta, { redirect: 'manual', ...o });
    const copia = r.clone();
    const cuerpo = r.status === 404 || r.status >= 500 ? await copia.text() : '';
    if (!esDeCloudflare(r.status, cuerpo)) return r;
    ultimo = r; await pausa(5000);
  }
  return ultimo;
}

console.log(`== cost101 medido en ${base} ==`);

// La versión de este commit, en la huella pública (el borde tarda unos segundos).
let version = '', estado = 0;
for (let i = 0; i < 20; i++) {
  try { const r = await pide('/huella.txt', { headers: { 'cache-control': 'no-cache' } }); estado = r.status; version = (await r.text()).trim(); if (estado === 200 && (!esperada || version === esperada)) break; } catch (e) { estado = 0; version = String(e); }
  await pausa(3000);
}
dice(estado === 200 && (!esperada || version === esperada), 'sirve la versión de este commit', version.slice(0, 12) || '(sin huella)');

// La puerta: sin sesión, la app no se entrega.
const raiz = await pide('/');
dice(raiz.status === 302 && (raiz.headers.get('location') || '').endsWith('/entrar.html'), 'sin sesión, / manda a entrar', `${raiz.status} → ${raiz.headers.get('location') || ''}`);
for (const ruta of ['/index.html', '/support.js', '/semilla.json', '/vendor/babel.js']) {
  const r = await pide(ruta);
  const cuerpo = await r.text();
  dice((r.status === 401 || r.status === 302) && !cuerpo.includes('data-dc-script') && cuerpo.length < 2000, `sin sesión, ${ruta} no se entrega`, `${r.status}, ${cuerpo.length} bytes`);
}

// Lo público: la pantalla de entrada y lo que ella pide.
const entrar = await pide('/entrar.html');
const html = await entrar.text();
dice(entrar.status === 200 && html.includes('<title>cost101') && html.includes('id="b-google"'), 'la pantalla de entrada contesta y es la de la suite', `${entrar.status}, ${html.length} bytes`);
for (const [ruta, minimo] of [['/entrar.js', 5000], ['/fonts/raleway-400.woff2', 10000], ['/fonts/sansation-700.woff2', 5000], ['/favicon.ico', 4000], ['/icono.svg', 500], ['/apple-touch-icon.png', 4000]]) {
  const r = await pide(ruta);
  const n = (await r.arrayBuffer()).byteLength;
  dice(r.status === 200 && n >= minimo, `GET ${ruta}`, `${r.status}, ${n} bytes`);
}
dice(!/fonts\.googleapis|unpkg\.com/.test(html), 'la entrada no le pide nada a otro sitio');

// El puente a la suite.
const s = await pide('/s101/salud');
const salud = await s.text();
dice(s.status === 200 && salud.includes('suite101-api'), 'GET /s101/salud (la API por dentro)', `${s.status} ${salud.slice(0, 110).replace(/\s+/g, ' ')}`);
const yo = await pide('/s101/yo');
dice(yo.status === 401, 'GET /s101/yo sin sesión contesta 401', String(yo.status));
const c = await pide('/s101/orgs/forespot/costos');
dice(c.status === 401, 'los costos de una empresa no se abren sin sesión', String(c.status));

if (esProd) {
  const h = await fetch(base.replace('https://', 'http://') + '/entrar.html', { redirect: 'manual' });
  dice([301, 308].includes(h.status), 'http sube a https', `${h.status} → ${h.headers.get('location') || ''}`);
  const w = await fetch('https://cost101.mike-929.workers.dev/entrar.html', { redirect: 'manual' });
  dice(w.status === 301 && (w.headers.get('location') || '').startsWith(base), 'workers.dev manda al dominio', `${w.status} → ${w.headers.get('location') || ''}`);
  // 11-oct-2026 · la dirección de taller101.com sigue viva y manda a suite101.app.
  const v = await fetch('https://cost101.taller101.com/entrar.html?x=1', { redirect: 'manual' });
  dice(v.status === 301 && v.headers.get('location') === base + '/entrar.html?x=1', 'cost101.taller101.com manda al dominio, con ruta y consulta', `${v.status} → ${v.headers.get('location') || ''}`);
}
console.log(fallas ? `${fallas} FALLA(S)` : 'TODO BIEN');
process.exit(fallas ? 1 : 0);
