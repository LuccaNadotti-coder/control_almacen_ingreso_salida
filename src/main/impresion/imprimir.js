'use strict';

/* ---------------------------------------------------------------------------
 * Mandar la boleta de salida a la impresora.
 *
 * LAS TRAMPAS, todas marcadas donde aparecen:
 *   1. webContents.print()      -> pageSize en MICRONES  (80 mm = 80000)
 *   2. webContents.printToPDF() -> pageSize en PULGADAS  (80 mm = 3.1496)
 *   3. silent:true necesita deviceName explícito
 *   4. margins:{marginType:'none'} evita que el controlador térmico agregue
 *      márgenes propios encima del relleno del documento
 *   5. medir el elemento, NO document.documentElement.scrollHeight
 *   6. si se destruye la última ventana, Electron cierra la app -> por eso la
 *      ventana oculta nunca es la única viva en el flujo normal
 *   7. esperar document.fonts.ready antes de medir
 *   8. el tamaño de letra se mide, no se fija
 *   9. el alto a medida NO se le pide a la impresora: la centra (ver abajo)
 * ------------------------------------------------------------------------- */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BrowserWindow } = require('electron');

const { documentoBoleta } = require('./documento');
const { textoTicketSalida, htmlA4Salida } = require('./ticket');

const MICRAS_POR_MM = 1000;
const PULGADAS_POR_MM = 1 / 25.4;

/**
 * Cuántas ventanas de boleta hay abiertas.
 *
 * TRAMPA 6: al destruir la última BrowserWindow, Electron dispara
 * 'window-all-closed' y cierra la app. En uso normal la ventana principal está
 * viva, pero si se cierra mientras se arma un PDF —o si se generan varios
 * seguidos sin interfaz— el proceso se iría y la siguiente carga fallaría con
 * ERR_FAILED (-2), un error que habla del archivo y no tiene nada que ver con
 * el archivo. `main.js` consulta esto antes de cerrar la app.
 */
let boletasAbiertas = 0;

function hayBoletasAbiertas() {
  return boletasAbiertas > 0;
}

/**
 * Arma el documento y lo abre en una ventana oculta, ya medido.
 *
 * Devuelve { w, medidas, carpeta }. Siempre hay que cerrarlo con cerrarBoleta.
 */
async function abrirBoleta(datos, anchoMm, modoMargen = 'driver', declararTamano = true, corrimientoMm = 0) {
  const esA4 = anchoMm >= 200;
  const html = documentoBoleta({
    anchoMm,
    texto: esA4 ? null : textoTicketSalida(datos, anchoMm),
    htmlA4: esA4 ? htmlA4Salida(datos) : null,
    modoMargen,
    declararTamano,
    corrimientoMm,
  });

  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sfida-boleta-'));
  const archivo = path.join(carpeta, 'boleta.html');
  fs.writeFileSync(archivo, html, 'utf8');

  boletasAbiertas += 1;
  const w = new BrowserWindow({
    show: false,
    // El ancho no cambia la impresión (eso lo mandan @page y pageSize), pero sí
    // el recorte de capturePage() si alguna vez se quiere una foto.
    width: Math.round((anchoMm * 96) / 25.4) + 60,
    height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });

  try {
    await w.loadFile(archivo);
    // TRAMPA 7: si se mide con la fuente de reserva, el alto sale mal.
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const medidas = await w.webContents.executeJavaScript('window.__medidas()');
    return { w, medidas, carpeta };
  } catch (err) {
    cerrarBoleta({ w, carpeta });
    throw err;
  }
}

function cerrarBoleta(v) {
  if (v.w && !v.w.isDestroyed()) v.w.destroy();
  boletasAbiertas = Math.max(0, boletasAbiertas - 1);
  try {
    fs.rmSync(v.carpeta, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    /* el sistema se encarga de los temporales */
  }
}

/**
 * TRAMPA 1: `print()` mide en MICRONES.
 *
 * TRAMPA 9, y es la que deja media hoja en blanco arriba de cada ticket:
 * cuando se pide una hoja a medida, Chromium la manda a Windows en el DEVMODE
 * (`dmPaperWidth`/`dmPaperLength`) SIN apagar `dmPaperSize`. Con la bandera del
 * papel puesta, casi ningún controlador mira el alto a medida: se queda con el
 * papel que tiene configurado (una A4, o el rollo de 297 mm). Entonces la hoja
 * que armó Chromium —80 × 150 mm, pongamos— es más chica que la del controlador
 * y **Chromium la centra**: quedan dos franjas en blanco iguales, una arriba y
 * otra abajo. Por eso el PDF sale bien (ahí la medida la pone Chromium y nadie
 * la discute) y el papel sale con la mitad vacía.
 *
 * La única forma segura de que el ticket empiece arriba de todo es que la hoja
 * mida lo mismo que el papel del controlador, y para eso hay que NO pedir
 * ninguna medida: `undefined` deja mandar a la impresora.
 *
 * `ajustarAlto` vuelve al modo anterior, para los rollos cuyo controlador sí
 * acepta el alto a medida y corta el papel justo donde termina la boleta.
 */
function pageSizeParaPrint(anchoMm, altoHojaMm, ajustarAlto) {
  if (anchoMm >= 200) return 'A4';
  if (!ajustarAlto) return undefined;
  return {
    width: Math.round(anchoMm * MICRAS_POR_MM),
    height: Math.round(Math.max(altoHojaMm, 40) * MICRAS_POR_MM),
  };
}

/** TRAMPA 2: `printToPDF()` mide en PULGADAS. */
function pageSizeParaPdf(anchoMm, altoHojaMm) {
  if (anchoMm >= 200) return 'A4';
  return {
    width: anchoMm * PULGADAS_POR_MM,
    height: Math.max(altoHojaMm, 40) * PULGADAS_POR_MM,
  };
}

/** Devuelve la boleta renderizada, para la vista previa de la pantalla. */
async function vistaPrevia(datos, anchoMm, corrimientoMm = 0) {
  const v = await abrirBoleta(datos, anchoMm, 'driver', true, corrimientoMm);
  try {
    return {
      html: v.medidas.html,
      anchoMm: v.medidas.anchoMm,
      margenMm: v.medidas.margenMm,
      utilMm: v.medidas.utilMm,
      cols: v.medidas.cols,
      tamLetraPt: v.medidas.tamLetraPt,
      altoHojaMm: v.medidas.altoHojaMm,
      lineaMasLarga: v.medidas.lineaMasLarga,
    };
  } finally {
    cerrarBoleta(v);
  }
}

/** Manda la boleta a la impresora. */
async function imprimirBoleta(datos, anchoMm, deviceName, copias, ajustarAlto = false, corrimientoMm = 0) {
  // El A4 sí declara su tamaño; el ticket solo cuando además se le pide la
  // medida a la impresora. Si no, manda el papel del controlador.
  const declararTamano = anchoMm >= 200 || ajustarAlto;
  const v = await abrirBoleta(datos, anchoMm, 'driver', declararTamano, corrimientoMm);
  try {
    const config = {
      silent: true,
      deviceName, // TRAMPA 3
      copies: Math.max(1, Number(copias) || 1),
      printBackground: true,
      color: anchoMm >= 200,
    };
    // TRAMPA 9: si no se pide medida, la hoja es la del controlador y el ticket
    // arranca arriba de todo. Pedirla y que no la respeten es lo que deja el
    // ticket centrado, con media hoja en blanco encima.
    const hoja = pageSizeParaPrint(anchoMm, v.medidas.altoHojaMm, ajustarAlto);
    if (hoja) config.pageSize = hoja;
    // TRAMPA 4
    config.margins = { marginType: 'none' };

    return await new Promise((resolve) => {
      v.w.webContents.print(config, (ok, motivo) => resolve({ ok, motivo }));
    });
  } finally {
    cerrarBoleta(v);
  }
}

/** Guarda la boleta como PDF. */
async function pdfBoleta(datos, anchoMm, ruta) {
  const v = await abrirBoleta(datos, anchoMm, 'driver');
  try {
    const datosPdf = await v.w.webContents.printToPDF({
      printBackground: true,
      pageSize: pageSizeParaPdf(anchoMm, v.medidas.altoHojaMm), // TRAMPA 2
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(ruta, datosPdf);
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: (err && err.message) || String(err) };
  } finally {
    cerrarBoleta(v);
  }
}

module.exports = { vistaPrevia, imprimirBoleta, pdfBoleta, hayBoletasAbiertas };
