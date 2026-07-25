'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, dialog, shell, BrowserWindow } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { getDb, getDbPath, cerrarDb } = require('./db');

const MAX_RESPALDOS = 30;

function getCarpetaRespaldos() {
  const dir = path.join(app.getPath('userData'), 'respaldos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nombreRespaldo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `sfida-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}.sqlite`;
}

function limpiarRespaldosViejos(carpeta) {
  const archivos = fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const ruta = path.join(carpeta, f);
      return { ruta, mtime: fs.statSync(ruta).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of archivos.slice(MAX_RESPALDOS)) {
    fs.unlinkSync(f.ruta);
  }
}

// VACUUM INTO genera una copia consistente en un solo archivo, sin importar
// el estado del WAL de la conexión activa.
function crearRespaldo() {
  const db = getDb();
  const carpeta = getCarpetaRespaldos();
  const destino = path.join(carpeta, nombreRespaldo());
  db.prepare('VACUUM INTO ?').run(destino);
  limpiarRespaldosViejos(carpeta);
  return destino;
}

function listarRespaldos() {
  const carpeta = getCarpetaRespaldos();
  return fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const ruta = path.join(carpeta, f);
      const st = fs.statSync(ruta);
      return { nombre: f, ruta, creadoEn: st.mtime.toISOString(), tamano: st.size };
    })
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

function infoRespaldos() {
  const lista = listarRespaldos();
  return {
    total: lista.length,
    maximo: MAX_RESPALDOS,
    ultimo: lista.length ? lista[0] : null,
  };
}

function abrirCarpetaDatos() {
  shell.openPath(app.getPath('userData'));
}

async function elegirArchivoRestaurar() {
  const ventana = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const resultado = await dialog.showOpenDialog(ventana, {
    title: 'Selecciona un respaldo para restaurar',
    defaultPath: getCarpetaRespaldos(),
    properties: ['openFile'],
    filters: [{ name: 'Base de datos SFIDA', extensions: ['sqlite'] }],
  });
  if (resultado.canceled || !resultado.filePaths.length) return { cancelado: true };
  return { cancelado: false, ruta: resultado.filePaths[0] };
}

function validarArchivoRespaldo(ruta) {
  let db;
  try {
    db = new DatabaseSync(ruta);
    const fila = db.prepare("SELECT valor FROM meta WHERE clave = 'schema_version'").get();
    if (!fila) throw new Error('sin schema_version');
  } catch {
    throw new Error('El archivo seleccionado no es un respaldo válido de SFIDA.');
  } finally {
    if (db) db.close();
  }
}

function restaurarDesdeArchivo(ruta) {
  if (!ruta || !fs.existsSync(ruta)) throw new Error('El archivo seleccionado ya no existe.');
  validarArchivoRespaldo(ruta);

  // Respaldo de seguridad del estado actual antes de reemplazarlo.
  crearRespaldo();

  const destino = getDbPath();
  cerrarDb();

  for (const sufijo of ['', '-wal', '-shm']) {
    const f = destino + sufijo;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.copyFileSync(ruta, destino);

  app.relaunch();
  app.exit(0);
}

module.exports = {
  crearRespaldo,
  infoRespaldos,
  abrirCarpetaDatos,
  elegirArchivoRestaurar,
  restaurarDesdeArchivo,
};
