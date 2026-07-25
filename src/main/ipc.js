'use strict';

const { ipcMain } = require('electron');
const repo = require('./repo');

function registrarHandlers() {
  ipcMain.handle('productos:listar', (_e, filtros) => repo.productos.listar(filtros));
  ipcMain.handle('productos:crear', (_e, datos) => repo.productos.crear(datos));
  ipcMain.handle('productos:editar', (_e, { id, ...datos }) => repo.productos.editar(id, datos));

  ipcMain.handle('areas:listar', (_e, filtros) => repo.areas.listar(filtros));
  ipcMain.handle('areas:crear', (_e, datos) => repo.areas.crear(datos));
  ipcMain.handle('areas:editarNombre', (_e, { id, nombre }) => repo.areas.editarNombre(id, nombre));
  ipcMain.handle('areas:desactivar', (_e, { id }) => repo.areas.desactivar(id));
  ipcMain.handle('areas:reactivar', (_e, { id }) => repo.areas.reactivar(id));

  ipcMain.handle('encargados:listar', (_e, filtros) => repo.encargados.listar(filtros));
  ipcMain.handle('encargados:crear', (_e, datos) => repo.encargados.crear(datos));
  ipcMain.handle('encargados:editarNombre', (_e, { id, nombre }) => repo.encargados.editarNombre(id, nombre));
  ipcMain.handle('encargados:desactivar', (_e, { id }) => repo.encargados.desactivar(id));
  ipcMain.handle('encargados:reactivar', (_e, { id }) => repo.encargados.reactivar(id));

  ipcMain.handle('boletas:listar', (_e, filtros) => repo.boletas.listar(filtros));
  ipcMain.handle('boletas:kpis', () => repo.boletas.kpis());
  ipcMain.handle('boletas:crear', (_e, datos) => repo.boletas.crear(datos));
  ipcMain.handle('boletas:editar', (_e, { id, ...datos }) => repo.boletas.editar(id, datos));
  ipcMain.handle('boletas:anular', (_e, { id, motivo }) => repo.boletas.anular(id, motivo));
  ipcMain.handle('boletas:obtenerDetalle', (_e, { id }) => repo.boletas.obtenerDetalle(id));

  ipcMain.handle('retornos:listar', () => repo.retornos.listar());
  ipcMain.handle('retornos:previsualizar', (_e, datos) => repo.retornos.previsualizar(datos));
  ipcMain.handle('retornos:crear', (_e, datos) => repo.retornos.crear(datos));
  ipcMain.handle('retornos:pendientesSinUbicar', () => repo.retornos.pendientesSinUbicar());
  ipcMain.handle('retornos:pendientesPorProducto', (_e, datos) => repo.retornos.pendientesPorProducto(datos));
  ipcMain.handle('retornos:asignarSinUbicar', (_e, datos) => repo.retornos.asignarSinUbicar(datos));
}

module.exports = { registrarHandlers };
