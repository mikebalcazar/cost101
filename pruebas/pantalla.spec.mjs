/* cost101 manejado con un navegador, contra la API de verdad.
 *
 * Lo que se mide es el camino completo que pidió Mike (7-oct-2026): entrar
 * con la cuenta de la suite, una base de costos que se edita en la plataforma
 * (agregar, quitar, actualizar), el generador que arma partidas con ella, y
 * que todo eso quede en la base de la empresa —no en el navegador—.
 *
 * Cada paso se comprueba DOS veces: en la pantalla y preguntándole a la API
 * por su cuenta. Que la pantalla diga «guardado» no es prueba de nada.
 *
 *   BASE   dónde está cost101 (por omisión el servidor local de pruebas)
 *   API    la suite101-api a la que le habla (sólo para preguntarle directo)
 *
 * Sólo corre contra una API que no sea producción: crea una empresa de
 * prueba (`c101-…`) y al final la borra.
 */
import { chromium } from 'playwright';

const BASE = (process.env.BASE || 'http://127.0.0.1:8796').replace(/\/$/, '');
const API = (process.env.API || 'http://127.0.0.1:8787').replace(/\/$/, '');
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const ORG = `c101-${process.env.GITHUB_RUN_ID || Date.now()}${Number(process.env.GITHUB_RUN_ATTEMPT || 1) > 1 ? '-' + process.env.GITHUB_RUN_ATTEMPT : ''}`.slice(0, 40);
const TIN = `tin-${ORG}@ejemplo.mx`;

let fallas = 0, revisadas = 0;
const dice = (ok, que, dato = '') => { revisadas++; if (!ok) fallas++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${que}${dato !== '' ? '  →  ' + dato : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── la API, preguntada directo (sin pasar por cost101) ── */
let galleta = '';
async function api(ruta, { method = 'GET', body, app = 'cost101', galletaDe } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (app) h['X-App'] = app;
  const g = galletaDe ?? galleta;
  if (g) h.Cookie = g;
  const r = await fetch(API + ruta, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const puesta = r.headers.get('set-cookie');
  if (puesta && galletaDe === undefined) galleta = puesta.split(';')[0];
  let d = {}; try { d = await r.json(); } catch { /* sin JSON */ }
  return { estado: r.status, ...d };
}
const costos = async () => (await api(`/orgs/${ORG}/costos`)).data;

async function preparar() {
  const salud = await api('/salud', { app: '' });
  if (salud.data?.entorno === 'produccion') { console.log('Esta prueba no corre contra producción.'); process.exit(1); }
  const cod = await api('/auth/codigo', { method: 'POST', body: { correo: CORREO }, app: '' });
  if (!cod.data?.codigo_prueba) { console.log('La API no devuelve el código de prueba: ' + JSON.stringify(cod)); process.exit(1); }
  await api('/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data.codigo_prueba }, app: '' });
  const alta = await api('/admin/orgs', { method: 'POST', body: { id: ORG, nombre: 'Constructora de prueba', apps: { cost: true, cotizador: true } }, app: '' });
  dice(alta.estado === 201, 'empresa de prueba con cost101 prendido', `${ORG} · ${alta.estado}`);
  const m = await api(`/admin/orgs/${ORG}/miembros`, { method: 'POST', body: { correo: TIN, rol: 'staff', nombre: 'Tin de prueba' }, app: '' });
  dice(m.estado === 201, 'un miembro que no dirige (staff)', String(m.estado));
}

/** Entra por la pantalla de entrada, como una persona: correo, «no tengo
 *  contraseña», el código (en staging la API lo devuelve en la respuesta) y
 *  la contraseña nueva si la pide. */
async function entrarPorPantalla(p, correo) {
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForURL(/entrar\.html/);
  await p.fill('#correo', correo);
  await p.click('#b-correo');
  const respuesta = p.waitForResponse((r) => r.url().includes('/s101/auth/codigo'));
  await p.click('#b-olvide');
  const codigo = (await (await respuesta).json()).data?.codigo_prueba;
  await p.fill('#codigo', String(codigo));
  await p.click('#b-codigo');
  await Promise.race([p.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20000 }), p.locator('#nueva').waitFor({ state: 'visible', timeout: 20000 })]);
  if (await p.locator('#nueva').isVisible().catch(() => false)) {
    const clave = 'Costeo-de-obra-' + ORG;
    await p.fill('#nueva', clave); await p.fill('#nueva2', clave);
    await p.click('#b-nueva');
    await p.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20000 });
  }
  await p.locator('[data-cuenta]').waitFor({ timeout: 30000 });
}
const ir = async (p, seccion) => { await p.locator('header nav a', { hasText: new RegExp('^' + seccion + '$', 'i') }).click(); await espera(120); };
/** Espera a que el sincronizador termine: «Guardado» y nada en vuelo. */
async function guardado(p) {
  await p.waitForFunction(() => document.querySelector('[data-sync]')?.getAttribute('data-sync') === 'guardando', null, { timeout: 4000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('[data-sync]')?.getAttribute('data-sync') === 'quieto', null, { timeout: 30000 });
  await espera(250);
}
const fila = (p, clave) => p.locator('div', { has: p.locator(`[data-nombre="${clave}"]`) }).last();

const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
function vigilar(p, errores, ajenos, rotos) {
  p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
  // Ruido conocido que no es falla de la app: la plantilla cruda trae un
  // <path d="{{ … }}"> que el navegador lee una vez antes de que el runtime la
  // esconda; y un 401/403/409 que la app provoca a propósito sale en consola
  // como «Failed to load resource». Lo propio que falte lo cuenta `rotos`.
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/attribute d: Expected moveto.*\{\{/.test(t) && !/Failed to load resource/.test(t)) errores.push(t.slice(0, 200)); });
  p.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(BASE).origin && !u.protocol.startsWith('data')) ajenos.push(u.host); });
  p.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 400 && u.origin === new URL(BASE).origin && !u.pathname.startsWith('/s101/')) rotos.push(r.status() + ' ' + u.pathname); });
}

try {
  await preparar();

  /* ══════════ sin sesión no se entrega nada ══════════ */
  console.log('\n== La puerta ==');
  {
    const r = await fetch(BASE + '/', { redirect: 'manual' });
    dice(r.status === 302 && (r.headers.get('location') || '').endsWith('/entrar.html'), 'sin sesión, la app manda a entrar', `${r.status} → ${r.headers.get('location')}`);
    for (const f of ['/support.js', '/semilla.json', '/vendor/react.js']) {
      const x = await fetch(BASE + f, { redirect: 'manual' });
      dice(x.status === 401, `sin sesión, ${f} no se entrega`, String(x.status));
    }
    const e = await fetch(BASE + '/entrar.html');
    dice(e.status === 200 && (await e.text()).includes('cost<span'), 'la pantalla de entrada sí es pública y dice cost101');
    const s = await fetch(BASE + '/s101/orgs/' + ORG + '/costos');
    dice(s.status === 401, 'sin sesión, los costos no se abren por el puente', String(s.status));
  }

  /* ══════════ escritorio: quien dirige ══════════ */
  console.log('\n== Escritorio 1440×900, quien dirige ==');
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errores = [], ajenos = [], rotos = [];
  vigilar(p, errores, ajenos, rotos);

  await entrarPorPantalla(p, CORREO);
  dice(true, 'entra con la cuenta de la suite (correo, código, contraseña)');
  await p.locator('[data-aviso="Tu base de costos está vacía"]').waitFor({ timeout: 30000 });
  dice((await p.locator('[data-rol]').getAttribute('data-rol')) === 'admin', 'la suite dice que puede aprobar');
  dice((await p.locator('[data-empresa]').count()) === 1, 'la empresa se nombra arriba');
  dice((await p.title()).startsWith('cost101'), 'título', await p.title());
  dice(!(await p.locator('body').innerText()).toLowerCase().includes('costeo101'), 'ya no dice costeo101');
  dice((await p.locator('input[name="rol"]').count()) === 0, 'ya no hay selector de rol: el rol viene de la sesión');
  const ligas = await p.locator('header nav a[aria-current]').allInnerTexts();
  dice(ligas.length === 5, 'cinco secciones en la barra', ligas.join(' · '));
  dice((await costos()).costos_base.length === 0, 'la base de la empresa nace vacía (API)');

  // El catálogo de ejemplo
  await p.locator('[data-sembrar]').click();
  await p.getByText('Catálogo de ejemplo cargado').waitFor({ timeout: 40000 });
  let d = await costos();
  dice(d.costos_base.length === 60 && d.cuadrillas.length === 6 && d.productos.length === 16, 'el catálogo de ejemplo quedó en la base de la empresa (API)', `${d.costos_base.length} costos, ${d.cuadrillas.length} cuadrillas, ${d.productos.length} productos`);
  const cifras = (await p.locator('section[data-screen-label="Resumen"]').innerText()).replace(/\s+/g, ' ');
  dice(/Partidas aprobadas 12/i.test(cifras) && /Borradores por aprobar 4/i.test(cifras) && /Insumos base 60/i.test(cifras) && /Cuadrillas 6/i.test(cifras), 'el Resumen cuenta 12 aprobadas, 4 borradores, 60 insumos, 6 cuadrillas');

  // Lo que la pantalla calcula y lo que calculó la API, lado a lado.
  await ir(p, 'Catálogo');
  await p.getByText('PAR-302').first().click();
  const detalle = (await p.locator('section[data-screen-label="Catálogo"]').innerText()).replace(/\s+/g, ' ');
  const muro = d.productos.find((x) => x.codigo === 'PAR-302');
  dice(detalle.includes('$761.63') && muro.desglose.pu === 76163, 'PAR-302: la pantalla y la API dan el mismo precio unitario', `pantalla $761.63 · API ${muro.desglose.pu} centavos · a quote101 (sin IVA) ${muro.precio}`);

  /* ── actualizar un precio base ── */
  console.log('\n-- Precios base: actualizar, agregar, quitar --');
  await ir(p, 'Precios base');
  const precioYeso = fila(p, 'MAT-001').locator('input[type="number"]');
  await precioYeso.fill('260');
  await precioYeso.blur();
  await p.getByText('2 partidas recalculadas').waitFor({ timeout: 10000 });
  await guardado(p);
  d = await costos();
  const yeso = d.costos_base.find((x) => x.clave === 'MAT-001');
  dice(yeso.precio === 26000 && yeso.historial.at(-1).precio === 26000, 'el precio nuevo quedó en la base, con su renglón de historial (API)', `${yeso.precio} · ${yeso.historial.length} renglones`);
  const muro2 = d.productos.find((x) => x.codigo === 'PAR-302');
  dice(muro2.desglose.pu === 76163 + 1341 && muro2.historial.at(-1).m.startsWith('Precio base: Panel de yeso'), 'la API recalculó el producto que lo usa y anotó por qué', `${muro2.desglose.pu} · «${muro2.historial.at(-1).m}»`);
  dice(d.productos.find((x) => x.codigo === 'PAR-101').historial.length === 1, 'el que no lo usa no se movió');

  /* ── agregar ── */
  await p.getByPlaceholder('Descripción').fill('Yeso en polvo de prueba');
  await p.getByPlaceholder('0.00').fill('6.50');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await guardado(p);
  d = await costos();
  const nuevo = d.costos_base.find((x) => x.nombre === 'Yeso en polvo de prueba');
  dice(!!nuevo && nuevo.clave === 'MAT-044' && nuevo.precio === 650 && !nuevo.id.startsWith('tmp-'), 'el insumo nuevo está en la base con su clave y su precio en centavos (API)', nuevo ? `${nuevo.clave} · ${nuevo.precio}` : 'no está');
  dice((await p.locator('[data-nombre="MAT-044"]').count()) === 1, 'y sigue en pantalla después de volver a leer del servidor');

  /* ── actualizar el nombre ── */
  const nombre = p.locator('[data-nombre="MAT-044"]');
  await nombre.fill('Yeso en polvo, saco 40 kg');
  await nombre.blur();
  await guardado(p);
  d = await costos();
  dice(d.costos_base.find((x) => x.clave === 'MAT-044')?.nombre === 'Yeso en polvo, saco 40 kg', 'el nombre corregido quedó en la base (API)');

  /* ── quitar ── */
  await p.locator(`[data-quitar="ins:${nuevo.id}"]`).click();
  dice((await p.locator(`[data-quitar="ins:${nuevo.id}"]`).innerText()).includes('¿Quitar?'), 'quitar pregunta antes (primer toque)');
  await p.locator(`[data-quitar="ins:${nuevo.id}"]`).click();
  await guardado(p);
  d = await costos();
  dice(d.costos_base.length === 60 && !d.costos_base.some((x) => x.clave === 'MAT-044'), 'el insumo se quitó de la base (API)', `${d.costos_base.length} costos`);
  // Uno que una partida usa NO se quita.
  await p.locator(`[data-quitar="ins:${yeso.id}"]`).click();
  await p.locator(`[data-quitar="ins:${yeso.id}"]`).click();
  await p.getByText(/No se puede quitar: lo usa/).waitFor({ timeout: 5000 });
  await espera(900);
  dice((await costos()).costos_base.some((x) => x.clave === 'MAT-001'), 'un insumo que una partida usa no se quita, y la pantalla dice quién lo usa');

  /* ── mano de obra y equipo viven en la misma base ── */
  await p.locator('label.seg-opt', { hasText: /Mano de obra/ }).click();
  await espera(150);
  dice((await p.locator('[data-nombre^="MO-"]').count()) === 10, 'mano de obra: 10 oficios');
  await p.locator('label.seg-opt', { hasText: /Equipo/ }).click();
  await espera(150);
  dice((await p.locator('[data-nombre^="EQ-"]').count()) === 7, 'equipo: 7 renglones');

  /* ── cuadrillas ── */
  console.log('\n-- Cuadrillas --');
  await ir(p, 'Cuadrillas');
  await p.getByRole('button', { name: /Nueva cuadrilla/ }).click();
  await guardado(p);
  d = await costos();
  const cua = d.cuadrillas.find((x) => x.clave === 'CUA-07');
  dice(!!cua, 'la cuadrilla nueva está en la base (API)', cua ? cua.clave : 'no está');
  const tarjeta = p.locator('.blueprint', { hasText: 'CUA-07' });
  await tarjeta.locator('select').last().selectOption({ label: await tarjeta.locator('select').last().locator('option').nth(1).innerText() });
  await guardado(p);
  d = await costos();
  dice(d.cuadrillas.find((x) => x.clave === 'CUA-07')?.miembros.length === 1, 'con su oficio (API)');
  await p.locator(`[data-quitar="cua:${cua.id}"]`).click();
  await p.locator(`[data-quitar="cua:${cua.id}"]`).click();
  await guardado(p);
  dice((await costos()).cuadrillas.length === 6, 'y se quita de la base (API)');

  /* ── el generador ── */
  console.log('\n-- Generador --');
  await ir(p, 'Generador');
  await p.getByPlaceholder('Ej. Muro de tablaroca').fill('Partida armada en la prueba');
  const agregar = p.locator('select').filter({ hasText: /Agregar material/ }).first();
  await agregar.selectOption({ index: 1 });
  await espera(150);
  const cuadrillaSel = p.locator('select').filter({ hasText: /Agregar oficio o cuadrilla/ }).first();
  await cuadrillaSel.selectOption({ index: 1 });
  await espera(200);
  const puPantalla = (await p.getByText('Precio unitario').locator('..').innerText()).replace(/\s+/g, ' ');
  await p.getByRole('button', { name: 'Guardar y aprobar' }).click();
  await guardado(p);
  d = await costos();
  const armada = d.productos.find((x) => x.nombre === 'Partida armada en la prueba');
  const enPesos = armada ? '$' + (armada.desglose.pu / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  dice(!!armada && armada.estado === 'aprobado' && armada.apu.comps.length === 2 && !armada.id.startsWith('tmp-'), 'la partida nueva quedó aprobada en la base, con su receta (API)', armada ? `${armada.codigo} · ${armada.estado} · ${armada.apu.comps.length} componentes` : 'no está');
  dice(!!armada && puPantalla.includes(enPesos), 'el precio que enseñó el generador es el que calculó la API', `${enPesos} · pantalla: ${puPantalla.slice(0, 60)}`);
  dice(!!armada && armada.precio === Math.round(armada.desglose.pu / 1.16) && armada.precio > 0, 'y el que leerá quote101 es ése sin IVA', armada ? `${armada.precio}` : '');
  await ir(p, 'Catálogo');
  dice((await p.getByText('Partida armada en la prueba').count()) >= 1, 'aparece en el catálogo');

  /* ── nada vive en el navegador ── */
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
  await p.reload({ waitUntil: 'load' });
  await p.locator('[data-cuenta]').waitFor({ timeout: 30000 });
  await p.locator('section[data-screen-label="Resumen"]').waitFor({ timeout: 30000 });
  const tras = (await p.locator('section[data-screen-label="Resumen"]').innerText()).replace(/\s+/g, ' ');
  dice(/Partidas aprobadas 13/i.test(tras) && /Insumos base 60/i.test(tras), 'con el navegador vaciado y recargado, todo sigue ahí: viene de la base', tras.match(/Partidas aprobadas \d+/i)?.[0] || '');
  dice(/Panel de yeso[^$]*\$245\.00[^$]*\$260\.00/.test(tras), 'y el cambio de precio sale en «Cambios recientes»');

  /* ── quitar una partida ── */
  await ir(p, 'Catálogo');
  await p.getByText('Partida armada en la prueba').first().click();
  await p.locator(`[data-quitar="par:${armada.id}"]`).click();
  await p.locator(`[data-quitar="par:${armada.id}"]`).click();
  await guardado(p);
  dice((await costos()).productos.length === 16, 'la partida se quitó del catálogo (API)');

  /* ── la salida ── */
  await p.locator('[data-salir]').click();
  await p.waitForURL(/entrar\.html/);
  const fuera = await p.request.get(BASE + '/', { maxRedirects: 0 }).catch((e) => e);
  dice((fuera.status?.() ?? 0) === 302, 'al salir, la app ya no se entrega', String(fuera.status?.()));

  dice(ajenos.length === 0, 'la app no le pide nada a otro sitio (ni letras, ni librerías)', [...new Set(ajenos)].join(', ') || 'cero peticiones ajenas');
  dice(rotos.length === 0, 'ningún archivo propio falta', rotos.join(', ') || 'todos 200');
  dice(errores.length === 0, 'sin errores en la consola', errores.join(' | ') || 'cero');
  await ctx.close();

  /* ══════════ celular: quien NO dirige ══════════ */
  console.log('\n== Celular 390×844, quien no dirige (staff) ==');
  const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const q = await ctx2.newPage();
  const errores2 = [], ajenos2 = [], rotos2 = [];
  vigilar(q, errores2, ajenos2, rotos2);
  await entrarPorPantalla(q, TIN);
  await q.locator('section[data-screen-label="Resumen"]').waitFor({ timeout: 30000 });
  dice((await q.locator('[data-rol]').getAttribute('data-rol')) === 'equipo', 'entra como equipo: la suite dice que no aprueba');
  dice((await q.locator('section[data-screen-label="Resumen"]').getByRole('button', { name: 'Aprobar' }).count()) === 0, 'no se le ofrece aprobar');
  for (const s of ['Catálogo', 'Precios base', 'Cuadrillas', 'Generador', 'Resumen']) {
    await ir(q, s);
    const actual = await q.locator('header nav a[aria-current="page"]').innerText();
    const ancho = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    dice(actual.toLowerCase() === s.toLowerCase() && ancho <= 1, `abre ${s} sin desbordar a lo ancho`, ancho + ' px');
  }
  await ir(q, 'Generador');
  await q.getByPlaceholder('Ej. Muro de tablaroca').fill('Borrador del equipo');
  dice((await q.getByRole('button', { name: 'Guardar y aprobar' }).count()) === 0, 'en el generador sólo puede guardar borrador');
  // En celular el generador va por pasos: Materiales es el paso 2.
  if (await q.getByRole('button', { name: /Siguiente/ }).count()) await q.getByRole('button', { name: /Siguiente/ }).first().click();
  await q.locator('select').filter({ hasText: /Agregar material/ }).first().selectOption({ index: 1 });
  await espera(150);
  await q.getByRole('button', { name: 'Guardar borrador' }).first().click();
  await guardado(q);
  d = await costos();
  const borrador = d.productos.find((x) => x.nombre === 'Borrador del equipo');
  dice(!!borrador && borrador.estado === 'borrador', 'lo que guarda queda en borrador en la base (API)', borrador ? borrador.estado : 'no está');
  // Y si edita una aprobada, regresa a borrador: lo decide la API.
  await ir(q, 'Catálogo');
  await q.getByText('PAR-101').first().click();
  await q.getByRole('button', { name: 'Editar' }).first().click();
  await q.getByPlaceholder('Ej. Muro de tablaroca').fill("Concreto hecho en obra f'c=150 kg/cm², revisado");
  if (await q.getByRole('button', { name: /Siguiente/ }).count()) await q.getByRole('button', { name: /Siguiente/ }).first().click();
  await q.getByRole('button', { name: 'Guardar borrador' }).first().click();
  await guardado(q);
  d = await costos();
  dice(d.productos.find((x) => x.codigo === 'PAR-101')?.estado === 'borrador', 'una aprobada que edita el equipo regresa a borrador (API)');
  dice([...new Set(ajenos2)].length === 0 && rotos2.length === 0 && errores2.length === 0, 'en celular: sin peticiones ajenas, sin archivos faltantes, sin errores', [...new Set(ajenos2), ...rotos2, ...errores2].join(' | ') || 'limpio');
  await ctx2.close();
} catch (e) {
  fallas++;
  console.log('FALLA se rompió a medias: ' + (e?.stack || e).toString().slice(0, 900));
} finally {
  await nav.close();
  const b = await api(`/admin/orgs/${ORG}`, { method: 'DELETE', app: '' });
  console.log(`(empresa de prueba ${ORG} borrada: ${b.estado})`);
}
console.log(fallas ? `\n${fallas} FALLA(S) de ${revisadas}` : `\nTODO BIEN: ${revisadas} comprobaciones`);
process.exit(fallas ? 1 : 0);
