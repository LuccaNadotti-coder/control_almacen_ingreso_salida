'use strict';

/* ---------------------------------------------------------------------------
 * El documento HTML que se manda a la impresora.
 *
 * Se arma como un archivo suelto y se carga en una ventana OCULTA aparte.
 * Nunca se imprime la ventana de la aplicación: saldrían la barra lateral y los
 * botones en el papel.
 *
 * El script de adentro mide el ancho real de una línea de N caracteres y ajusta
 * el tamaño de letra hasta que entre. NO se puede fijar: 42 caracteres a 10 pt
 * no entran en 69 mm, y cada PC tiene fuentes distintas.
 *
 * LA BOLETA SE PEGA AL BORDE IZQUIERDO DE LA HOJA, con `body { width; padding }`.
 * Nunca con `margin: 0 auto`. Centrar quiere decir «repartir el sobrante de la
 * hoja», y la hoja no siempre es el papel: cuando la boleta se manda sin pedirle
 * ninguna medida a la impresora —que es como se evita el espacio en blanco de
 * arriba, ver TRAMPA 9 en `imprimir.js`— Chromium arma la página con su tamaño
 * por omisión, que es CARTA, 216 mm de ancho. Centrada ahí, una boleta de 69 mm
 * arrancaría pasado el milímetro 70, o sea afuera del rollo de 80 mm.
 *
 * Pegada a la izquierda no importa cuánto mida la hoja: la boleta arranca
 * siempre al margen del papel. Para las impresoras cuyo cabezal no imprime
 * centrado está el ajuste «Correr la boleta a los costados», que es explícito y
 * lo maneja quien está mirando el papel.
 * ------------------------------------------------------------------------- */

const { COLUMNAS, margen } = require('./ticket');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Arma el documento completo, listo para escribir a un archivo y cargar.
 *
 * Expone `window.__medidas()` para que el proceso main pueda preguntar cuánto
 * mide la hoja antes de imprimir.
 *
 * Opciones:
 *   anchoMm        ancho del papel (80 / 58 / 210)
 *   texto          texto plano del ticket, o null si es A4
 *   htmlA4         HTML del A4, o null si es ticket
 *   modoMargen     'driver' (margen por relleno del cuerpo) | 'css' (@page)
 *   declararTamano si el @page declara el tamaño de la hoja. Va en false
 *                  cuando se imprime sin pedirle medida a la impresora: ahí la
 *                  hoja la pone el controlador, y una medida distinta declarada
 *                  en el CSS es justo lo que hace que Chromium centre el ticket
 *                  y deje media hoja en blanco arriba.
 *   corrimientoMm  correr la boleta a los costados. Negativo hacia la izquierda.
 */
function documentoBoleta(op) {
  const anchoMm = op.anchoMm;
  const modoMargen = op.modoMargen || 'driver';
  const declararTamano = op.declararTamano !== false;
  const corrimientoMm = Number(op.corrimientoMm) || 0;

  const cols = COLUMNAS[anchoMm] || 42;
  const margenMm = margen(anchoMm);
  const utilMm = anchoMm - margenMm * 2;
  const esA4 = anchoMm >= 200;

  const tamano = declararTamano ? `size: ${anchoMm}mm auto; ` : '';
  const reglaPagina =
    modoMargen === 'css'
      ? `@page { ${tamano}margin: ${margenMm}mm; }`
      : `@page { ${tamano}margin: 0; }`;
  const relleno = modoMargen === 'css' ? '0' : `${margenMm}mm`;

  // El corrimiento viaja INLINE para que también se vea en la vista previa de
  // la pantalla, que recibe solo el `outerHTML` de este elemento.
  const corrimiento = corrimientoMm
    ? ` style="position:relative;left:${corrimientoMm}mm"`
    : '';

  const cuerpo = esA4
    ? `<div id="hoja"${corrimiento}>${op.htmlA4 || ''}</div>`
    : `<pre id="hoja"${corrimiento}>${esc(op.texto || '')}</pre>`;

  const fuente = esA4
    ? 'font-family: Arial, Helvetica, sans-serif; font-size: 10pt;'
    : "white-space: pre; font-weight: 600; line-height: 116%; font-family: Consolas, 'Courier New', 'DejaVu Sans Mono', 'Liberation Mono', monospace;";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Boleta de salida</title>
<style>
  ${reglaPagina}
  html, body { margin: 0; padding: 0; background: #fff; }
  /* Ancho fijo y pegado al borde izquierdo. Nunca centrado. */
  body { padding: ${relleno}; width: ${utilMm}mm; }
  #hoja { color: #000; margin: 0; ${fuente} }
  #regla { position: absolute; visibility: hidden; white-space: pre; top: -9999px; left: 0; }
</style>
</head>
<body>
${cuerpo}
<span id="regla"></span>
<script>
(function () {
  'use strict';
  var COLS = ${cols};
  var UTIL_MM = ${utilMm};
  var MARGEN_MM = ${margenMm};
  var ANCHO_MM = ${anchoMm};
  var MODO = ${JSON.stringify(modoMargen)};
  var ES_A4 = ${esA4 ? 'true' : 'false'};
  var MM_A_PX = 96 / 25.4;   // en CSS 1mm son siempre 96/25.4 px, tambien al imprimir
  var hoja = document.getElementById('hoja');
  var tam = ES_A4 ? 10 : ajustar();

  // El tamano de letra se MIDE, no se fija: 42 caracteres a 10 pt no entran en
  // 69 mm, y cada PC tiene fuentes distintas.
  function ajustar() {
    var objetivo = UTIL_MM * MM_A_PX;
    var regla = document.getElementById('regla');
    var estilo = getComputedStyle(hoja);
    regla.style.fontFamily = estilo.fontFamily;
    regla.style.fontWeight = estilo.fontWeight;
    regla.textContent = new Array(COLS + 1).join('M');

    function anchoCon(pt) {
      regla.style.fontSize = pt + 'pt';
      return regla.getBoundingClientRect().width;
    }
    // estimacion: 1 pt = 25.4/72 mm y un monoespaciado avanza ~0.60 em
    var t = Math.min(13, Math.max(4, (UTIL_MM / (25.4 / 72)) / (COLS * 0.60)));
    var usado = anchoCon(t);
    if (usado > 0) t = Math.min(13, Math.max(4, t * (objetivo / usado)));
    // garantia final: se compara contra el ancho REAL medido, no contra un
    // objetivo teorico, porque el motor redondea la letra a pixeles enteros
    for (var i = 0; i < 200 && anchoCon(t) > objetivo && t > 3; i++) {
      t = Math.round((t - 0.02) * 100) / 100;
    }
    hoja.style.fontSize = t + 'pt';
    return t;
  }

  window.__medidas = function () {
    // NO usar document.documentElement.scrollHeight: devuelve el maximo entre
    // el contenido y el viewport, asi que todas las boletas darian el mismo
    // alto y el rollo continuo botaria papel de mas en cada ticket.
    var rellenoPx = (MODO === 'driver' ? MARGEN_MM : 0) * MM_A_PX;
    var altoContenidoPx = hoja.getBoundingClientRect().height + rellenoPx * 2;
    var altoContenidoMm = altoContenidoPx / MM_A_PX;
    var altoHojaMm = altoContenidoMm + (MODO === 'css' ? MARGEN_MM * 2 : 0);
    var lineas = ES_A4 ? null : hoja.textContent.split('\\n');
    return {
      anchoMm: ANCHO_MM, margenMm: MARGEN_MM, utilMm: UTIL_MM, cols: COLS,
      modoMargen: MODO,
      tamLetraPt: tam,
      altoHojaMm: Math.round(altoHojaMm * 100) / 100,
      lineas: lineas ? lineas.length : null,
      lineaMasLarga: lineas ? Math.max.apply(null, lineas.map(function (l) { return l.length; })) : null,
      html: hoja.outerHTML
    };
  };
})();
</script>
</body>
</html>`;
}

module.exports = { documentoBoleta };
