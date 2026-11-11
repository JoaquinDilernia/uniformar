# Web Uniform.AR · versión nueva

La propuesta de la web nueva está en `index.html`, que funciona sola con la carpeta `assets/`. Abrilo en el navegador para ver todo andando, con animaciones y videos.

Es una página única, corta y moderna, que muestra cuatro cosas: con qué marcas trabajamos, qué hacemos (servicio), los rubros con un vistazo del catálogo, y cómo pedir cotización.

## IMPORTANTE: la intro
**Mantené la intro actual de la web, la animación del logo que se arma.** Va antes del hero, igual que hoy.

## Estructura (en orden)
1. **Header**: va transparente con texto blanco sobre el video y pasa a gris claro con blur cuando se scrollea más allá del hero.
2. **Hero**: el video `assets/video/hero.mp4` ocupa toda la pantalla, con el título gigante "Uniformamos equipos.", un texto corto y dos botones.
3. **Ticker**: una banda negra con los rubros pasando en loop.
4. **"Tu logo, en todo."**: un perchero con las prendas colgadas en fila (barral cromado, gancho y percha de madera). En celular se desliza de costado.
5. **Clientes**: la tira de logos en movimiento.
6. **Servicio (bento)**: "No vendemos ropa. Uniformamos equipos." en una grilla de bloques de distinto tamaño: los dos pilares, el video del bordado, un dato grande (30+), una foto y "Te acompañamos siempre".
7. **Rubros**: un carrusel de tarjetas altas con video o foto de cada rubro y las prendas típicas: Construcción, Gastronomía, Industria y campo (video de camisas), Oficina y comercio, Obra y seguridad. Tiene flechas para avanzar.
7b. **Así quedan**: un carrusel deslizable, con flechas, de videos y fotos de clientes: Pisos Alemanes, El Parmegiano, Mega, Fontana, Gorras y Tela anti desgarro.
8. **Catálogo**: chips que filtran la grilla. Cada prenda va sobre un fondo de color suave y, al tocarla, se suma al mensaje del formulario. Al final está el botón al PDF.
9. **Cómo trabajamos**: el video de telas al lado de 4 pasos.
10. **Franquicias**: un bloque negro a todo el ancho.
11. **Cotizá**: una sección bordó a todo el ancho con el formulario, que abre WhatsApp con el texto armado.
12. **Footer** negro con el logo gigante, y el botón de WhatsApp flotante.

## Animaciones (exactas)
| Dónde | Qué hace | Cuándo | Duración |
|---|---|---|---|
| Intro | La de la web actual (el logo que se arma) | Al entrar | La actual |
| Video hero | Arranca con zoom 104% y va a 100% | Al cargar | 14 s, ease-out |
| Título hero | Cada línea sube desde abajo, como un reveal con máscara | Al cargar | 0,9 s; la 2.ª línea, 0,12 s después |
| Texto y botones del hero | Aparecen con fade | Al cargar | 0,8 s, con 0,5 s de delay |
| Indicador de scroll | Línea que baja en loop | Siempre | 1,8 s |
| Header | Pasa de transparente a sólido | Al pasar el 75% del alto del hero | 0,35 s |
| Ticker de rubros | Desplazamiento horizontal infinito | Siempre | 30 s por vuelta |
| Prendas colgadas | Balanceo suave permanente (±0,8°), desfasado entre prendas | Siempre | 7 s por ciclo |
| Prenda colgada (hover) | Se hamaca (6°, -4°, 2°, 0°) y aparece su nombre abajo | Hover | 1 s |
| Perchero en celular | Scroll horizontal; con mouse se arrastra | Drag | Nativo |
| Logos de clientes | Desplazamiento infinito, en gris; a color en hover; se frena en hover | Siempre | 40 s por vuelta |
| Secciones y bloques | Suben 28 px con fade | Al entrar en pantalla (12% visible) | 0,8 s, cubic-bezier(.2,.8,.2,1) |
| Tarjetas de rubros | La foto o el video hace zoom suave | Hover | 0,8 s |
| Catálogo | Las prendas aparecen escalonadas al cambiar de filtro; en hover rotan -2° y crecen 7%, y aparece un botón "+" | Filtro / hover | 0,45 s, 40 ms entre cada una |
| Botones | La flecha se corre 4 px | Hover | 0,25 s |

Todo respeta `prefers-reduced-motion`: si el usuario lo tiene activado, no se anima nada.

## Videos (en `assets/video/`)
Ya están comprimidos para web, sin audio y en loop, cada uno con su póster `.jpg`.
- `hero.mp4`: montaje horizontal (obra, pádel, camisa). Ya está cortado sin el cierre del logo.
- `construccion.mp4`: Grupo B en obra (tarjeta del rubro Construcción).
- `camisas.mp4`: tarjeta del rubro Industria y campo.
- `pisos.mp4`, `parmegiano.mp4`, `mega.mp4`, `gorras.mp4`, `ripstop.mp4`: van en el carrusel "Así quedan".
- `costura.mp4`: bordado del logo.
- `gastronomia.mp4`: combo gastronomía.
- `polares.mp4`: buzos polares.
- `telas.mp4`: detalle de telas y parche.

## Qué reemplazar
- **Logo**: hoy está escrito como texto ("UNIFORM·AR"). Reemplazalo por `Logo Uniform-ar NEGRO.png` y `BLANCO.png`, que están en el Drive de Uniform.AR, carpeta LOGOS. En el header va el blanco sobre el video y el negro al scrollear.
- **Logos de clientes**: se leen de `assets/clientes/*.png`, con los mismos nombres que ya usa la web actual. Faltan Yaguar y Grupo B.
- **Catálogo PDF**: está en `assets/Catalogo_UniformAR_2026.pdf`.

## Datos editables
Todo el contenido variable está arriba del `<script>` final:
- `RACK`: las prendas del perchero y el ancho de cada una en px.
- `CLIENTES`: los logos.
- `RUBROS_CARDS`: las tarjetas de rubros, con su video o foto y sus prendas.
- `RUBROS` y `PRODUCTOS`: los filtros y la grilla del catálogo.
- `WA`: el número de WhatsApp.

## Estilo
- **Colores**: fondo gris neutro `#F3F2F0` (nada de crema), negro `#141113`, bordó `#765E6E` y lila `#E9DDE3`. Los fondos pastel del catálogo están en `TINTS`.
- **Tipografía**: Archivo para los títulos (800/900, tracking -0,04em) y DM Sans para los textos.
- **Bordes**: radios de 28 px. Botones tipo pill del ancho del texto.

## Qué se saca respecto de la versión actual
- El selector v1/v2.
- El fondo crema.
- Los textos largos.
- Las secciones repetidas: el boceto ahora es un paso del proceso.
- El formulario largo.

## Datos a confirmar con Uniform.AR
- La entrega es de 20 a 30 días hábiles desde la seña.
- La muestra física se hace solo en pedidos grandes.
- El pedido mínimo es de 30 prendas.
- El envío es gratis.
