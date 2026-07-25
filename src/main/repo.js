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

// ---------------------------------------------------------------------------
// Boletas de salida
// ---------------------------------------------------------------------------

function buscarBoletaDuplicada(db, numero, excluirId) {
  const clave = paraComparar(numero);
  const boletas = db.prepare('SELECT id, numero FROM boletas').all();
  return boletas.find((b) => {
    if (excluirId && b.id === excluirId) return false;
    return paraComparar(b.numero) === clave;
  });
}

function validarFecha(fecha) {
  const f = String(fecha ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error('La fecha de salida no es válida.');
  return f;
}

function validarItems(db, itemsInput) {
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
    throw new Error('Agrega al menos una prenda a la boleta.');
  }
  const combinados = new Map();
  for (const it of itemsInput) {
    const productoId = Number(it && it.productoId);
    const cantidad = Number(it && it.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      throw new Error('Uno de los productos de la boleta es inválido.');
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error('La cantidad de cada línea debe ser un entero mayor a 0.');
    }
    combinados.set(productoId, (combinados.get(productoId) || 0) + cantidad);
  }
  for (const productoId of combinados.keys()) {
    const producto = db.prepare('SELECT id FROM productos WHERE id = ? AND activo = 1').get(productoId);
    if (!producto) throw new Error('Uno de los productos seleccionados no existe o está inactivo.');
  }
  return combinados;
}

function contarAsignacionesDeBoleta(db, boletaId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM asignaciones a
       JOIN boleta_items bi ON bi.id = a.boleta_item_id
       WHERE bi.boleta_id = ?`
    )
    .get(boletaId);
  return row.n;
}

function obtenerDetalleBoleta(id) {
  const db = getDb();
  const boleta = db
    .prepare(
      `SELECT b.*, a.nombre AS area_nombre, e.nombre AS encargado_nombre
       FROM boletas b
       JOIN areas a ON a.id = b.area_id
       JOIN encargados e ON e.id = b.encargado_id
       WHERE b.id = ?`
    )
    .get(id);
  if (!boleta) throw new Error('La boleta no existe.');

  const items = db
    .prepare(
      `SELECT bi.id, bi.producto_id, bi.cantidad_salida, bi.cantidad_devuelta,
              p.modelo, p.talla, p.color
       FROM boleta_items bi
       JOIN productos p ON p.id = bi.producto_id
       WHERE bi.boleta_id = ?
       ORDER BY p.modelo, p.talla, p.color`
    )
    .all(id)
    .map((it) => ({ ...it, cantidad_falta: it.cantidad_salida - it.cantidad_devuelta }));

  const retornos = db
    .prepare(
      `SELECT r.id, r.numero, r.fecha,
              SUM(a.cantidad) AS aplicado_aqui,
              (SELECT SUM(ri2.cantidad_total) FROM retorno_items ri2 WHERE ri2.retorno_id = r.id) AS total_retorno
       FROM asignaciones a
       JOIN boleta_items bi ON bi.id = a.boleta_item_id
       JOIN retorno_items ri ON ri.id = a.retorno_item_id
       JOIN retornos r ON r.id = ri.retorno_id
       WHERE bi.boleta_id = ?
       GROUP BY r.id
       ORDER BY r.fecha, r.id`
    )
    .all(id);

  return {
    boleta,
    items,
    tieneAsignaciones: contarAsignacionesDeBoleta(db, id) > 0,
    retornos,
  };
}

function listarBoletas({ incluirAnuladas = true } = {}) {
  const db = getDb();
  const where = incluirAnuladas ? '' : 'WHERE b.anulada = 0';
  return db
    .prepare(
      `SELECT b.id, b.numero, b.fecha_salida, b.estado, b.anulada, b.motivo_anulacion,
              a.nombre AS area_nombre, e.nombre AS encargado_nombre,
              COALESCE(SUM(bi.cantidad_salida), 0) AS total_salido,
              COALESCE(SUM(bi.cantidad_devuelta), 0) AS total_devuelto
       FROM boletas b
       JOIN areas a ON a.id = b.area_id
       JOIN encargados e ON e.id = b.encargado_id
       LEFT JOIN boleta_items bi ON bi.boleta_id = b.id
       ${where}
       GROUP BY b.id
       ORDER BY b.fecha_salida DESC, b.id DESC`
    )
    .all()
    .map((fila) => ({ ...fila, total_falta: fila.total_salido - fila.total_devuelto }));
}

function kpisBoletas() {
  const db = getDb();
  const abiertas = db
    .prepare(`SELECT COUNT(*) AS n FROM boletas WHERE anulada = 0 AND estado != 'completo'`)
    .get().n;
  const totales = db
    .prepare(
      `SELECT COALESCE(SUM(bi.cantidad_salida), 0) AS salido, COALESCE(SUM(bi.cantidad_devuelta), 0) AS devuelto
       FROM boleta_items bi
       JOIN boletas b ON b.id = bi.boleta_id
       WHERE b.anulada = 0`
    )
    .get();
  const cerradasEsteMes = db
    .prepare(
      `SELECT COUNT(*) AS n FROM boletas
       WHERE anulada = 0 AND estado = 'completo' AND strftime('%Y-%m', fecha_salida) = strftime('%Y-%m', 'now')`
    )
    .get().n;

  return {
    boletasAbiertas: abiertas,
    prendasFuera: totales.salido,
    sinDevolver: totales.salido - totales.devuelto,
    cerradasEsteMes,
  };
}

function crearBoleta({ numero, areaId, encargadoId, fechaSalida, observacion, items }) {
  const db = getDb();
  const n = normalizarTexto(numero);
  if (!n) throw new Error('El número de boleta es obligatorio.');
  if (buscarBoletaDuplicada(db, n)) {
    throw new Error(`Ya existe una boleta con el número "${n}".`);
  }

  const areaIdNum = Number(areaId);
  if (!Number.isInteger(areaIdNum) || areaIdNum <= 0) throw new Error('Selecciona un área válida.');
  const area = db.prepare('SELECT id FROM areas WHERE id = ? AND activo = 1').get(areaIdNum);
  if (!area) throw new Error('El área indicada no existe o está inactiva.');

  const encargadoIdNum = Number(encargadoId);
  if (!Number.isInteger(encargadoIdNum) || encargadoIdNum <= 0) throw new Error('Selecciona un encargado válido.');
  const encargado = db
    .prepare('SELECT id FROM encargados WHERE id = ? AND area_id = ? AND activo = 1')
    .get(encargadoIdNum, areaIdNum);
  if (!encargado) {
    throw new Error('El encargado indicado no existe, no pertenece al área seleccionada o está inactivo.');
  }

  const fecha = validarFecha(fechaSalida);
  const combinados = validarItems(db, items);
  const obs = observacion == null ? null : String(observacion).trim() || null;

  return transaccion(db, () => {
    const info = db
      .prepare(
        `INSERT INTO boletas (numero, area_id, encargado_id, fecha_salida, observacion, creado_en)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(n, areaIdNum, encargadoIdNum, fecha, obs, new Date().toISOString());
    const boletaId = info.lastInsertRowid;
    const stmt = db.prepare(
      'INSERT INTO boleta_items (boleta_id, producto_id, cantidad_salida) VALUES (?, ?, ?)'
    );
    for (const [productoId, cantidad] of combinados) stmt.run(boletaId, productoId, cantidad);
    return obtenerDetalleBoleta(boletaId);
  });
}

function editarBoleta(id, { numero, areaId, encargadoId, fechaSalida, observacion, items }) {
  const db = getDb();
  const boleta = db.prepare('SELECT id, anulada FROM boletas WHERE id = ?').get(id);
  if (!boleta) throw new Error('La boleta no existe.');
  if (boleta.anulada) throw new Error('No se puede editar una boleta anulada.');
  if (contarAsignacionesDeBoleta(db, id) > 0) {
    throw new Error('No se puede editar una boleta que ya tiene devoluciones asignadas. Anúlala si necesitas corregirla.');
  }

  const n = normalizarTexto(numero);
  if (!n) throw new Error('El número de boleta es obligatorio.');
  if (buscarBoletaDuplicada(db, n, id)) {
    throw new Error(`Ya existe una boleta con el número "${n}".`);
  }

  const areaIdNum = Number(areaId);
  if (!Number.isInteger(areaIdNum) || areaIdNum <= 0) throw new Error('Selecciona un área válida.');
  const area = db.prepare('SELECT id FROM areas WHERE id = ? AND activo = 1').get(areaIdNum);
  if (!area) throw new Error('El área indicada no existe o está inactiva.');

  const encargadoIdNum = Number(encargadoId);
  if (!Number.isInteger(encargadoIdNum) || encargadoIdNum <= 0) throw new Error('Selecciona un encargado válido.');
  const encargado = db
    .prepare('SELECT id FROM encargados WHERE id = ? AND area_id = ? AND activo = 1')
    .get(encargadoIdNum, areaIdNum);
  if (!encargado) {
    throw new Error('El encargado indicado no existe, no pertenece al área seleccionada o está inactivo.');
  }

  const fecha = validarFecha(fechaSalida);
  const combinados = validarItems(db, items);
  const obs = observacion == null ? null : String(observacion).trim() || null;

  return transaccion(db, () => {
    db.prepare(
      `UPDATE boletas SET numero = ?, area_id = ?, encargado_id = ?, fecha_salida = ?, observacion = ? WHERE id = ?`
    ).run(n, areaIdNum, encargadoIdNum, fecha, obs, id);
    db.prepare('DELETE FROM boleta_items WHERE boleta_id = ?').run(id);
    const stmt = db.prepare(
      'INSERT INTO boleta_items (boleta_id, producto_id, cantidad_salida) VALUES (?, ?, ?)'
    );
    for (const [productoId, cantidad] of combinados) stmt.run(id, productoId, cantidad);
    return obtenerDetalleBoleta(id);
  });
}

function anularBoleta(id, motivo) {
  const db = getDb();
  const boleta = db.prepare('SELECT id, anulada FROM boletas WHERE id = ?').get(id);
  if (!boleta) throw new Error('La boleta no existe.');
  if (boleta.anulada) throw new Error('La boleta ya está anulada.');

  const m = String(motivo ?? '').trim();
  if (!m) throw new Error('Debes indicar un motivo para anular la boleta.');

  db.prepare('UPDATE boletas SET anulada = 1, motivo_anulacion = ? WHERE id = ?').run(m, id);
  return obtenerDetalleBoleta(id);
}

module.exports = {
  normalizarTexto,
  transaccion,
  productos: {
    listar: listarProductos,
    crear: crearProducto,
    editar: editarProducto,
  },
  boletas: {
    listar: listarBoletas,
    kpis: kpisBoletas,
    crear: crearBoleta,
    editar: editarBoleta,
    anular: anularBoleta,
    obtenerDetalle: obtenerDetalleBoleta,
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
