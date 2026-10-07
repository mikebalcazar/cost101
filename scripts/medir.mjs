/* Mide lo publicado, desde el corredor. Mirar, no tocar.
 *   STAGING=https://…  o  PROD=https://…   VERSION_ESPERADA=<sha> */
const base = (process.env.STAGING || process.env.PROD || '').replace(/\/$/, '');
const esperada = process.env.VERSION_ESPERADA || '';
const esProd = !!process.env.PROD && !process.env.STAGING;
if (!base) { console.error('falta STAGING o PROD'); process.exit(1); }
let fallas = 0;
const dice = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${que}${dato !== '' ? ' → ' + dato : ''}`); };
const pausa = ms => new Promise(r => setTimeout(r, ms));

console.log(`== cost101 medido en ${base} ==`);

// La portada, con la versión de este commit (el borde tarda unos segundos).
let html = '', estado = 0, version = '';
for (let i = 0; i < 20; i++) {
  try {
    const r = await fetch(base + '/', { headers: { 'cache-control': 'no-cache' } });
    estado = r.status; html = await r.text();
    version = (html.match(/<meta name="cost101-version" content="([^"]*)"/) || [])[1] || '';
    if (estado === 200 && (!esperada || version === esperada)) break;
  } catch (e) { estado = 0; html = String(e); }
  await pausa(3000);
}
dice(estado === 200, 'GET /', estado);
dice(!esperada || version === esperada, 'sirve la versión de este commit', version.slice(0, 12) || '(sin sello)');
dice(html.includes('<title>cost101'), 'el título dice cost101');
dice(html.includes('<x-dc>') && html.includes('data-dc-script'), 'trae la plantilla y la lógica', Math.round(html.length / 1024) + ' KB');

// Los archivos que la portada necesita para abrir.
for (const [ruta, minimo] of [['/support.js', 60000], ['/vendor/react.js', 10000], ['/vendor/react-dom.js', 120000], ['/vendor/babel.js', 3000000], ['/assets/logo-taller101.png', 15000], ['/huella.txt', 5]]) {
  const r = await fetch(base + ruta);
  const n = (await r.arrayBuffer()).byteLength;
  dice(r.status === 200 && n >= minimo, `GET ${ruta}`, `${r.status}, ${n} bytes`);
}
const css = [...html.matchAll(/href="(_ds\/[^"]+\.css)"/g)].map(m => m[1]);
for (const c of css) { const r = await fetch(base + '/' + c); dice(r.status === 200, `GET /${c.slice(0, 40)}…`, r.status); }

// La puerta a la suite, lista para la integración.
const s = await fetch(base + '/s101/salud');
dice(s.status === 200, 'GET /s101/salud (la API por dentro)', s.status + ' ' + (await s.text()).slice(0, 120).replace(/\s+/g, ' '));

// Lo que no existe contesta 404, no la portada.
const n = await fetch(base + '/no-existe-' + Date.now());
dice(n.status === 404, 'una ruta que no existe da 404', n.status);

if (esProd) {
  const h = await fetch(base.replace('https://', 'http://') + '/', { redirect: 'manual' });
  dice([301, 308].includes(h.status), 'http sube a https', h.status + ' → ' + (h.headers.get('location') || ''));
  const w = await fetch('https://cost101.mike-929.workers.dev/', { redirect: 'manual' });
  dice(w.status === 301 && (w.headers.get('location') || '').startsWith(base), 'workers.dev manda al dominio', w.status + ' → ' + (w.headers.get('location') || ''));
}
console.log(fallas ? `${fallas} FALLA(S)` : 'TODO BIEN');
process.exit(fallas ? 1 : 0);
