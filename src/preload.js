'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  productos: {
    listar: (filtros) => ipcRenderer.invoke('productos:listar', filtros),
    crear: (datos) => ipcRenderer.invoke('productos:crear', datos),
    editar: (id, datos) => ipcRenderer.invoke('productos:editar', { id, ...datos }),
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
});
