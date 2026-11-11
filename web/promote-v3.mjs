// Publica la v3 como página principal: genera dist/index.html a partir de v3/index.html.
// - Las rutas de la v3 ("assets/…" propias y "../assets/…" compartidas) se reescriben para servirse desde la raíz.
// - Se suma el SEO de la web anterior (Open Graph, Twitter, geo y JSON-LD) y se indexa.
// - /v2/ y /v3/ quedan como redirección a la raíz (versiones viejas ocultas).
// Uso: node web/promote-v3.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const v3 = fs.readFileSync(path.join(dir, 'v3/index.html'), 'utf8');
const seoSource = fs.readFileSync(path.join(dir, 'v1/index.html'), 'utf8');

const SHARED = '\u0000SHARED\u0000';
let html = v3
  .replaceAll('../assets/', SHARED)
  .replace(/(^|[^./\w-])assets\//g, '$1v3/assets/')
  .replaceAll(SHARED, 'assets/');

// SEO de la web anterior: todo lo que va entre los íconos y la tipografía
const head = seoSource.slice(0, seoSource.indexOf('</head>'));
const pick = (re) => (head.match(re) ?? []).join('\n');
const seo = [
  pick(/<meta name="geo\.[^>]*>/g),
  pick(/<meta property="og:[^>]*>/g),
  pick(/<meta name="twitter:[^>]*>/g),
  pick(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g),
].filter(Boolean).join('\n');

html = html
  .replace(/<!-- v3 en revisión[^>]*-->\n?/, '')
  .replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow, max-image-preview:large">')
  .replace(/(<link rel="canonical"[^>]*>)/, `$1\n${seo}`);

for (const bad of ['noindex', '../assets/']) if (html.includes(bad)) throw new Error(`Quedó "${bad}" en la página principal`);

const redirect = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<link rel="canonical" href="https://www.uniformar.ar/"><meta http-equiv="refresh" content="0; url=/">
<title>Uniform.AR</title><script>location.replace('/' + location.hash)</script></head>
<body><a href="/">Ir a Uniform.AR</a></body></html>
`;

const dist = path.join(dir, 'dist');
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, 'v2/index.html'), redirect);
fs.writeFileSync(path.join(dist, 'v3/index.html'), redirect);
console.log('dist/index.html = v3 · v2/ y v3/ redirigen a /');
