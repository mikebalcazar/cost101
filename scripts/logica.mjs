/* La lógica de la pantalla vive dentro de `public/index.html`, en un
 * <script type="text/x-dc"> que el navegador no revisa hasta que la corre.
 * Esto la saca y le pasa `node --check`, para que un paréntesis de más truene
 * aquí y no en la pantalla de alguien. */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const abre = html.indexOf('<script type="text/x-dc" data-dc-script');
if (abre < 0) { console.error('no encontré la lógica en index.html'); process.exit(1); }
const desde = html.indexOf('>', abre) + 1;
const hasta = html.indexOf('</script>', desde);
const archivo = join(mkdtempSync(join(tmpdir(), 'cost101-')), 'logica.mjs');
writeFileSync(archivo, 'class DCLogic{}\nconst React={createElement(){}};\n' + html.slice(desde, hasta));
execFileSync(process.execPath, ['--check', archivo], { stdio: 'inherit' });
if (/localStorage\.(get|set)Item\(KEY/.test(html)) { console.error('la lógica vuelve a guardar los datos en localStorage'); process.exit(1); }
if (/<(link|script)[^>]+(href|src)="https?:\/\//.test(html)) { console.error('la página le pide algo a otro sitio'); process.exit(1); }
console.log('la lógica de la pantalla compila');
