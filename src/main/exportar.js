'use strict';

const path = require('node:path');
const { app, dialog, BrowserWindow } = require('electron');
const XLSX = require('xlsx');
const repo = require('./repo');

async function exportarPendientesExcel(filtros) {
  const pendientes = repo.pendientes.listar(filtros);
  const saldo = repo.pendientes.saldoPorArea(filtros);

  const hojaPendientes = XLSX.utils.json_to_sheet(
    pendientes.map((p) => ({
      Boleta: p.numero,
      Área: p.area_nombre,
      Encargado: p.encargado_nombre,
      Producto: p.modelo,
      Color: p.color,
      Talla: p.talla,
      Salió: p.cantidad_salida,
      Devuelto: p.cantidad_devuelta,
      Falta: p.cantidad_falta,
      Días: p.dias,
    }))
  );

  const hojaSaldo = XLSX.utils.json_to_sheet(
    saldo.map((s) => ({
      Área: s.areaNombre,
      'Boletas abiertas': s.boletasAbiertas,
      'Prendas debiendo': s.prendasDebiendo,
      'Más antigua (días)': s.diasMasAntigua === null ? '' : s.diasMasAntigua,
    }))
  );

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaPendientes, 'Pendientes');
  XLSX.utils.book_append_sheet(libro, hojaSaldo, 'Saldo por área');

  const ventana = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const fecha = new Date().toISOString().slice(0, 10);
  const rutaSugerida = path.join(app.getPath('documents'), `pendientes-${fecha}.xlsx`);

  const resultado = await dialog.showSaveDialog(ventana, {
    title: 'Exportar pendientes a Excel',
    defaultPath: rutaSugerida,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (resultado.canceled || !resultado.filePath) {
    return { cancelado: true };
  }

  XLSX.writeFile(libro, resultado.filePath);
  return { cancelado: false, ruta: resultado.filePath };
}

module.exports = { exportarPendientesExcel };
