'use strict';

const { getDb } = require('./db');

/**
 * Normaliza texto ingresado por el usuario: recorta bordes, colapsa espacios
 * múltiples y pasa a mayúsculas. Es la única función que debe usarse antes de
 * cualquier INSERT/UPDATE en modelo, talla, color, nombre de encargado,
 * nombre de área, número de boleta y número de retorno.
 */
function normalizarTexto(t) {
  return String(t ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

// Para comparar duplicados ignorando acentos, sin alterar el texto guardado.
function paraComparar(t) {
  return normalizarTexto(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function transaccion(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function calcularSku(modelo, talla, color) {
  return `${modelo}|${talla}|${color}`;
}

function contarBoletasAbiertasPorArea(db, areaId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM boletas
       WHERE area_id = ? AND anulada = 0 AND estado != 'completo'`
    )
    .get(areaId);
  return row.n;
}

function contarBoletasAbiertasPorEncargado(db, encargadoId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM boletas
       WHERE encargado_id = ? AND anulada = 0 AND estado != 'completo'`
    )
    .get(encargadoId);
  return row.n;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

function listarProductos({ incluirInactivos = false } = {}) {
  const db = getDb();
  const where = incluirInactivos ? '' : 'WHERE activo = 1';
  return db
    .prepare(
      `SELECT id, modelo, talla, color, sku, activo FROM productos ${where}
       ORDER BY modelo, talla, color`
    )
    .all();
}

function buscarProductoDuplicado(db, modelo, talla, color, excluirId) {
  const claveComparar = `${paraComparar(modelo)}|${paraComparar(talla)}|${paraComparar(color)}`;
  const productos = db.prepare('SELECT id, modelo, talla, color FROM productos').all();
  return productos.find((p) => {
    if (excluirId && p.id === excluirId) return false;
    return `${paraComparar(p.modelo)}|${paraComparar(p.talla)}|${paraComparar(p.color)}` === claveComparar;
  });
}

function crearProducto({ modelo, talla, color }) {
  const db = getDb();
  const m = normalizarTexto(modelo);
  const t = normalizarTexto(talla);
  const c = normalizarTexto(color);

  if (!m || !t || !c) {
    throw new Error('Modelo, talla y color son obligatorios.');
  }
  if (buscarProductoDuplicado(db, m, t, c)) {
    throw new Error(`Ya existe un producto con modelo "${m}", talla "${t}" y color "${c}".`);
  }

  const sku = calcularSku(m, t, c);
  const info = db
    .prepare('INSERT INTO productos (modelo, talla, color, sku) VALUES (?, ?, ?, ?)')
    .run(m, t, c, sku);
  return db.prepare('SELECT id, modelo, talla, color, sku, activo FROM productos WHERE id = ?').get(info.lastInsertRowid);
}

function editarProducto(id, { modelo, talla, color }) {
  const db = getDb();
  const existente = db.prepare('SELECT id FROM productos WHERE id = ?').get(id);
  if (!existente) throw new Error('El producto no existe.');

  const m = normalizarTexto(modelo);
  const t = normalizarTexto(talla);
  const c = normalizarTexto(color);

  if (!m || !t || !c) {
    throw new Error('Modelo, talla y color son obligatorios.');
  }
  if (buscarProductoDuplicado(db, m, t, c, id)) {
    throw new Error(`Ya existe un producto con modelo "${m}", talla "${t}" y color "${c}".`);
  }

  const sku = calcularSku(m, t, c);
  db.prepare('UPDATE productos SET modelo = ?, talla = ?, color = ?, sku = ? WHERE id = ?').run(m, t, c, sku, id);
  return db.prepare('SELECT id, modelo, talla, color, sku, activo FROM productos WHERE id = ?').get(id);
}

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------

function listarAreas({ incluirInactivos = false } = {}) {
  const db = getDb();
  const where = incluirInactivos ? '' : 'WHERE a.activo = 1';
  return db
    .prepare(
      `SELECT a.id, a.nombre, a.activo,
              (SELECT COUNT(*) FROM boletas b WHERE b.area_id = a.id AND b.anulada = 0 AND b.estado != 'completo') AS boletas_abiertas
       FROM areas a ${where}
       ORDER BY a.nombre`
    )
    .all();
}

function buscarAreaDuplicada(db, nombre, excluirId) {
  const clave = paraComparar(nombre);
  const areas = db.prepare('SELECT id, nombre FROM areas').all();
  return areas.find((a) => {
    if (excluirId && a.id === excluirId) return false;
    return paraComparar(a.nombre) === clave;
  });
}

function crearArea({ nombre }) {
  const db = getDb();
  const n = normalizarTexto(nombre);
  if (!n) throw new Error('El nombre del área es obligatorio.');
  if (buscarAreaDuplicada(db, n)) {
    throw new Error(`Ya existe un área llamada "${n}".`);
  }
  const info = db.prepare('INSERT INTO areas (nombre) VALUES (?)').run(n);
  return db.prepare('SELECT id, nombre, activo FROM areas WHERE id = ?').get(info.lastInsertRowid);
}

function editarAreaNombre(id, nombre) {
  const db = getDb();
  const area = db.prepare('SELECT id FROM areas WHERE id = ?').get(id);
  if (!area) throw new Error('El área no existe.');

  const n = normalizarTexto(nombre);
  if (!n) throw new Error('El nombre del área es obligatorio.');
  if (buscarAreaDuplicada(db, n, id)) {
    throw new Error(`Ya existe un área llamada "${n}".`);
  }
  db.prepare('UPDATE areas SET nombre = ? WHERE id = ?').run(n, id);
  return db.prepare('SELECT id, nombre, activo FROM areas WHERE id = ?').get(id);
}

function desactivarArea(id) {
  const db = getDb();
  const area = db.prepare('SELECT id, nombre FROM areas WHERE id = ?').get(id);
  if (!area) throw new Error('El área no existe.');

  const abiertas = contarBoletasAbiertasPorArea(db, id);
  if (abiertas > 0) {
    throw new Error(
      `No se puede desactivar "${area.nombre}": tiene ${abiertas} boleta(s) abierta(s). Ciérralas o reasígnalas primero.`
    );
  }
  db.prepare('UPDATE areas SET activo = 0 WHERE id = ?').run(id);
  return db.prepare('SELECT id, nombre, activo FROM areas WHERE id = ?').get(id);
}

function reactivarArea(id) {
  const db = getDb();
  const area = db.prepare('SELECT id FROM areas WHERE id = ?').get(id);
  if (!area) throw new Error('El área no existe.');
  db.prepare('UPDATE areas SET activo = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT id, nombre, activo FROM areas WHERE id = ?').get(id);
}

// ---------------------------------------------------------------------------
// Encargados
// ---------------------------------------------------------------------------

function listarEncargados({ areaId = null, incluirInactivos = false } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = [];
  if (areaId) {
    condiciones.push('e.area_id = ?');
    params.push(areaId);
  }
  if (!incluirInactivos) {
    condiciones.push('e.activo = 1');
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT e.id, e.nombre, e.area_id, e.activo, a.nombre AS area_nombre,
              (SELECT COUNT(*) FROM boletas b WHERE b.encargado_id = e.id AND b.anulada = 0 AND b.estado != 'completo') AS boletas_abiertas
       FROM encargados e
       JOIN areas a ON a.id = e.area_id
       ${where}
       ORDER BY a.nombre, e.nombre`
    )
    .all(...params);
}

function buscarEncargadoDuplicado(db, nombre, areaId, excluirId) {
  const clave = paraComparar(nombre);
  const encargados = db.prepare('SELECT id, nombre FROM encargados WHERE area_id = ?').all(areaId);
  return encargados.find((e) => {
    if (excluirId && e.id === excluirId) return false;
    return paraComparar(e.nombre) === clave;
  });
}

function crearEncargado({ nombre, areaId }) {
  const db = getDb();
  const area = db.prepare('SELECT id FROM areas WHERE id = ?').get(areaId);
  if (!area) throw new Error('El área indicada no existe.');

  const n = normalizarTexto(nombre);
  if (!n) throw new Error('El nombre del encargado es obligatorio.');
  if (buscarEncargadoDuplicado(db, n, areaId)) {
    throw new Error(`Ya existe un encargado llamado "${n}" en esta área.`);
  }

  const info = db.prepare('INSERT INTO encargados (nombre, area_id) VALUES (?, ?)').run(n, areaId);
  return db.prepare('SELECT id, nombre, area_id, activo FROM encargados WHERE id = ?').get(info.lastInsertRowid);
}

function editarEncargadoNombre(id, nombre) {
  const db = getDb();
  const encargado = db.prepare('SELECT id, area_id FROM encargados WHERE id = ?').get(id);
  if (!encargado) throw new Error('El encargado no existe.');

  const n = normalizarTexto(nombre);
  if (!n) throw new Error('El nombre del encargado es obligatorio.');
  if (buscarEncargadoDuplicado(db, n, encargado.area_id, id)) {
    throw new Error(`Ya existe un encargado llamado "${n}" en esta área.`);
  }
  db.prepare('UPDATE encargados SET nombre = ? WHERE id = ?').run(n, id);
  return db.prepare('SELECT id, nombre, area_id, activo FROM encargados WHERE id = ?').get(id);
}

function desactivarEncargado(id) {
  const db = getDb();
  const encargado = db.prepare('SELECT id, nombre FROM encargados WHERE id = ?').get(id);
  if (!encargado) throw new Error('El encargado no existe.');

  const abiertas = contarBoletasAbiertasPorEncargado(db, id);
  if (abiertas > 0) {
    throw new Error(
      `No se puede desactivar a "${encargado.nombre}": tiene ${abiertas} boleta(s) abierta(s). Ciérralas o reasígnalas primero.`
    );
  }
  db.prepare('UPDATE encargados SET activo = 0 WHERE id = ?').run(id);
  return db.prepare('SELECT id, nombre, area_id, activo FROM encargados WHERE id = ?').get(id);
}

function reactivarEncargado(id) {
  const db = getDb();
  const encargado = db.prepare('SELECT id FROM encargados WHERE id = ?').get(id);
  if (!encargado) throw new Error('El encargado no existe.');
  db.prepare('UPDATE encargados SET activo = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT id, nombre, area_id, activo FROM encargados WHERE id = ?').get(id);
}

module.exports = {
  normalizarTexto,
  transaccion,
  productos: {
    listar: listarProductos,
    crear: crearProducto,
    editar: editarProducto,
  },
  areas: {
    listar: listarAreas,
    crear: crearArea,
    editarNombre: editarAreaNombre,
    desactivar: desactivarArea,
    reactivar: reactivarArea,
  },
  encargados: {
    listar: listarEncargados,
    crear: crearEncargado,
    editarNombre: editarEncargadoNombre,
    desactivar: desactivarEncargado,
    reactivar: reactivarEncargado,
  },
};
