// Arma la web pública de Uniform.AR a partir de web/pagina.html.
//   node web/build.mjs --site https://www.uniformar.ar            → web/dist/ (index.html + assets + robots + sitemap), lista para subir
//   node web/build.mjs --site https://x.techdi.com.ar --noindex   → igual, pero sin indexar (demo en un subdominio)
//   node web/build.mjs --fragment out.html                        → un solo archivo con imágenes embebidas (para publicarlo como Artifact)
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
const src = readFileSync(join(here, 'pagina.html'), 'utf8');

const fragmentOut = arg('--fragment');
if (fragmentOut) {
  const inlined = src.replace(/assets\/[\w./-]+\.(png|jpe?g|svg|webp)/g, (path, ext) =>
    `data:${mime[ext]};base64,${readFileSync(join(here, path)).toString('base64')}`);
  writeFileSync(fragmentOut, inlined);
  console.log('fragmento →', fragmentOut);
  process.exit(0);
}

const site = (arg('--site') || 'https://www.uniformar.ar').replace(/\/$/, '');
const noindex = process.argv.includes('--noindex');
const today = new Date().toISOString().slice(0, 10);

const TITLE = 'Ropa de trabajo y uniformes con tu logo | Uniform.AR';
const DESC = 'Uniformes y ropa de trabajo personalizada para empresas: camisas de grafa, pantalones cargo, chombas, buzos y camperas con tu logo bordado o estampado. Desde 30 prendas, envío gratis a todo el país.';

// Prendas y preguntas salen del mismo HTML, así el marcado estructurado no se desfasa del contenido.
const products = [...src.matchAll(/\{id:'(\w+)', art:'(\d+)', name:'([^']+)', type:'([^']+)'.*?fabric:'([^']+)'.*?desc:'([^']+)'/g)]
  .map(([, id, art, name, type, fabric, desc]) => ({ id, art, name, type, fabric, desc }));
const faqs = [...src.matchAll(/<details[^>]*><summary>([^<]+)<i><\/i><\/summary><p>([^<]+)<\/p><\/details>/g)]
  .map(([, q, a]) => ({ q, a }));

const jsonld = [
  {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    '@id': `${site}/#empresa`,
    name: 'Uniform.AR',
    alternateName: 'Uniformar',
    description: DESC,
    url: `${site}/`,
    logo: `${site}/assets/apple-touch-icon.png`,
    image: `${site}/assets/og.jpg`,
    telephone: '+54 9 11 3800-5433',
    email: 'uniformarindumentaria@gmail.com',
    address: { '@type': 'PostalAddress', addressLocality: 'Buenos Aires', addressCountry: 'AR' },
    areaServed: { '@type': 'Country', name: 'Argentina' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' }],
    sameAs: ['https://www.instagram.com/uniform.ar/'],
    knowsAbout: ['ropa de trabajo', 'uniformes para empresas', 'indumentaria laboral', 'bordado de logos', 'estampado de prendas']
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${site}/#web`,
    url: `${site}/`,
    name: 'Uniform.AR',
    inLanguage: 'es-AR',
    publisher: { '@id': `${site}/#empresa` }
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Menú de prendas de trabajo',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: `${p.type} ${p.name}`,
        sku: `ART-${p.art}`,
        description: `${p.desc} Tela: ${p.fabric}. Personalizable con bordado o estampado.`,
        image: `${site}/assets/og.jpg`,
        brand: { '@type': 'Brand', name: 'Uniform.AR' },
        category: 'Ropa de trabajo'
      }
    }))
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }
];

const head = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${noindex ? 'https://www.uniformar.ar' : site}/">
<meta name="theme-color" content="#3a2a31">
<meta name="geo.region" content="AR-B">
<meta name="geo.placename" content="Buenos Aires">
<link rel="icon" href="assets/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preload" as="image" href="assets/nosotros.jpg" fetchpriority="high">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Uniform.AR">
<meta property="og:title" content="Vestí a tu equipo con tu marca | Uniform.AR">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${site}/">
<meta property="og:image" content="${site}/assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Operario con camisa de grafa con el logo bordado de Uniform.AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Vestí a tu equipo con tu marca | Uniform.AR">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${site}/assets/og.jpg">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
`;

// El fragmento trae su propio <title>, descripción y la meta del visor de Artifacts: los reemplaza la cabecera de arriba.
const body = src
  .replace(/^<title>.*<\/title>\n/m, '')
  .replace(/^<meta name="claude:viewport-fit-sides"[^>]*>\n/m, '')
  .replace(/^<meta name="description"[^>]*>\n/m, '');
const styleEnd = body.indexOf('</style>') + '</style>'.length;
const doc = `${head}${body.slice(0, styleEnd)}\n</head>\n<body>\n${body.slice(styleEnd).trim()}\n</body>\n</html>\n`;

const out = join(here, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), doc);
cpSync(join(here, 'assets'), join(out, 'assets'), { recursive: true });
writeFileSync(join(out, 'robots.txt'), noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`);
writeFileSync(join(out, '.htaccess'), `DirectoryIndex index.html
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript image/svg+xml application/json
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/x-icon "access plus 30 days"
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>
`);
console.log(`web/dist listo · ${site} · ${noindex ? 'noindex' : 'indexable'} · ${products.length} prendas, ${faqs.length} preguntas en datos estructurados · ${Math.round(doc.length / 1024)} KB de HTML`);
