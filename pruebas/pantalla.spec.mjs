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
  dice(ligas.length === 6 && ligas.at(-1).toLowerCase() === 'configuración', 'seis secciones en la barra, la última Configuración', ligas.join(' · '));
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

  /* ── actualizar el nombre ── (Mike, 8-oct: «no hay manera de corregir»: el
   * campo estaba ahí pero sin borde, parecía texto) */
  const nombre = p.locator('[data-nombre="MAT-044"]');
  const borde = await nombre.evaluate((el) => getComputedStyle(el).borderTopColor);
  dice(!/rgba\(0, 0, 0, 0\)|transparent/.test(borde) && (await nombre.getAttribute('title')) === 'Corrige el nombre aquí', 'el nombre se ve como campo que se corrige (con borde)', borde);
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
  /* Sólo el lienzo (Mike, 8-oct: «Deja en cost101 solo la modalidad de
   * lienzo. Ya quita las otras 2»): ni selector ni «Hoja APU» ni «Por pasos»,
   * y se agrega desde la biblioteca. */
  const gen = p.locator('section[data-screen-label="Generador"]');
  dice((await gen.getByText('Enfoque del generador').count()) === 0
    && (await gen.getByText('Hoja APU').count()) === 0 && (await gen.getByText('Por pasos').count()) === 0,
    'el generador ya no ofrece «Hoja APU» ni «Por pasos»: sólo el lienzo');
  dice((await gen.getByRole('heading', { name: 'Biblioteca' }).count()) === 1, 'y abre directo en el lienzo, con su biblioteca');
  await p.locator('[data-titulo]').fill('Partida armada en la prueba');
  dice((await gen.getByText('Título de la partida').count()) === 1 && (await gen.getByText('Descripción para el catálogo').count()) === 1, 'el generador pide título y, aparte, la descripción para el catálogo');
  await p.locator('[data-descripcion]').fill('Lambrín de chapa natural de roble europeo, montaje directo sobre muro liso.\nMódulos de 1.20×2.40 como máximo.');
  await gen.getByRole('button', { name: 'Materiales', exact: true }).click();
  await gen.locator('[data-lib-item]').first().click();
  await espera(150);
  await gen.getByRole('button', { name: 'Cuadrillas', exact: true }).click();
  await gen.locator('[data-lib-item]').first().click();
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
  dice(armada?.descripcion === 'Lambrín de chapa natural de roble europeo, montaje directo sobre muro liso.\nMódulos de 1.20×2.40 como máximo.', 'la descripción quedó en la base, aparte del título (API)', JSON.stringify(armada?.descripcion || '').slice(0, 60));
  await p.getByText('Partida armada en la prueba').first().click();
  const fichaDesc = await p.locator('[data-sel-desc]').innerText().catch(() => '');
  dice(fichaDesc.includes('montaje directo sobre muro liso') && fichaDesc.includes('1.20×2.40'), 'el catálogo enseña el título y abajo la descripción', fichaDesc.slice(0, 50));

  /* ── nada vive en el navegador ── */
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
  await p.reload({ waitUntil: 'load' });
  await p.locator('[data-cuenta]').waitFor({ timeout: 30000 });
  await p.locator('section[data-screen-label="Resumen"]').waitFor({ timeout: 30000 });
  const tras = (await p.locator('section[data-screen-label="Resumen"]').innerText()).replace(/\s+/g, ' ');
  dice(/Partidas aprobadas 13/i.test(tras) && /Insumos base 60/i.test(tras), 'con el navegador vaciado y recargado, todo sigue ahí: viene de la base', tras.match(/Partidas aprobadas \d+/i)?.[0] || '');
  dice(/Panel de yeso[^$]*\$245\.00[^$]*\$260\.00/.test(tras), 'y el cambio de precio sale en «Cambios recientes»');

  /* ── mano de obra por hora o por unidad (Mike, 8-oct) ── */
  console.log('\n-- Mano de obra: hora o unidad --');
  await ir(p, 'Precios base');
  await p.locator('label.seg-opt', { hasText: /Mano de obra/ }).click();
  await espera(150);
  const selUnidadNueva = p.locator('.field', { has: p.locator('label', { hasText: /^Unidad$/ }) }).locator('select').first();
  const opcionesMo = await selUnidadNueva.locator('option').allInnerTexts();
  dice(opcionesMo.join(',') === 'h,unidad', 'al dar de alta mano de obra se escoge hora o unidad', opcionesMo.join(','));
  await p.getByPlaceholder('Descripción').fill('Colocación de chapa a destajo');
  await selUnidadNueva.selectOption('unidad');
  await p.getByPlaceholder('0.00').fill('85');
  await p.getByRole('button', { name: 'Agregar', exact: true }).click();
  await guardado(p);
  d = await costos();
  const destajo = d.costos_base.find((x) => x.nombre === 'Colocación de chapa a destajo');
  dice(destajo?.tipo === 'mo' && destajo?.unidad === 'unidad' && destajo?.precio === 8500, 'quedó como mano de obra por unidad (API)', destajo ? `${destajo.clave} · ${destajo.unidad}` : 'no está');
  await ir(p, 'Cuadrillas');
  const enCuadrilla = await p.locator('section[data-screen-label="Cuadrillas"] select option', { hasText: 'Colocación de chapa a destajo' }).count();
  dice(enCuadrilla === 0, 'en una cuadrilla sólo entran los oficios por hora');

  /* ── configuración (Mike, 8-oct: «¿podríamos abrir un módulo de configuración?») ── */
  console.log('\n-- Configuración --');
  await ir(p, 'Configuración');
  const conf = p.locator('section[data-screen-label="Configuración"]');
  await conf.waitFor({ timeout: 10000 });
  dice((await conf.locator('[data-ind-total]').getAttribute('data-ind-total')) === '12', 'los indirectos nacen en 12 % (oficina 6, campo 4, financiamiento 1, fianzas 1)');
  await conf.getByLabel('Se considera Fianzas y seguros').uncheck();
  await conf.getByLabel('Utilidad', { exact: true }).fill('12');
  await guardado(p);
  dice((await conf.locator('[data-ind-total]').getAttribute('data-ind-total')) === '11', 'quitar uno de la cuenta baja el total a 11 %');
  const aj = await api(`/orgs/${ORG}/ajustes?clave=config`);
  const guardada = aj.data?.filas?.[0]?.valor;
  dice(guardada?.util === 12 && guardada?.indirectos?.find((x) => x.n === 'Fianzas y seguros')?.va === false, 'la configuración quedó en la base de la empresa (API)', JSON.stringify(guardada || {}).slice(0, 80));
  dice((await conf.locator('[data-unidad="mo:h"]').count()) === 1 && (await conf.locator('[data-unidad="mo:unidad"]').count()) === 1, 'mano de obra: hora y unidad');
  await conf.locator('[data-nueva-unidad="material"]').fill('cm');
  await conf.locator('[data-nueva-unidad="material"]').press('Enter');
  await guardado(p);
  dice((await conf.locator('[data-unidad="material:cm"]').count()) === 1, 'se agrega una unidad de material');
  await conf.locator('[data-aplicar]').click();
  await conf.locator('[data-aplicar-si]').click();
  await guardado(p);
  d = await costos();
  const conApu = d.productos.filter((x) => x.apu);
  dice(conApu.length > 0 && conApu.every((x) => x.apu.ind === 11 && x.apu.util === 12), 'aplicar lleva los porcentajes a todas las partidas (API)', `${conApu.length} partidas`);
  await ir(p, 'Resumen');
  await p.getByRole('button', { name: 'Nueva partida' }).click();
  const gen2 = p.locator('section[data-screen-label="Generador"]');
  const campo = (etq) => gen2.locator('.field', { has: p.locator('label', { hasText: etq }) }).locator('input').first();
  const [vInd, vUtil] = [await campo('Indirectos %').inputValue(), await campo('Utilidad %').inputValue()];
  dice(vInd === '11' && vUtil === '12', 'una partida nueva nace con la configuración', `ind ${vInd} · util ${vUtil}`);
  await ir(p, 'Resumen');

  /* ── quitar una partida ── */
  await ir(p, 'Catálogo');
  await p.getByText('Partida armada en la prueba').first().click();
  await p.locator(`[data-quitar="par:${armada.id}"]`).click();
  await p.locator(`[data-quitar="par:${armada.id}"]`).click();
  await guardado(p);
  dice((await costos()).productos.length === 16, 'la partida se quitó del catálogo (API)');

  /* Los costos base que revisó Mike (8-oct-2026) ya están cargados en
   * forespot y eran SUYOS: a otra empresa no se le ofrecen ni se le entregan. */
  dice((await p.locator('[data-cargar-base]').count()) === 0, 'no se ofrecen los costos base de otra empresa');
  dice((await p.request.get(BASE + '/costos-base.json')).status() === 404, 'la lista de forespot ya no se sirve');

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
  await q.locator('[data-titulo]').fill('Borrador del equipo');
  dice((await q.getByRole('button', { name: 'Guardar y aprobar' }).count()) === 0, 'en el generador sólo puede guardar borrador');
  // En celular también es el lienzo: la biblioteca va arriba de las secciones.
  await q.locator('section[data-screen-label="Generador"] [data-lib-item]').first().click();
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
  await q.locator('[data-titulo]').fill("Concreto hecho en obra f'c=150 kg/cm², revisado");
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
