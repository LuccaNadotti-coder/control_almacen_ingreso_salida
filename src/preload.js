'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  productos: {
    listar: (filtros) => ipcRenderer.invoke('productos:listar', filtros),
    crear: (datos) => ipcRenderer.invoke('productos:crear', datos),
    editar: (id, datos) => ipcRenderer.invoke('productos:editar', { id, ...datos }),
    importarExcel: () => ipcRenderer.invoke('productos:importarExcel'),
  },
  areas: {
    listar: (filtros) => ipcRenderer.invoke('areas:listar', filtros),
    crear: (datos) => ipcRenderer.invoke('areas:crear', datos),
    editarNombre: (id, nombre) => ipcRenderer.invoke('areas:editarNombre', { id, nombre }),
    desactivar: (id) => ipcRenderer.invoke('areas:desactivar', { id }),
    reactivar: (id) => ipcRenderer.invoke('areas:reactivar', { id }),
  },
  encargados: {
    listar: (filtros) => ipcRenderer.invoke('encargados:listar', filtros),
    crear: (datos) => ipcRenderer.invoke('encargados:crear', datos),
    editarNombre: (id, nombre) => ipcRenderer.invoke('encargados:editarNombre', { id, nombre }),
    desactivar: (id) => ipcRenderer.invoke('encargados:desactivar', { id }),
    reactivar: (id) => ipcRenderer.invoke('encargados:reactivar', { id }),
  },
  boletas: {
    listar: (filtros) => ipcRenderer.invoke('boletas:listar', filtros),
    kpis: () => ipcRenderer.invoke('boletas:kpis'),
    crear: (datos) => ipcRenderer.invoke('boletas:crear', datos),
    editar: (id, datos) => ipcRenderer.invoke('boletas:editar', { id, ...datos }),
    anular: (id, motivo) => ipcRenderer.invoke('boletas:anular', { id, motivo }),
    obtenerDetalle: (id) => ipcRenderer.invoke('boletas:obtenerDetalle', { id }),
  },
  retornos: {
    listar: () => ipcRenderer.invoke('retornos:listar'),
    previsualizar: (datos) => ipcRenderer.invoke('retornos:previsualizar', datos),
    crear: (datos) => ipcRenderer.invoke('retornos:crear', datos),
    pendientesSinUbicar: () => ipcRenderer.invoke('retornos:pendientesSinUbicar'),
    pendientesPorProducto: (datos) => ipcRenderer.invoke('retornos:pendientesPorProducto', datos),
    asignarSinUbicar: (datos) => ipcRenderer.invoke('retornos:asignarSinUbicar', datos),
  },
  pendientes: {
    listar: (filtros) => ipcRenderer.invoke('pendientes:listar', filtros),
    saldoPorArea: (filtros) => ipcRenderer.invoke('pendientes:saldoPorArea', filtros),
    exportarExcel: (filtros) => ipcRenderer.invoke('pendientes:exportarExcel', filtros),
  },
  integridad: {
    verificar: () => ipcRenderer.invoke('integridad:verificar'),
    recalcular: () => ipcRenderer.invoke('integridad:recalcular'),
  },
  respaldo: {
    crearAhora: () => ipcRenderer.invoke('respaldo:crearAhora'),
    info: () => ipcRenderer.invoke('respaldo:info'),
    abrirCarpeta: () => ipcRenderer.invoke('respaldo:abrirCarpeta'),
    elegirArchivoRestaurar: () => ipcRenderer.invoke('respaldo:elegirArchivoRestaurar'),
    restaurar: (ruta) => ipcRenderer.invoke('respaldo:restaurar', { ruta }),
  },
});
