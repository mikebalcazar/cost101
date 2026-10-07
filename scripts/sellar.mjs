/* Escribe el commit en la portada antes de publicar, para que la medición
 * compruebe que Cloudflare ya sirve la copia nueva.
 *   node scripts/sellar.mjs <version>      (sin argumento deja `dev`) */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PORTADA = fileURLToPath(new URL('../public/index.html', import.meta.url));
const version = (process.argv[2] || 'dev').trim();
const marca = /(<meta name="cost101-version" content=")([^"]*)(">)/;
const antes = await readFile(PORTADA, 'utf8');
if (!marca.test(antes)) { console.error('la portada no tiene <meta name="cost101-version">: no se sella a ciegas'); process.exit(1); }
await writeFile(PORTADA, antes.replace(marca, `$1${version}$3`));
await writeFile(new URL('../public/huella.txt', import.meta.url), version + '\n');
console.log(`portada sellada con la versión ${version}`);
