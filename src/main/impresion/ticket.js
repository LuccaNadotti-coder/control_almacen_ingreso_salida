'use strict';

/* ---------------------------------------------------------------------------
 * Armado de la BOLETA DE SALIDA DE MERCADERÍA en texto monoespaciado y en A4.
 *
 * Mismo modelo que el vale del inventario de utilitarios, pero con el dominio
 * de este sistema: en vez de artículo + unidad, cada línea es
 * modelo / color / talla con la cantidad que sale del almacén.
 *
 * Las constantes de columnas NO se escriben a mano en ningún otro lado: si el
 * ancho de la cantidad y la sangría de las líneas de abajo no salen las dos de
 * SANGRIA_ITEM, el ticket sale con las columnas corridas.
 * ------------------------------------------------------------------------- */

/** Cuántos caracteres entran a lo ancho en cada papel. */
const COLUMNAS = { 80: 42, 58: 30, 210: 80 };

/** Columna de la cantidad: 5 caracteres + un espacio. El modelo arranca en 6. */
const ANCHO_CANT = 5;
const SANGRIA_ITEM = ANCHO_CANT + 1;
/** Ancho de la columna de los rótulos de la cabecera («N° BOL. :»). */
const SANGRIA_CAMPO = 10;

/**
 * Margen del papel, por lado, en milímetros.
 *
 * El área que un rollo imprime de verdad es más angosta que el papel (en un
 * rollo de 80 mm suelen ser unos 72 mm, centrados), así que con 3 mm lo que
 * arranca pegado al borde izquierdo termina fuera del área por el otro extremo
 * y la impresora se come la punta derecha de cada línea.
 *
 * El texto NO se achica a mano: al reducir el ancho útil, el ajuste automático
 * de `documento.js` recalcula el tamaño de letra solo.
 */
function margen(anchoMm) {
  if (anchoMm >= 200) return 12.0;
  return anchoMm >= 70 ? 5.5 : 4.5;
}

/* ------------------------------------------------------------- utilidades */

function rjust(s, n) {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function ljust(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function rstrip(s) {
  return s.replace(/\s+$/, '');
}

/** Igual que `str.center()` de Python, incluido su reparto impar del sobrante. */
function center(s, ancho) {
  const marg = ancho - s.length;
  if (marg <= 0) return s;
  const izq = Math.floor(marg / 2) + (marg & ancho & 1);
  return ' '.repeat(izq) + s + ' '.repeat(marg - izq);
}

/** Parte un texto largo en varias líneas de ese ancho, sin cortar palabras. */
function cortar(texto, ancho) {
  const palabras = String(texto ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const lineas = [];
  let actual = '';
  for (let p of palabras) {
    if (p.length > ancho) {
      if (actual) {
        lineas.push(actual);
        actual = '';
      }
      while (p.length > ancho) {
        lineas.push(p.slice(0, ancho));
        p = p.slice(ancho);
      }
    }
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= ancho) actual += ' ' + p;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

/** Red de seguridad final: ninguna línea puede pasarse del ancho del papel. */
function limitar(lineas, cols) {
  const salida = [];
  for (const l of lineas) {
    if (l.length <= cols) salida.push(l);
    else salida.push(...cortar(l, cols));
  }
  return salida;
}

function centrado(texto, cols) {
  return cortar(texto, cols)
    .filter(Boolean)
    .map((l) => rstrip(center(l, cols)));
}

/** Una línea «ROTULO : valor», sangrando la continuación bajo el valor. */
function campo(rotulo, valor, cols) {
  const ancho = Math.max(8, cols - SANGRIA_CAMPO);
  return cortar(valor, ancho).map((l, i) => rstrip(ljust(i === 0 ? rotulo : '', SANGRIA_CAMPO) + l));
}

/**
 * Las dos firmas. En papel angosto (< 38 columnas) van una debajo de la otra.
 *
 * Debajo de cada rótulo va un SEGUNDO renglón, en blanco, para escribir el
 * nombre a mano. El encargado que recibe ya viaja impreso en la cabecera, pero
 * quien entrega del almacén no se digita: se firma en el papel.
 *
 *      ________________        ________________
 *      ENTREGUE CONFORME       RECIBI CONFORME
 *      ________________        ________________
 *      NOMBRE                  NOMBRE
 */
function bloqueFirmas(cols) {
  const raya = '_'.repeat(Math.max(10, cols - 10));
  if (cols >= 38) {
    const media = Math.floor(cols / 2);
    const anchoRaya = Math.max(8, media - 4);
    const rayaDoble = center('_'.repeat(anchoRaya), media) + center('_'.repeat(anchoRaya), media);
    return [
      '',
      '',
      '',
      rayaDoble,
      center('ENTREGUE CONFORME', media) + center('RECIBI CONFORME', media),
      '',
      rayaDoble,
      rstrip(center('NOMBRE', media) + center('NOMBRE', media)),
    ];
  }
  return [
    '',
    '',
    '',
    rstrip(center(raya, cols)),
    rstrip(center('ENTREGUE CONFORME', cols)),
    '',
    rstrip(center(raya, cols)),
    rstrip(center('NOMBRE', cols)),
    '',
    '',
    rstrip(center(raya, cols)),
    rstrip(center('RECIBI CONFORME', cols)),
    '',
    rstrip(center(raya, cols)),
    rstrip(center('NOMBRE', cols)),
  ];
}

/* ------------------------------------------------------------------ fecha */

function dmy(iso) {
  const p = String(iso ?? '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso ?? '');
}

/* ---------------------------------------------------------------- detalle */

/**
 * Arma las líneas del detalle.
 *
 * Primera línea: cantidad + modelo. Debajo, sangrado bajo el modelo, el color
 * y la talla, que es lo que distingue una prenda de otra del mismo modelo.
 */
function lineasDetalle(items, cols) {
  const anchoNombre = Math.max(8, cols - SANGRIA_ITEM);
  const cuerpo = [];

  for (const it of items) {
    const cant = String(it.cantidad);
    const partes = cortar(it.modelo, anchoNombre);
    cuerpo.push(rjust(cant.slice(0, ANCHO_CANT), ANCHO_CANT) + ' ' + partes[0]);
    for (const extra of partes.slice(1)) cuerpo.push(' '.repeat(SANGRIA_ITEM) + extra);

    const pie = `${it.color} - TALLA ${it.talla}`;
    for (const l of cortar(pie, anchoNombre)) cuerpo.push(' '.repeat(SANGRIA_ITEM) + l);
  }
  return cuerpo;
}

/* ------------------------------------------------------------------ texto */

/** Texto plano de la boleta de salida (80 o 58 mm). */
function textoTicketSalida(v, anchoMm) {
  const cols = COLUMNAS[anchoMm] || 42;
  const linea = '-'.repeat(cols);
  const doble = '='.repeat(cols);

  const cuerpo = lineasDetalle(v.items, cols);
  const totalLineas = v.items.length;
  const totalPrendas = v.items.reduce((s, it) => s + Number(it.cantidad), 0);

  const cabecera = ['SALIDA DE MERCADERIA', linea];
  cabecera.push(...campo('N° BOL. :', v.numero, cols));
  cabecera.push(...campo('FECHA   :', dmy(v.fecha), cols));
  cabecera.push(...campo('AREA    :', v.area, cols));
  cabecera.push(...campo('ENCARG. :', v.encargado, cols));
  if (v.observacion) cabecera.push(...campo('OBSERV. :', v.observacion, cols));

  // Una boleta anulada no se borra (regla 5), así que puede imprimirse. Tiene
  // que gritarlo: si no, el papel anulado se confunde con uno válido.
  const avisoAnulada = v.anulada
    ? [linea].concat(
        centrado('*** BOLETA ANULADA ***', cols),
        v.motivoAnulacion ? campo('MOTIVO  :', v.motivoAnulacion, cols) : []
      )
    : [];

  const encabezadoTabla = [rjust('CANT', ANCHO_CANT) + ' ' + 'ARTICULO'];

  const pie = [
    linea,
    ljust('TOTAL DE LINEAS:', cols - 8) + rjust(String(totalLineas), 8),
    ljust('TOTAL DE PRENDAS:', cols - 8) + rjust(String(totalPrendas), 8),
    doble,
  ];

  let membrete = centrado((v.empresa || 'SFIDA').toUpperCase(), cols);
  if (v.empresaDir) membrete = membrete.concat(centrado(v.empresaDir.toUpperCase(), cols));
  if (v.empresaRuc) membrete = membrete.concat(centrado(`RUC ${v.empresaRuc}`, cols));

  const lineas = [].concat(
    membrete,
    [linea],
    cabecera,
    avisoAnulada,
    [linea],
    encabezadoTabla,
    [linea],
    cuerpo,
    pie,
    bloqueFirmas(cols),
    [''],
    centrado(`Impreso el ${v.impresoEl}`, cols),
    centrado('SFIDA - Control de salidas de almacen', cols),
    // Tres líneas en blanco: si no, la cuchilla corta el texto.
    ['', '', '']
  );

  return limitar(lineas, cols).join('\n');
}

/* --------------------------------------------------------------------- A4 */

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Versión A4, con tabla de verdad, para archivar. */
function htmlA4Salida(v) {
  let totalPrendas = 0;
  const celda = 'padding:6px;border-bottom:1px solid #ddd';
  const filas = v.items
    .map((it) => {
      totalPrendas += Number(it.cantidad);
      return (
        '<tr>' +
        `<td style="${celda}">${esc(it.modelo)}</td>` +
        `<td style="${celda}">${esc(it.color)}</td>` +
        `<td style="${celda}">${esc(it.talla)}</td>` +
        `<td align="right" style="${celda};font-variant-numeric:tabular-nums">${Number(it.cantidad)}</td>` +
        '</tr>'
      );
    })
    .join('');

  const obs = v.observacion
    ? `<p style="font-size:10pt"><b>Observaci&oacute;n:</b> ${esc(v.observacion)}</p>`
    : '';

  const anulada = v.anulada
    ? '<p style="font-size:12pt;font-weight:bold;color:#9B2E48;border:2px solid #9B2E48;' +
      'padding:8px;text-align:center;margin:10px 0">BOLETA ANULADA' +
      (v.motivoAnulacion ? ` &middot; ${esc(v.motivoAnulacion)}` : '') +
      '</p>'
    : '';

  return (
    '<table width="100%"><tr>' +
    `<td><div style="font-size:20pt;font-weight:bold">${esc(v.empresa)}</div>` +
    `<div style="font-size:8pt;color:#555">${esc(v.empresaDir)}` +
    (v.empresaRuc ? `  &middot;  RUC ${esc(v.empresaRuc)}` : '') +
    '</div></td>' +
    '<td align="right"><div style="font-size:13pt;font-weight:bold">BOLETA DE SALIDA DE MERCADER&Iacute;A</div>' +
    `<div style="font-size:14pt;font-weight:bold">N&deg; ${esc(v.numero)}</div>` +
    `<div style="font-size:9pt;color:#555">${dmy(v.fecha)}</div></td>` +
    '</tr></table>' +
    '<hr style="border:0;border-top:2px solid #111">' +
    anulada +
    '<table width="100%" style="font-size:10pt" cellpadding="4">' +
    `<tr><td width="50%"><b>&Aacute;rea destino:</b> ${esc(v.area)}</td>` +
    `<td><b>Encargado que recibe:</b> ${esc(v.encargado)}</td></tr>` +
    '</table><br>' +
    '<table width="100%" cellspacing="0" style="font-size:10pt">' +
    '<tr style="background:#9B2E48;color:#ffffff">' +
    '<th align="left" style="padding:7px">Modelo</th>' +
    '<th align="left" style="padding:7px" width="20%">Color</th>' +
    '<th align="left" style="padding:7px" width="12%">Talla</th>' +
    '<th align="right" style="padding:7px" width="14%">Cantidad</th></tr>' +
    filas +
    '</table>' +
    `<p style="font-size:10pt"><b>Total de l&iacute;neas:</b> ${v.items.length}` +
    ` &nbsp;&nbsp; <b>Total de prendas:</b> ${totalPrendas}</p>` +
    obs +
    '<br><br><br>' +
    '<table width="100%" style="font-size:9pt"><tr>' +
    '<td align="center">__________________________<br>Entregu&eacute; conforme' +
    '<br><br>__________________________<br>Nombre</td>' +
    '<td align="center">__________________________<br>Recib&iacute; conforme' +
    '<br><br>__________________________<br>Nombre</td>' +
    '</tr></table>' +
    '<p style="font-size:7.5pt;color:#888;text-align:center">' +
    `SFIDA &middot; Control de salidas y devoluciones de almac&eacute;n &middot; Impreso el ${esc(v.impresoEl)}</p>`
  );
}

module.exports = {
  COLUMNAS,
  ANCHO_CANT,
  SANGRIA_ITEM,
  SANGRIA_CAMPO,
  margen,
  center,
  cortar,
  limitar,
  centrado,
  campo,
  bloqueFirmas,
  dmy,
  textoTicketSalida,
  htmlA4Salida,
};
