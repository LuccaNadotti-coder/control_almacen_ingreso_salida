'use strict';

const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { getDb } = require('./db');
const { registrarHandlers } = require('./ipc');
const { crearRespaldo } = require('./respaldo');

let ventanaPrincipal = null;

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
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

app.whenReady().then(() => {
  getDb();
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
