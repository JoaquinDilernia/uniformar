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

// Dominio único: uniformar.ar sin www (www redirige con 301 desde el .htaccess)
const SITE = 'https://uniformar.ar';
// Imagen al compartir el link (WhatsApp, Facebook, LinkedIn). Nombre nuevo para que no salga la vieja de caché.
const OG_IMAGE = `${SITE}/assets/og-camisa.jpg`;
const OG_ALT = 'Camisa de grafa verde con el logo de Uniform.AR bordado en el pecho';
const DESCRIPTION = 'Ropa de trabajo y uniformes con el logo de tu empresa, bordado o estampado, para todos los rubros. Desde 30 prendas y con envío gratis a todo el país.';

// SEO de la web anterior: todo lo que va entre los íconos y la tipografía
const head = seoSource.slice(0, seoSource.indexOf('</head>'));
const pick = (re) => (head.match(re) ?? []).join('\n');
// Datos estructurados: solo la empresa y el sitio. Las prendas sin precio y las preguntas frecuentes de la web
// anterior no están en la v3 (o les falta el precio) y Google las marca como error.
const KEEP = new Set(['ClothingStore', 'WebSite']);
const jsonld = (head.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []).map((block) => {
  const data = JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/g, ''));
  const kept = (Array.isArray(data) ? data : [data]).filter((d) => KEEP.has(d['@type']));
  return kept.length ? `<script type="application/ld+json">${JSON.stringify(kept)}</script>` : '';
}).filter(Boolean).join('\n');
const seo = [
  pick(/<meta name="geo\.[^>]*>/g),
  pick(/<meta property="og:[^>]*>/g),
  pick(/<meta name="twitter:[^>]*>/g),
  jsonld,
].filter(Boolean).join('\n');

html = html
  .replace(/<!-- v3 en revisión[^>]*-->\n?/, '')
  .replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow, max-image-preview:large">')
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${DESCRIPTION}">`)
  .replace(/(<link rel="canonical"[^>]*>)/, `$1\n${seo}`)
  .replaceAll('https://www.uniformar.ar', SITE)
  .replaceAll(`${SITE}/assets/og.jpg`, OG_IMAGE)
  .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${OG_ALT}">`)
  .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${DESCRIPTION}">`)
  .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${DESCRIPTION}">`);

for (const bad of ['noindex', '../assets/', 'www.uniformar.ar', '/assets/og.jpg']) if (html.includes(bad)) throw new Error(`Quedó "${bad}" en la página principal`);

const redirect = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}/"><meta http-equiv="refresh" content="0; url=/">
<title>Uniform.AR</title><script>location.replace('/' + location.hash)</script></head>
<body><a href="/">Ir a Uniform.AR</a></body></html>
`;

const dist = path.join(dir, 'dist');
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.writeFileSync(path.join(dist, 'v2/index.html'), redirect);
fs.writeFileSync(path.join(dist, 'v3/index.html'), redirect);
console.log('dist/index.html = v3 · v2/ y v3/ redirigen a /');
