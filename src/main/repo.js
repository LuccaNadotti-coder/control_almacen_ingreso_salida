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

function calcularSku(modelo, color, talla) {
  return `${modelo}|${color}|${talla}`;
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
      `SELECT id, modelo, color, talla, sku, activo FROM productos ${where}
       ORDER BY modelo, color, talla`
    )
    .all();
}

// Paginado en servidor para Maestros > Productos (catálogos de ~27.000 filas).
// El filtro de búsqueda corre en SQL, no en memoria.
function listarProductosPagina({ pagina = 1, porPagina = 50, busqueda = '', incluirInactivos = false } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = [];
  if (!incluirInactivos) condiciones.push('activo = 1');
  const b = normalizarTexto(busqueda);
  if (b) {
    condiciones.push('(modelo LIKE ? OR color LIKE ? OR talla LIKE ?)');
    const comodin = `%${b}%`;
    params.push(comodin, comodin, comodin);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM productos ${where}`).get(...params).n;
  const porPaginaNum = Math.max(1, Math.min(200, Number(porPagina) || 50));
  const totalPaginas = Math.max(1, Math.ceil(total / porPaginaNum));
  const paginaNum = Math.max(1, Math.min(totalPaginas, Number(pagina) || 1));
  const offset = (paginaNum - 1) * porPaginaNum;

  const productos = db
    .prepare(
      `SELECT id, modelo, color, talla, sku, activo FROM productos ${where}
       ORDER BY modelo, color, talla LIMIT ? OFFSET ?`
    )
    .all(...params, porPaginaNum, offset);

  return { productos, total, pagina: paginaNum, porPagina: porPaginaNum, totalPaginas };
}

function buscarProductoDuplicado(db, modelo, color, talla, excluirId) {
  const claveComparar = `${paraComparar(modelo)}|${paraComparar(color)}|${paraComparar(talla)}`;
  const productos = db.prepare('SELECT id, modelo, color, talla FROM productos').all();
  return productos.find((p) => {
    if (excluirId && p.id === excluirId) return false;
    return `${paraComparar(p.modelo)}|${paraComparar(p.color)}|${paraComparar(p.talla)}` === claveComparar;
  });
}

function crearProducto({ modelo, talla, color }) {
  const db = getDb();
  const m = normalizarTexto(modelo);
  const t = normalizarTexto(talla);
  const c = normalizarTexto(color);

  if (!m || !t || !c) {
    throw new Error('Modelo, color y talla son obligatorios.');
  }
  if (buscarProductoDuplicado(db, m, c, t)) {
    throw new Error(`Ya existe un producto con modelo "${m}", color "${c}" y talla "${t}".`);
  }

  const sku = calcularSku(m, c, t);
  const info = db
    .prepare('INSERT INTO productos (modelo, talla, color, sku) VALUES (?, ?, ?, ?)')
    .run(m, t, c, sku);
  return db.prepare('SELECT id, modelo, color, talla, sku, activo FROM productos WHERE id = ?').get(info.lastInsertRowid);
}

// Filas crudas: [{ fila, modelo, talla, color }]. Una sola transacción; si algo
// falla a la mitad, no queda nada insertado.
function importarProductos(filasCrudas) {
  const db = getDb();
  const vacios = [];
  const candidatos = [];

  filasCrudas.forEach((fila, idx) => {
    const m = normalizarTexto(fila.modelo);
    const t = normalizarTexto(fila.talla);
    const c = normalizarTexto(fila.color);
    if (!m || !t || !c) {
      vacios.push({
        fila: fila.fila ?? idx + 2,
        modelo: fila.modelo == null ? '' : String(fila.modelo),
        talla: fila.talla == null ? '' : String(fila.talla),
        color: fila.color == null ? '' : String(fila.color),
      });
      return;
    }
    candidatos.push({ modelo: m, talla: t, color: c, sku: calcularSku(m, c, t) });
  });

  return transaccion(db, () => {
    const stmtExiste = db.prepare('SELECT id FROM productos WHERE sku = ?');
    const stmtInsert = db.prepare('INSERT INTO productos (modelo, talla, color, sku) VALUES (?, ?, ?, ?)');
    const vistosEnArchivo = new Set();
    let importados = 0;
    let existentes = 0;

    for (const p of candidatos) {
      if (vistosEnArchivo.has(p.sku) || stmtExiste.get(p.sku)) {
        existentes += 1;
        continue;
      }
      stmtInsert.run(p.modelo, p.talla, p.color, p.sku);
      vistosEnArchivo.add(p.sku);
      importados += 1;
    }

    return { importados, existentes, vacios, totalFilas: filasCrudas.length };
  });
}

function editarProducto(id, { modelo, talla, color }) {
  const db = getDb();
  const existente = db.prepare('SELECT id FROM productos WHERE id = ?').get(id);
  if (!existente) throw new Error('El producto no existe.');

  const m = normalizarTexto(modelo);
  const t = normalizarTexto(talla);
  const c = normalizarTexto(color);

  if (!m || !t || !c) {
    throw new Error('Modelo, color y talla son obligatorios.');
  }
  if (buscarProductoDuplicado(db, m, c, t, id)) {
    throw new Error(`Ya existe un producto con modelo "${m}", color "${c}" y talla "${t}".`);
  }

  const sku = calcularSku(m, c, t);
  db.prepare('UPDATE productos SET modelo = ?, talla = ?, color = ?, sku = ? WHERE id = ?').run(m, t, c, sku, id);
  return db.prepare('SELECT id, modelo, color, talla, sku, activo FROM productos WHERE id = ?').get(id);
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

// Correlativo por prefijo (SAL-/RET-), calculado leyendo el mayor número
// existente de ese prefijo en la tabla — nunca con un contador aparte, para
// que no se desincronice si se anula, edita o restaura un respaldo.
// `tabla` es siempre un literal interno ('boletas' | 'retornos'), nunca
// entrada de usuario, así que interpolarlo en el SQL es seguro.
function siguienteCorrelativo(db, tabla, prefijo) {
  const filas = db.prepare(`SELECT numero FROM ${tabla} WHERE numero LIKE ?`).all(`${prefijo}-%`);
  const re = new RegExp(`^${prefijo}-(\\d+)$`);
  let max = 0;
  for (const f of filas) {
    const m = re.exec(f.numero);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}-${String(max + 1).padStart(6, '0')}`;
}

// El número siempre queda a 6 dígitos: PREFIJO-XXXXXX. Si llega solo con
// dígitos (con o sin prefijo) y menos de 6 cifras, se rellena con ceros a la
// izquierda. Si es texto libre no numérico (numeración antigua sin patrón),
// se deja tal cual. El relleno se hace aquí, en el main, sin confiar en que
// la UI ya lo haya hecho.
function normalizarNumeroDocumento(numero, prefijo) {
  const n = normalizarTexto(numero);
  if (!n) return '';
  const conPrefijo = new RegExp(`^${prefijo}-(\\d+)$`).exec(n);
  if (conPrefijo) return `${prefijo}-${conPrefijo[1].padStart(6, '0')}`;
  if (/^\d+$/.test(n)) return `${prefijo}-${n.padStart(6, '0')}`;
  return n;
}

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
              p.modelo, p.color, p.talla
       FROM boleta_items bi
       JOIN productos p ON p.id = bi.producto_id
       WHERE bi.boleta_id = ?
       ORDER BY p.modelo, p.color, p.talla`
    )
    .all(id)
    .map((it) => ({ ...it, cantidad_falta: it.cantidad_salida - it.cantidad_devuelta }));

  const asignacionesRetornos = db
    .prepare(
      `SELECT r.id AS retorno_id, r.numero, r.fecha, a.cantidad,
              p.modelo, p.talla, p.color,
              (SELECT SUM(ri2.cantidad_total) FROM retorno_items ri2 WHERE ri2.retorno_id = r.id) AS total_retorno
       FROM asignaciones a
       JOIN boleta_items bi ON bi.id = a.boleta_item_id
       JOIN retorno_items ri ON ri.id = a.retorno_item_id
       JOIN retornos r ON r.id = ri.retorno_id
       JOIN productos p ON p.id = ri.producto_id
       WHERE bi.boleta_id = ?
       ORDER BY r.fecha, r.id`
    )
    .all(id);

  const retornosPorId = new Map();
  for (const fila of asignacionesRetornos) {
    if (!retornosPorId.has(fila.retorno_id)) {
      retornosPorId.set(fila.retorno_id, {
        id: fila.retorno_id,
        numero: fila.numero,
        fecha: fila.fecha,
        total_retorno: fila.total_retorno,
        aplicado_aqui: 0,
        detalle: [],
      });
    }
    const r = retornosPorId.get(fila.retorno_id);
    r.aplicado_aqui += fila.cantidad;
    r.detalle.push({ modelo: fila.modelo, color: fila.color, talla: fila.talla, cantidad: fila.cantidad });
  }
  const retornos = [...retornosPorId.values()];

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
    let n = normalizarNumeroDocumento(numero, 'SAL');
    if (!n) n = siguienteCorrelativo(db, 'boletas', 'SAL');
    if (buscarBoletaDuplicada(db, n)) {
      throw new Error(`Ya existe una boleta con el número "${n}".`);
    }

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

function siguienteNumeroBoleta() {
  return siguienteCorrelativo(getDb(), 'boletas', 'SAL');
}

function editarBoleta(id, { numero, areaId, encargadoId, fechaSalida, observacion, items }) {
  const db = getDb();
  const boleta = db.prepare('SELECT id, anulada FROM boletas WHERE id = ?').get(id);
  if (!boleta) throw new Error('La boleta no existe.');
  if (boleta.anulada) throw new Error('No se puede editar una boleta anulada.');
  if (contarAsignacionesDeBoleta(db, id) > 0) {
    throw new Error('No se puede editar una boleta que ya tiene devoluciones asignadas. Anúlala si necesitas corregirla.');
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
    let n = normalizarNumeroDocumento(numero, 'SAL');
    if (!n) n = siguienteCorrelativo(db, 'boletas', 'SAL');
    if (buscarBoletaDuplicada(db, n, id)) {
      throw new Error(`Ya existe una boleta con el número "${n}".`);
    }

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

// ---------------------------------------------------------------------------
// Retornos y reparto FIFO
// ---------------------------------------------------------------------------

function buscarRetornoDuplicado(db, numero, excluirId) {
  const clave = paraComparar(numero);
  const retornos = db.prepare('SELECT id, numero FROM retornos').all();
  return retornos.find((r) => {
    if (excluirId && r.id === excluirId) return false;
    return paraComparar(r.numero) === clave;
  });
}

function recalcularEstadoBoleta(db, boletaId) {
  const items = db.prepare('SELECT cantidad_salida, cantidad_devuelta FROM boleta_items WHERE boleta_id = ?').all(boletaId);
  const totalDevuelto = items.reduce((s, it) => s + it.cantidad_devuelta, 0);
  let estado;
  if (totalDevuelto <= 0) estado = 'pendiente';
  else if (items.every((it) => it.cantidad_devuelta >= it.cantidad_salida)) estado = 'completo';
  else estado = 'parcial';
  db.prepare('UPDATE boletas SET estado = ? WHERE id = ?').run(estado, boletaId);
}

// FIFO: pendientes de un producto en un área, boletas no anuladas, más antigua primero.
function obtenerPendientesFIFO(db, areaId, productoId) {
  return db
    .prepare(
      `SELECT bi.id AS boleta_item_id, bi.boleta_id, bi.cantidad_salida, bi.cantidad_devuelta,
              b.numero, b.fecha_salida
       FROM boleta_items bi
       JOIN boletas b ON b.id = bi.boleta_id
       WHERE b.area_id = ? AND b.anulada = 0 AND bi.producto_id = ?
         AND bi.cantidad_salida > bi.cantidad_devuelta
       ORDER BY b.fecha_salida ASC, b.id ASC`
    )
    .all(areaId, productoId);
}

// Algoritmo de reparto FIFO con corrección manual opcional por línea.
// estricto=true (guardado): una corrección manual que supere el pendiente real rechaza toda la operación.
// estricto=false (vista previa): la corrección se recorta silenciosamente, solo para mostrar.
function calcularLineasReparto(pendientes, cantidadLlega, manualProducto, { estricto = false } = {}) {
  let restante = cantidadLlega;
  const lineas = [];
  for (const p of pendientes) {
    const pendiente = p.cantidad_salida - p.cantidad_devuelta;
    const manualVal = manualProducto[String(p.boleta_item_id)];
    let asignado;
    let editado = false;
    if (manualVal !== undefined && manualVal !== null && manualVal !== '') {
      editado = true;
      const mv = Number(manualVal);
      if (!Number.isFinite(mv) || mv < 0) {
        if (estricto) throw new Error('Una de las cantidades corregidas manualmente no es válida.');
        asignado = 0;
      } else {
        asignado = Math.min(mv, restante);
        if (asignado > pendiente) {
          if (estricto) throw new Error('No puedes asignar más prendas de las que están pendientes en una boleta.');
          asignado = pendiente;
        }
      }
    } else {
      asignado = Math.max(0, Math.min(pendiente, restante));
    }
    restante -= asignado;
    lineas.push({
      boletaItemId: p.boleta_item_id,
      boletaId: p.boleta_id,
      numero: p.numero,
      fechaSalida: p.fecha_salida,
      pendiente,
      asignado,
      queda: pendiente - asignado,
      editado,
    });
  }
  return { lineas, excedente: Math.max(restante, 0) };
}

function previsualizarRetorno({ areaId, items, manual }) {
  const db = getDb();
  const areaIdNum = Number(areaId);
  if (!Number.isInteger(areaIdNum) || areaIdNum <= 0) throw new Error('Selecciona un área válida.');
  if (!Array.isArray(items)) throw new Error('Lista de productos inválida.');

  const manualSeguro = manual && typeof manual === 'object' ? manual : {};
  const productos = [];
  let totalLlega = 0;
  let totalExcedente = 0;
  const asignadoPorBoletaItem = new Map();

  for (const it of items) {
    const productoId = Number(it && it.productoId);
    const cantidadLlega = Number(it && it.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) continue;
    if (!Number.isInteger(cantidadLlega) || cantidadLlega < 0) continue;

    const producto = db.prepare('SELECT id, modelo, color, talla FROM productos WHERE id = ?').get(productoId);
    if (!producto) continue;

    const pendientes = obtenerPendientesFIFO(db, areaIdNum, productoId);
    const manualProducto = manualSeguro[String(productoId)] || {};
    const { lineas, excedente } = calcularLineasReparto(pendientes, cantidadLlega, manualProducto, { estricto: false });

    for (const l of lineas) {
      if (l.asignado > 0) {
        asignadoPorBoletaItem.set(l.boletaItemId, (asignadoPorBoletaItem.get(l.boletaItemId) || 0) + l.asignado);
      }
    }

    totalLlega += cantidadLlega;
    totalExcedente += excedente;

    productos.push({
      productoId,
      modelo: producto.modelo,
      color: producto.color,
      talla: producto.talla,
      cantidadLlega,
      pendienteTotal: pendientes.reduce((s, p) => s + (p.cantidad_salida - p.cantidad_devuelta), 0),
      lineas,
      excedente,
    });
  }

  const boletaIdsTocadas = new Set();
  for (const p of productos) {
    for (const l of p.lineas) if (l.asignado > 0) boletaIdsTocadas.add(l.boletaId);
  }

  const boletasQueCierran = [];
  for (const boletaId of boletaIdsTocadas) {
    const itemsBoleta = db.prepare('SELECT id, cantidad_salida, cantidad_devuelta FROM boleta_items WHERE boleta_id = ?').all(boletaId);
    const todasSaldadas = itemsBoleta.every((itb) => {
      const pend = itb.cantidad_salida - itb.cantidad_devuelta;
      const asig = asignadoPorBoletaItem.get(itb.id) || 0;
      return pend - asig <= 0;
    });
    if (todasSaldadas) {
      const b = db.prepare('SELECT numero FROM boletas WHERE id = ?').get(boletaId);
      boletasQueCierran.push({ boletaId, numero: b.numero });
    }
  }

  return {
    productos,
    resumen: {
      totalLlega,
      totalExcedente,
      boletasTocadas: boletaIdsTocadas.size,
      boletasQueCierran,
    },
  };
}

function obtenerDetalleRetorno(id) {
  const db = getDb();
  const retorno = db
    .prepare(
      `SELECT r.*, a.nombre AS area_nombre, e.nombre AS encargado_nombre
       FROM retornos r
       JOIN areas a ON a.id = r.area_id
       LEFT JOIN encargados e ON e.id = r.encargado_id
       WHERE r.id = ?`
    )
    .get(id);
  if (!retorno) throw new Error('El retorno no existe.');

  const items = db
    .prepare(
      `SELECT ri.id, ri.producto_id, ri.cantidad_total, p.modelo, p.color, p.talla,
              COALESCE((SELECT SUM(cantidad) FROM asignaciones WHERE retorno_item_id = ri.id), 0) AS asignado
       FROM retorno_items ri
       JOIN productos p ON p.id = ri.producto_id
       WHERE ri.retorno_id = ?
       ORDER BY p.modelo, p.color, p.talla`
    )
    .all(id)
    .map((it) => ({ ...it, sin_ubicar: it.cantidad_total - it.asignado }));

  return { retorno, items };
}

function crearRetorno({ numero, areaId, encargadoId, fecha, observacion, items, manual }) {
  const db = getDb();
  const areaIdNum = Number(areaId);
  if (!Number.isInteger(areaIdNum) || areaIdNum <= 0) throw new Error('Selecciona un área válida.');
  const area = db.prepare('SELECT id FROM areas WHERE id = ? AND activo = 1').get(areaIdNum);
  if (!area) throw new Error('El área indicada no existe o está inactiva.');

  let encargadoIdNum = null;
  if (encargadoId !== null && encargadoId !== undefined && encargadoId !== '') {
    encargadoIdNum = Number(encargadoId);
    if (!Number.isInteger(encargadoIdNum) || encargadoIdNum <= 0) throw new Error('El encargado indicado es inválido.');
    const encargado = db
      .prepare('SELECT id FROM encargados WHERE id = ? AND area_id = ? AND activo = 1')
      .get(encargadoIdNum, areaIdNum);
    if (!encargado) {
      throw new Error('El encargado indicado no existe, no pertenece al área seleccionada o está inactivo.');
    }
  }

  const f = validarFecha(fecha);

  if (!Array.isArray(items) || items.length === 0) throw new Error('Agrega al menos un producto a la devolución.');
  const combinados = new Map();
  for (const it of items) {
    const productoId = Number(it && it.productoId);
    const cantidad = Number(it && it.cantidad);
    if (!Number.isInteger(productoId) || productoId <= 0) throw new Error('Uno de los productos de la devolución es inválido.');
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error('La cantidad de cada producto debe ser un entero mayor a 0.');
    combinados.set(productoId, (combinados.get(productoId) || 0) + cantidad);
  }
  for (const productoId of combinados.keys()) {
    const producto = db.prepare('SELECT id FROM productos WHERE id = ?').get(productoId);
    if (!producto) throw new Error('Uno de los productos seleccionados no existe.');
  }

  const obs = observacion == null ? null : String(observacion).trim() || null;
  const manualSeguro = manual && typeof manual === 'object' ? manual : {};

  return transaccion(db, () => {
    let n = normalizarNumeroDocumento(numero, 'RET');
    if (!n) n = siguienteCorrelativo(db, 'retornos', 'RET');
    if (buscarRetornoDuplicado(db, n)) {
      throw new Error(`Ya existe un retorno con el número "${n}".`);
    }

    const infoRetorno = db
      .prepare(
        `INSERT INTO retornos (numero, area_id, encargado_id, fecha, observacion, creado_en)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(n, areaIdNum, encargadoIdNum, f, obs, new Date().toISOString());
    const retornoId = infoRetorno.lastInsertRowid;

    const stmtItem = db.prepare('INSERT INTO retorno_items (retorno_id, producto_id, cantidad_total) VALUES (?, ?, ?)');
    const stmtAsig = db.prepare(
      'INSERT INTO asignaciones (retorno_item_id, boleta_item_id, cantidad, automatica) VALUES (?, ?, ?, ?)'
    );
    const boletasAfectadas = new Set();

    for (const [productoId, cantidadLlega] of combinados) {
      const infoItem = stmtItem.run(retornoId, productoId, cantidadLlega);
      const retornoItemId = infoItem.lastInsertRowid;

      // Rule 3: releer el pendiente real de la base, no confiar en la vista previa del renderer.
      const pendientes = obtenerPendientesFIFO(db, areaIdNum, productoId);
      const manualProducto = manualSeguro[String(productoId)] || {};
      const { lineas } = calcularLineasReparto(pendientes, cantidadLlega, manualProducto, { estricto: true });

      for (const l of lineas) {
        if (l.asignado <= 0) continue;
        stmtAsig.run(retornoItemId, l.boletaItemId, l.asignado, l.editado ? 0 : 1);
        db.prepare('UPDATE boleta_items SET cantidad_devuelta = cantidad_devuelta + ? WHERE id = ?').run(l.asignado, l.boletaItemId);
        boletasAfectadas.add(l.boletaId);
      }
      // El restante (excedente) no se guarda en ningún lado: queda implícito
      // como la diferencia entre cantidad_total y la suma de asignaciones.
    }

    for (const boletaId of boletasAfectadas) recalcularEstadoBoleta(db, boletaId);

    return obtenerDetalleRetorno(retornoId);
  });
}

function siguienteNumeroRetorno() {
  return siguienteCorrelativo(getDb(), 'retornos', 'RET');
}

function listarRetornos() {
  const db = getDb();
  const base = db
    .prepare(
      `SELECT r.id, r.numero, r.fecha, r.anulado, r.motivo_anulacion,
              a.nombre AS area_nombre, e.nombre AS encargado_nombre,
              COALESCE(SUM(ri.cantidad_total), 0) AS total_prendas
       FROM retornos r
       JOIN areas a ON a.id = r.area_id
       LEFT JOIN encargados e ON e.id = r.encargado_id
       LEFT JOIN retorno_items ri ON ri.retorno_id = r.id
       GROUP BY r.id
       ORDER BY r.fecha DESC, r.id DESC`
    )
    .all();

  const stmtAplicado = db.prepare(
    `SELECT DISTINCT b.numero
     FROM asignaciones asg
     JOIN retorno_items ri ON ri.id = asg.retorno_item_id
     JOIN boleta_items bi ON bi.id = asg.boleta_item_id
     JOIN boletas b ON b.id = bi.boleta_id
     WHERE ri.retorno_id = ?
     ORDER BY b.numero`
  );
  const stmtAsignado = db.prepare(
    `SELECT COALESCE(SUM(asg.cantidad), 0) AS asignado
     FROM asignaciones asg
     JOIN retorno_items ri ON ri.id = asg.retorno_item_id
     WHERE ri.retorno_id = ?`
  );

  return base.map((r) => {
    const aplicadoA = stmtAplicado.all(r.id).map((row) => row.numero);
    const asignado = stmtAsignado.get(r.id).asignado;
    return { ...r, aplicado_a: aplicadoA, sin_ubicar: r.total_prendas - asignado };
  });
}

function listarPendientesSinUbicar() {
  const db = getDb();
  return db
    .prepare(
      `SELECT ri.id AS retorno_item_id, r.id AS retorno_id, r.numero AS retorno_numero, r.fecha,
              r.area_id, a.nombre AS area_nombre,
              ri.producto_id, p.modelo, p.color, p.talla, ri.cantidad_total,
              COALESCE((SELECT SUM(cantidad) FROM asignaciones WHERE retorno_item_id = ri.id), 0) AS asignado
       FROM retorno_items ri
       JOIN retornos r ON r.id = ri.retorno_id
       JOIN areas a ON a.id = r.area_id
       JOIN productos p ON p.id = ri.producto_id
       WHERE r.anulado = 0
       ORDER BY r.fecha, r.id`
    )
    .all()
    .map((row) => ({ ...row, sin_ubicar: row.cantidad_total - row.asignado }))
    .filter((row) => row.sin_ubicar > 0);
}

function pendientesPorProducto({ areaId, productoId }) {
  const db = getDb();
  const areaIdNum = Number(areaId);
  const productoIdNum = Number(productoId);
  if (!Number.isInteger(areaIdNum) || areaIdNum <= 0) throw new Error('Área inválida.');
  if (!Number.isInteger(productoIdNum) || productoIdNum <= 0) throw new Error('Producto inválido.');
  return obtenerPendientesFIFO(db, areaIdNum, productoIdNum).map((p) => ({
    boletaItemId: p.boleta_item_id,
    boletaId: p.boleta_id,
    numero: p.numero,
    fechaSalida: p.fecha_salida,
    pendiente: p.cantidad_salida - p.cantidad_devuelta,
  }));
}

function asignarSinUbicar({ retornoItemId, boletaItemId, cantidad }) {
  const db = getDb();
  const retornoItemIdNum = Number(retornoItemId);
  const boletaItemIdNum = Number(boletaItemId);
  const cantidadNum = Number(cantidad);
  if (!Number.isInteger(retornoItemIdNum) || retornoItemIdNum <= 0) throw new Error('Línea de retorno inválida.');
  if (!Number.isInteger(boletaItemIdNum) || boletaItemIdNum <= 0) throw new Error('Línea de boleta inválida.');
  if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) throw new Error('La cantidad a asignar debe ser un entero mayor a 0.');

  return transaccion(db, () => {
    const retornoItem = db
      .prepare(
        `SELECT ri.id, ri.producto_id, ri.cantidad_total, r.id AS retorno_id, r.area_id, r.anulado
         FROM retorno_items ri
         JOIN retornos r ON r.id = ri.retorno_id
         WHERE ri.id = ?`
      )
      .get(retornoItemIdNum);
    if (!retornoItem) throw new Error('La línea de retorno no existe.');
    if (retornoItem.anulado) throw new Error('El retorno está anulado.');

    const asignadoActual = db
      .prepare('SELECT COALESCE(SUM(cantidad), 0) AS n FROM asignaciones WHERE retorno_item_id = ?')
      .get(retornoItemIdNum).n;
    const sinUbicar = retornoItem.cantidad_total - asignadoActual;
    if (cantidadNum > sinUbicar) {
      throw new Error(`Solo quedan ${sinUbicar} prenda(s) sin ubicar en esta línea.`);
    }

    const boletaItem = db
      .prepare(
        `SELECT bi.id, bi.producto_id, bi.cantidad_salida, bi.cantidad_devuelta, b.id AS boleta_id, b.area_id, b.anulada
         FROM boleta_items bi
         JOIN boletas b ON b.id = bi.boleta_id
         WHERE bi.id = ?`
      )
      .get(boletaItemIdNum);
    if (!boletaItem) throw new Error('La línea de boleta no existe.');
    if (boletaItem.anulada) throw new Error('Esa boleta está anulada.');
    if (boletaItem.producto_id !== retornoItem.producto_id) {
      throw new Error('El producto de la boleta no coincide con el producto sin ubicar.');
    }
    if (boletaItem.area_id !== retornoItem.area_id) {
      throw new Error('La boleta no pertenece a la misma área del retorno.');
    }
    const pendiente = boletaItem.cantidad_salida - boletaItem.cantidad_devuelta;
    if (cantidadNum > pendiente) {
      throw new Error(`Solo hay ${pendiente} prenda(s) pendiente(s) en esa boleta.`);
    }

    db.prepare('INSERT INTO asignaciones (retorno_item_id, boleta_item_id, cantidad, automatica) VALUES (?, ?, ?, 0)')
      .run(retornoItemIdNum, boletaItemIdNum, cantidadNum);
    db.prepare('UPDATE boleta_items SET cantidad_devuelta = cantidad_devuelta + ? WHERE id = ?').run(cantidadNum, boletaItemIdNum);
    recalcularEstadoBoleta(db, boletaItem.boleta_id);

    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Pendientes y saldo por área
// ---------------------------------------------------------------------------

function diasDesdeFecha(fechaISO) {
  const inicio = new Date(`${fechaISO}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - inicio.getTime()) / 86400000));
}

function condicionesPendientes({ areaId, encargadoId, desde }) {
  const condiciones = ['b.anulada = 0', 'bi.cantidad_salida > bi.cantidad_devuelta'];
  const params = [];
  if (areaId) {
    condiciones.push('b.area_id = ?');
    params.push(Number(areaId));
  }
  if (encargadoId) {
    condiciones.push('b.encargado_id = ?');
    params.push(Number(encargadoId));
  }
  if (desde) {
    condiciones.push('b.fecha_salida >= ?');
    params.push(String(desde));
  }
  return { where: condiciones.join(' AND '), params };
}

function listarPendientes(filtros = {}) {
  const db = getDb();
  const { where, params } = condicionesPendientes(filtros);
  return db
    .prepare(
      `SELECT b.id AS boleta_id, b.numero, b.fecha_salida,
              a.id AS area_id, a.nombre AS area_nombre,
              e.id AS encargado_id, e.nombre AS encargado_nombre,
              p.modelo, p.color, p.talla,
              bi.cantidad_salida, bi.cantidad_devuelta
       FROM boleta_items bi
       JOIN boletas b ON b.id = bi.boleta_id
       JOIN areas a ON a.id = b.area_id
       JOIN encargados e ON e.id = b.encargado_id
       JOIN productos p ON p.id = bi.producto_id
       WHERE ${where}
       ORDER BY b.fecha_salida ASC, b.id ASC, p.modelo, p.color, p.talla`
    )
    .all(...params)
    .map((row) => ({
      ...row,
      cantidad_falta: row.cantidad_salida - row.cantidad_devuelta,
      dias: diasDesdeFecha(row.fecha_salida),
    }));
}

function saldoPorArea(filtros = {}) {
  const db = getDb();
  const { where, params } = condicionesPendientes(filtros);
  const filas = db
    .prepare(
      `SELECT a.id AS area_id, a.nombre AS area_nombre, b.id AS boleta_id, b.fecha_salida,
              bi.cantidad_salida, bi.cantidad_devuelta
       FROM boleta_items bi
       JOIN boletas b ON b.id = bi.boleta_id
       JOIN areas a ON a.id = b.area_id
       WHERE ${where}`
    )
    .all(...params);

  const porArea = new Map();
  for (const f of filas) {
    if (!porArea.has(f.area_id)) {
      porArea.set(f.area_id, { boletasAbiertas: new Set(), prendasDebiendo: 0, fechaMasAntigua: null });
    }
    const acc = porArea.get(f.area_id);
    acc.boletasAbiertas.add(f.boleta_id);
    acc.prendasDebiendo += f.cantidad_salida - f.cantidad_devuelta;
    if (!acc.fechaMasAntigua || f.fecha_salida < acc.fechaMasAntigua) acc.fechaMasAntigua = f.fecha_salida;
  }

  const areaIdFiltro = filtros.areaId ? Number(filtros.areaId) : null;
  const areas = db.prepare('SELECT id, nombre FROM areas WHERE activo = 1 ORDER BY nombre').all();
  return areas
    .filter((a) => !areaIdFiltro || a.id === areaIdFiltro)
    .map((a) => {
      const acc = porArea.get(a.id);
      return {
        areaId: a.id,
        areaNombre: a.nombre,
        boletasAbiertas: acc ? acc.boletasAbiertas.size : 0,
        prendasDebiendo: acc ? acc.prendasDebiendo : 0,
        diasMasAntigua: acc && acc.fechaMasAntigua ? diasDesdeFecha(acc.fechaMasAntigua) : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Integridad de datos
// ---------------------------------------------------------------------------

function verificarIntegridad() {
  const db = getDb();
  const filas = db
    .prepare(
      `SELECT bi.id AS boleta_item_id, bi.boleta_id, b.numero, bi.cantidad_devuelta,
              COALESCE((SELECT SUM(cantidad) FROM asignaciones WHERE boleta_item_id = bi.id), 0) AS suma_asignaciones,
              p.modelo, p.color, p.talla
       FROM boleta_items bi
       JOIN boletas b ON b.id = bi.boleta_id
       JOIN productos p ON p.id = bi.producto_id`
    )
    .all();

  const descuadres = filas
    .filter((f) => f.cantidad_devuelta !== f.suma_asignaciones)
    .map((f) => ({
      boletaItemId: f.boleta_item_id,
      boletaId: f.boleta_id,
      numero: f.numero,
      modelo: f.modelo,
      color: f.color,
      talla: f.talla,
      cantidadDevuelta: f.cantidad_devuelta,
      sumaAsignaciones: f.suma_asignaciones,
      diferencia: f.cantidad_devuelta - f.suma_asignaciones,
    }));

  return { revisadas: filas.length, descuadres };
}

function recalcularIntegridad() {
  const db = getDb();
  return transaccion(db, () => {
    const filas = db
      .prepare(
        `SELECT bi.id AS boleta_item_id, bi.boleta_id, bi.cantidad_devuelta,
                COALESCE((SELECT SUM(cantidad) FROM asignaciones WHERE boleta_item_id = bi.id), 0) AS suma_asignaciones
         FROM boleta_items bi`
      )
      .all();

    const boletasAfectadas = new Set();
    let corregidas = 0;
    for (const f of filas) {
      if (f.cantidad_devuelta !== f.suma_asignaciones) {
        db.prepare('UPDATE boleta_items SET cantidad_devuelta = ? WHERE id = ?').run(f.suma_asignaciones, f.boleta_item_id);
        boletasAfectadas.add(f.boleta_id);
        corregidas += 1;
      }
    }
    for (const boletaId of boletasAfectadas) recalcularEstadoBoleta(db, boletaId);

    return { corregidas, boletasRecalculadas: boletasAfectadas.size };
  });
}

module.exports = {
  normalizarTexto,
  transaccion,
  productos: {
    listar: listarProductos,
    listarPagina: listarProductosPagina,
    crear: crearProducto,
    editar: editarProducto,
    importar: importarProductos,
  },
  boletas: {
    listar: listarBoletas,
    kpis: kpisBoletas,
    crear: crearBoleta,
    editar: editarBoleta,
    anular: anularBoleta,
    obtenerDetalle: obtenerDetalleBoleta,
    siguienteNumero: siguienteNumeroBoleta,
  },
  retornos: {
    listar: listarRetornos,
    previsualizar: previsualizarRetorno,
    crear: crearRetorno,
    pendientesSinUbicar: listarPendientesSinUbicar,
    pendientesPorProducto,
    asignarSinUbicar,
    siguienteNumero: siguienteNumeroRetorno,
  },
  pendientes: {
    listar: listarPendientes,
    saldoPorArea,
  },
  integridad: {
    verificar: verificarIntegridad,
    recalcular: recalcularIntegridad,
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
