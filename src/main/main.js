'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog } = require('electron');

// Ruta de datos estable, independiente de productName. Electron deriva
// app.getPath('userData') del nombre del producto; si ese nombre cambia
// (ver package.json productName), la ruta por defecto cambiaría con él y la
// base de datos existente quedaría huérfana. Por eso se fija explícitamente
// ANTES de requerir './db' o cualquier módulo que llame a getPath('userData').
const RUTA_DATOS = path.join(app.getPath('appData'), 'SFIDA-Almacen-Datos');
const RUTA_DATOS_ANTIGUA = path.join(app.getPath('appData'), 'SFIDA Almacén');

// Migración de arranque: si la carpeta con el nombre de producto anterior
// tiene una base de datos y la carpeta nueva todavía no tiene ninguna, mueve
// la base y los respaldos a la ubicación nueva. Deja un marcador en la
// carpeta nueva para no repetir la migración en arranques futuros.
function migrarCarpetaDatosPorCambioDeNombre() {
  const dbAntigua = path.join(RUTA_DATOS_ANTIGUA, 'sfida.sqlite');
  const dbNueva = path.join(RUTA_DATOS, 'sfida.sqlite');
  const marcador = path.join(RUTA_DATOS, '.migracion-nombre-app.json');

  if (fs.existsSync(marcador)) return;
  if (!fs.existsSync(dbAntigua)) return;
  if (fs.existsSync(dbNueva)) return;

  fs.mkdirSync(RUTA_DATOS, { recursive: true });
  for (const sufijo of ['', '-wal', '-shm']) {
    const origen = dbAntigua + sufijo;
    if (fs.existsSync(origen)) fs.renameSync(origen, dbNueva + sufijo);
  }

  const respaldosAntiguos = path.join(RUTA_DATOS_ANTIGUA, 'respaldos');
  if (fs.existsSync(respaldosAntiguos)) {
    const respaldosNuevos = path.join(RUTA_DATOS, 'respaldos');
    fs.mkdirSync(respaldosNuevos, { recursive: true });
    for (const archivo of fs.readdirSync(respaldosAntiguos)) {
      fs.renameSync(path.join(respaldosAntiguos, archivo), path.join(respaldosNuevos, archivo));
    }
  }

  fs.writeFileSync(
    marcador,
    JSON.stringify({ migradoDesde: RUTA_DATOS_ANTIGUA, migradoEn: new Date().toISOString() }, null, 2)
  );
}

migrarCarpetaDatosPorCambioDeNombre();
app.setPath('userData', RUTA_DATOS);

const { getDb, getColisionesNumeracionPendiente } = require('./db');
const { registrarHandlers } = require('./ipc');
const { crearRespaldo } = require('./respaldo');

let ventanaPrincipal = null;

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    title: 'SFIDA Ingreso y Salida',
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#141013',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ventanaPrincipal.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function avisarColisionesNumeracion(colisiones) {
  const LIMITE = 20;
  const lineas = colisiones.slice(0, LIMITE).map((c) => {
    const registros = c.registros.map((r) => `#${r.id} "${r.numeroOriginal}"`).join(', ');
    return `- ${c.tabla === 'boletas' ? 'Boleta' : 'Retorno'} ${c.numeroFinal}: ${registros}`;
  });
  if (colisiones.length > LIMITE) lineas.push(`… y ${colisiones.length - LIMITE} caso(s) más.`);

  dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Migración de numeración pendiente',
    message: 'No se pudo migrar la numeración a 6 dígitos: hay registros que quedarían con el mismo número.',
    detail:
      'Corrige manualmente el número de estos registros (Registro de salidas / Registro de retornos) y vuelve a abrir la aplicación para reintentar la migración:\n\n' +
      lineas.join('\n'),
  });
}

app.whenReady().then(() => {
  getDb();
  const colisiones = getColisionesNumeracionPendiente();
  if (colisiones && colisiones.length) {
    avisarColisionesNumeracion(colisiones);
  }
  try {
    crearRespaldo();
  } catch (err) {
    console.error('No se pudo crear el respaldo automático de arranque:', err);
  }
  registrarHandlers();
  crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
