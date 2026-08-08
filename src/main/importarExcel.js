'use strict';

const { dialog, BrowserWindow } = require('electron');
const XLSX = require('xlsx');
const repo = require('./repo');

async function importarProductosDesdeExcel() {
  const ventana = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const resultado = await dialog.showOpenDialog(ventana, {
    title: 'Importar productos desde Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (resultado.canceled || !resultado.filePaths.length) return { cancelado: true };

  const libro = XLSX.readFile(resultado.filePaths[0]);
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error('El archivo no tiene ninguna hoja con datos.');

  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
  const filasCrudas = filas.map((fila, idx) => ({
    fila: idx + 2, // fila 1 es el encabezado
    modelo: fila.MODELO,
    talla: fila.TALLA,
    color: fila.COLOR,
  }));

  const resumen = repo.productos.importar(filasCrudas);
  return { cancelado: false, ...resumen };
}

module.exports = { importarProductosDesdeExcel };
