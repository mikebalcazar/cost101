// La pantalla de cost101 manejada con un navegador, en celular (390×844) y en
// escritorio (1440×900). Se cuentan elementos, no se mira la captura.
// BASE: dónde está servida (por omisión el servidor local de pruebas).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8795';
let fallas = 0;
const dice = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${que}${dato !== '' ? ' → ' + dato : ''}`); };

const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [nombre, viewport] of [['celular 390×844', { width: 390, height: 844 }], ['escritorio 1440×900', { width: 1440, height: 900 }]]) {
  console.log(`\n== ${nombre} ==`);
  const ctx = await nav.newContext({ viewport });
  const p = await ctx.newPage();
  const errores = [], ajenos = [], rotos = [];
  p.on('pageerror', e => errores.push(String(e.message).slice(0, 200)));
  // Dos ruidos conocidos que no son fallas de la app: (1) la plantilla cruda
  // trae un <path d="{{ … }}"> que el navegador lee una vez antes de que el
  // runtime la esconda; (2) una petición a otro sitio que no sale (la letra de
  // Google en un banco sin internet). Lo propio que falte lo cuenta `rotos`.
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/attribute d: Expected moveto.*\{\{/.test(t) && !/Failed to load resource: net::ERR_/.test(t)) errores.push(t.slice(0, 200)); });
  p.on('request', r => { const h = new URL(r.url()).hostname; if (/unpkg|jsdelivr|cdnjs/.test(h)) ajenos.push(h); });
  p.on('response', r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(BASE).origin) rotos.push(r.status() + ' ' + new URL(r.url()).pathname); });

  const t0 = Date.now();
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.locator('header nav a').first().waitFor({ timeout: 30000 });
  dice(true, 'la app pinta', `${Date.now() - t0} ms`);
  dice((await p.title()).startsWith('cost101'), 'título', await p.title());
  dice((await p.locator('.nav-brand').innerText()).replace(/\s+/g, ' ').toLowerCase().includes('cost101'), 'marca cost101 en la barra');
  dice(!(await p.locator('body').innerText()).toLowerCase().includes('costeo101'), 'ya no dice costeo101');

  const ligas = await p.locator('header nav a').allInnerTexts();
  dice(ligas.length === 5, 'cinco secciones en la barra', ligas.join(' · '));

  // Resumen: los cuatro conteos de la semilla.
  const celdas = (await p.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
  dice(/Insumos base/i.test(celdas) && /Cuadrillas/i.test(celdas) && /Borradores por aprobar/i.test(celdas), 'el Resumen trae sus conteos');

  // Cada sección abre y pinta su encabezado.
  for (const s of ['Catálogo', 'Precios base', 'Cuadrillas', 'Generador', 'Resumen']) {
    await p.locator('header nav a', { hasText: new RegExp('^' + s + '$', 'i') }).click();
    await p.waitForTimeout(150);
    const actual = await p.locator('header nav a[aria-current="page"]').innerText();
    const h1 = await p.locator('h1').first().innerText().catch(() => '');
    dice(actual.toLowerCase() === s.toLowerCase() && h1.length > 0, `abre ${s}`, h1.replace(/\s+/g, ' '));
  }

  // Sin desbordar a lo ancho (las tablas se desplazan dentro de su caja).
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  dice(ancho <= 1, 'la página no se desborda a lo ancho', ancho + ' px');

  // Hacer una partida de punta a punta y que sobreviva a recargar.
  await p.locator('header nav a', { hasText: /^Generador$/i }).click();
  await p.getByPlaceholder('Ej. Muro de tablaroca').fill('Partida de prueba del corredor');
  const agregar = p.locator('select').filter({ hasText: /Agregar/ }).first();
  await agregar.selectOption({ index: 1 });
  await p.waitForTimeout(150);
  await p.getByRole('button', { name: 'Guardar y aprobar' }).click();
  await p.waitForTimeout(300);
  const tras = await p.evaluate(() => JSON.parse(localStorage.getItem('costeo-apu-v1')).partidas.filter(x => x.nombre === 'Partida de prueba del corredor').map(x => x.estado + ' ' + x.comps.length + ' comp'));
  dice(tras.length === 1 && tras[0] === 'aprobado 1 comp', 'guardar y aprobar una partida nueva', tras.join());
  await p.reload({ waitUntil: 'load' });
  await p.locator('header nav a').first().waitFor({ timeout: 30000 });
  const n = await p.evaluate(() => JSON.parse(localStorage.getItem('costeo-apu-v1')).partidas.length);
  dice(n === 17, 'sigue ahí después de recargar', n + ' partidas');
  const base = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('costeo-apu-v1')); return d.insumos.length + ' insumos, ' + d.cuadrillas.length + ' cuadrillas'; });
  dice(base === '60 insumos, 6 cuadrillas', 'la semilla completa: 60 insumos y 6 cuadrillas', base);
  await p.locator('header nav a', { hasText: /^Catálogo$/i }).click();
  dice(await p.getByText('Partida de prueba del corredor').count() >= 1, 'aparece en el catálogo');

  dice(ajenos.length === 0, 'React y Babel salen de aquí, no de otro sitio', ajenos.join() || 'ninguna petición ajena');
  dice(rotos.length === 0, 'ningún archivo propio falta', rotos.join() || 'todos 200');
  dice(errores.length === 0, 'sin errores en la consola', errores.join(' | ') || 'cero');
  await ctx.close();
}
await nav.close();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO BIEN');
process.exit(fallas ? 1 : 0);
