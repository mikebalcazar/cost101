/* A dónde manda cada dirección, sin red ni navegador: el Worker con un
 * ASSETS y una API de mentiras. Desde el 11-oct-2026 cost101 vive en
 * cost.suite101.app; workers.dev y cost101.taller101.com mandan ahí.
 *   node --test pruebas/dominio.spec.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('api') };
const prod = { DOMINIO_PROPIO: 'cost.suite101.app', DOMINIO_ANTERIOR: 'cost101.taller101.com', ASSETS, API };
const staging = { ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

test('una lectura en workers.dev manda al dominio con 301, con ruta y consulta', async () => {
  const r = await pide('https://cost101.mike-929.workers.dev/entrar.html?x=1', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://cost.suite101.app/entrar.html?x=1');
});
test('la dirección vieja (taller101.com) manda a suite101.app con 301, con ruta y consulta', async () => {
  const r = await pide('https://cost101.taller101.com/partidas/7?x=1&y=2', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://cost.suite101.app/partidas/7?x=1&y=2');
  const h = await pide('http://cost101.taller101.com/entrar.html', prod, { method: 'HEAD' });
  assert.equal(h.status, 301);
  assert.equal(h.headers.get('location'), 'https://cost.suite101.app/entrar.html');
  assert.notEqual((await pide('https://cost101.taller101.com/', prod, { method: 'POST' })).status, 301, 'un POST no se convierte en GET');
});
test('desde la dirección vieja, la puerta a la suite no se redirige', async () => {
  const r = await pide('https://cost101.taller101.com/s101/yo', prod);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'api');
  assert.equal((await pide('https://cost101.taller101.com/s101', prod)).status, 200);
  assert.equal((await pide('https://cost101.mike-929.workers.dev/s101/yo', prod)).status, 200);
});
test('DOMINIO_ANTERIOR acepta varios, separados por comas', async () => {
  const env = { ...prod, DOMINIO_ANTERIOR: ' otro.ejemplo.com , cost101.taller101.com ,' };
  assert.equal((await pide('https://cost101.taller101.com/', env)).headers.get('location'), 'https://cost.suite101.app/');
  assert.equal((await pide('https://otro.ejemplo.com/a', env)).headers.get('location'), 'https://cost.suite101.app/a');
});
test('en el dominio nuevo y en el de una empresa se sirve, sin redirigir', async () => {
  for (const url of ['https://cost.suite101.app/entrar.html', 'https://cost.acme.com/entrar.html']) {
    const r = await pide(url, prod);
    assert.equal(r.status, 200, url);
    assert.equal(await r.text(), 'sitio', url);
  }
});
test('http en el dominio propio sube a https; staging sirve tal cual', async () => {
  const r = await pide('http://cost.suite101.app/?x=1', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://cost.suite101.app/?x=1');
  assert.equal((await pide('https://cost101-staging.mike-929.workers.dev/entrar.html', staging)).status, 200);
});
