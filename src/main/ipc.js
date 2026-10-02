'use strict';

const path = require('node:path');
const { app, dialog, ipcMain } = require('electron');
const repo = require('./repo');
const { exportarPendientesExcel } = require('./exportar');
const { importarProductosDesdeExcel } = require('./importarExcel');
const respaldo = require('./respaldo');
const { vistaPrevia, imprimirBoleta, pdfBoleta } = require('./impresion/imprimir');

/**
 * `ctx.ventana()` devuelve la ventana principal, o null si todavía no existe.
 * Se resuelve tarde, en cada llamada: los handlers se registran antes de que la
 * ventana exista.
 */
function registrarHandlers(ctx = {}) {
  const ventana = typeof ctx.ventana === 'function' ? ctx.ventana : () => null;
  ipcMain.handle('productos:listar', (_e, filtros) => repo.productos.listar(filtros));
  ipcMain.handle('productos:listarPagina', (_e, filtros) => repo.productos.listarPagina(filtros));
  ipcMain.handle('productos:crear', (_e, datos) => repo.productos.crear(datos));
  ipcMain.handle('productos:editar', (_e, { id, ...datos }) => repo.productos.editar(id, datos));
  ipcMain.handle('productos:importarExcel', () => importarProductosDesdeExcel());

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
  ipcMain.handle('boletas:siguienteNumero', () => repo.boletas.siguienteNumero());

  ipcMain.handle('retornos:listar', () => repo.retornos.listar());
  ipcMain.handle('retornos:siguienteNumero', () => repo.retornos.siguienteNumero());
  ipcMain.handle('retornos:previsualizar', (_e, datos) => repo.retornos.previsualizar(datos));
  ipcMain.handle('retornos:crear', (_e, datos) => repo.retornos.crear(datos));
  ipcMain.handle('retornos:pendientesSinUbicar', () => repo.retornos.pendientesSinUbicar());
  ipcMain.handle('retornos:pendientesPorProducto', (_e, datos) => repo.retornos.pendientesPorProducto(datos));
  ipcMain.handle('retornos:asignarSinUbicar', (_e, datos) => repo.retornos.asignarSinUbicar(datos));

  ipcMain.handle('pendientes:listar', (_e, filtros) => repo.pendientes.listar(filtros));
  ipcMain.handle('pendientes:saldoPorArea', (_e, filtros) => repo.pendientes.saldoPorArea(filtros));
  ipcMain.handle('pendientes:exportarExcel', (_e, filtros) => exportarPendientesExcel(filtros));

  ipcMain.handle('integridad:verificar', () => repo.integridad.verificar());
  ipcMain.handle('integridad:recalcular', () => repo.integridad.recalcular());

  // ----------------------------------------------------------- impresión
  // Toda la validación vive acá: la UI solo elige y muestra.
  ipcMain.handle('impresion:impresoras', async () => {
    const v = ventana();
    if (!v) return [];
    const lista = await v.webContents.getPrintersAsync();
    // En Electron 43 el tipo PrinterInfo ya no declara `isDefault` ni `status`,
    // pero el runtime sí los devuelve. Se leen de forma defensiva, cayendo en
    // `options` por si algún día se mueven ahí de verdad.
    const leer = (p) => {
      const opciones = p.options || {};
      return {
        esPredet: Boolean(p.isDefault ?? opciones['printer-is-default'] ?? false),
        estado: Number(p.status ?? opciones['printer-state'] ?? 0) || 0,
      };
    };
    const conFlags = lista.map((p) => ({ p, ...leer(p) }));
    const ordenadas = [...conFlags.filter((x) => x.esPredet), ...conFlags.filter((x) => !x.esPredet)];
    return ordenadas.map((x) => ({
      name: x.p.name,
      displayName: x.p.displayName || x.p.name,
      isDefault: x.esPredet,
      status: x.estado,
    }));
  });

  ipcMain.handle('impresion:preferencias', () => repo.config.preferenciasImpresion());

  ipcMain.handle('impresion:vistaPrevia', (_e, { id, anchoMm, corrimientoMm }) =>
    vistaPrevia(repo.impresion.datosBoleta(id), repo.config.normalizarAncho(anchoMm), Number(corrimientoMm) || 0)
  );

  ipcMain.handle('impresion:imprimir', async (_e, opciones) => {
    const { id, deviceName, copias, ajustarAlto, corrimientoMm } = opciones || {};
    if (!deviceName) throw new Error('Elige una impresora.');
    const anchoMm = repo.config.normalizarAncho(opciones.anchoMm);
    const datos = repo.impresion.datosBoleta(id);
    const copiasN = Math.min(9, Math.max(1, Number(copias) || 1));
    const corrimiento = anchoMm >= 200 ? 0 : Math.max(-10, Math.min(10, Number(corrimientoMm) || 0));
    const resultado = await imprimirBoleta(datos, anchoMm, deviceName, copiasN, Boolean(ajustarAlto), corrimiento);
    if (resultado.ok) {
      repo.config.guardarPreferenciasImpresion({
        impresora: deviceName,
        papel: anchoMm,
        ajustarAlto: Boolean(ajustarAlto),
        corrimientoMm: corrimiento,
      });
    }
    return resultado;
  });

  ipcMain.handle('impresion:guardarPdf', async (_e, { id, anchoMm }) => {
    const ancho = repo.config.normalizarAncho(anchoMm);
    const datos = repo.impresion.datosBoleta(id);
    const nombre = `boleta_${String(datos.numero).replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
    const v = ventana();
    const opcionesDialogo = {
      title: 'Guardar la boleta en PDF',
      defaultPath: path.join(app.getPath('documents'), nombre),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const elegido = v
      ? await dialog.showSaveDialog(v, opcionesDialogo)
      : await dialog.showSaveDialog(opcionesDialogo);
    if (elegido.canceled || !elegido.filePath) return { ok: false, cancelado: true };
    const resultado = await pdfBoleta(datos, ancho, elegido.filePath);
    if (resultado.ok) repo.config.guardarPreferenciasImpresion({ papel: ancho });
    return { ...resultado, ruta: elegido.filePath };
  });

  ipcMain.handle('empresa:obtener', () => repo.config.obtenerEmpresa());
  ipcMain.handle('empresa:guardar', (_e, datos) => repo.config.guardarEmpresa(datos || {}));

  ipcMain.handle('respaldo:crearAhora', () => respaldo.crearRespaldo());
  ipcMain.handle('respaldo:info', () => respaldo.infoRespaldos());
  ipcMain.handle('respaldo:abrirCarpeta', () => respaldo.abrirCarpetaDatos());
  ipcMain.handle('respaldo:elegirArchivoRestaurar', () => respaldo.elegirArchivoRestaurar());
  ipcMain.handle('respaldo:restaurar', (_e, { ruta }) => respaldo.restaurarDesdeArchivo(ruta));
}

module.exports = { registrarHandlers };
