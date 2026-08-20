'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const SCHEMA_VERSION = 3;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS encargados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (nombre, area_id)
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  talla TEXT NOT NULL,
  color TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (modelo, talla, color)
);

CREATE TABLE IF NOT EXISTS boletas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  encargado_id INTEGER NOT NULL REFERENCES encargados(id),
  fecha_salida TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  anulada INTEGER NOT NULL DEFAULT 0,
  motivo_anulacion TEXT,
  observacion TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boleta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boleta_id INTEGER NOT NULL REFERENCES boletas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_salida INTEGER NOT NULL CHECK (cantidad_salida > 0),
  cantidad_devuelta INTEGER NOT NULL DEFAULT 0,
  UNIQUE (boleta_id, producto_id)
);

CREATE TABLE IF NOT EXISTS retornos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  area_id INTEGER NOT NULL REFERENCES areas(id),
  encargado_id INTEGER REFERENCES encargados(id),
  fecha TEXT NOT NULL,
  anulado INTEGER NOT NULL DEFAULT 0,
  motivo_anulacion TEXT,
  observacion TEXT,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retorno_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retorno_id INTEGER NOT NULL REFERENCES retornos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_total INTEGER NOT NULL CHECK (cantidad_total > 0),
  UNIQUE (retorno_id, producto_id)
);

CREATE TABLE IF NOT EXISTS asignaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retorno_item_id INTEGER NOT NULL REFERENCES retorno_items(id) ON DELETE CASCADE,
  boleta_item_id INTEGER NOT NULL REFERENCES boleta_items(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  automatica INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
`;

// Índices para que la búsqueda y el orden en Maestros > Productos respondan
// rápido incluso con ~27.000 filas. Idempotentes: se re-crean en cada arranque
// sin depender de schema_version.
const INDICES_SQL = `
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_productos_modelo ON productos(modelo);
CREATE INDEX IF NOT EXISTS idx_productos_color ON productos(color);
CREATE INDEX IF NOT EXISTS idx_productos_talla ON productos(talla);
CREATE INDEX IF NOT EXISTS idx_productos_orden ON productos(activo, modelo, color, talla);
`;

const AREAS_SEMILLA = ['LAVANDERÍA', 'DISEÑO', 'ACABADOS'];

let dbInstance = null;

function getDbPath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'sfida.sqlite');
}

function getMeta(db, clave) {
  const row = db.prepare('SELECT valor FROM meta WHERE clave = ?').get(clave);
  return row ? row.valor : null;
}

function setMeta(db, clave, valor) {
  db.prepare(
    `INSERT INTO meta (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, valor);
}

function sembrarAreas(db) {
  const stmt = db.prepare('INSERT OR IGNORE INTO areas (nombre) VALUES (?)');
  for (const nombre of AREAS_SEMILLA) stmt.run(nombre);
}

// Respaldo autocontenido para no depender de respaldo.js (evita el ciclo
// db.js -> respaldo.js -> db.js -> getDb() reentrante durante la migración).
function respaldoPreMigracion(db, etiqueta) {
  const dir = path.join(app.getPath('userData'), 'respaldos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const f = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nombre = `sfida-${etiqueta}-${f.getFullYear()}${p(f.getMonth() + 1)}${p(f.getDate())}-${p(f.getHours())}${p(f.getMinutes())}${p(f.getSeconds())}.sqlite`;
  db.prepare('VACUUM INTO ?').run(path.join(dir, nombre));
}

// v1 -> v2: el SKU pasa de MODELO|TALLA|COLOR a MODELO|COLOR|TALLA. Solo
// reescribe productos.sku; no toca boleta_items ni asignaciones (esas
// referencian producto_id, no el SKU).
function migrarSkuColorTalla(db) {
  const productos = db.prepare('SELECT id, modelo, talla, color FROM productos').all();
  const stmt = db.prepare('UPDATE productos SET sku = ? WHERE id = ?');
  for (const p of productos) {
    stmt.run(`${p.modelo}|${p.color}|${p.talla}`, p.id);
  }
}

// v2 -> v3: numeración de boletas/retornos siempre a 6 dígitos (SAL-001454,
// RET-000007). Calcula el número final que le tocaría a cada registro:
//  - Ya tiene prefijo pero con menos de 6 dígitos: se rellena con ceros.
//  - Son solo dígitos sin prefijo (numeración vieja): se le antepone el
//    prefijo de su tabla y se rellena a 6 dígitos.
//  - Cualquier otro texto libre (numeración antigua no numérica) no se toca.
function calcularNuevoNumero(numero, prefijo) {
  const n = String(numero ?? '').trim();
  const conPrefijo = new RegExp(`^${prefijo}-(\\d+)$`).exec(n);
  if (conPrefijo) {
    if (conPrefijo[1].length >= 6) return null;
    return `${prefijo}-${conPrefijo[1].padStart(6, '0')}`;
  }
  if (/^\d+$/.test(n)) {
    return `${prefijo}-${n.padStart(6, '0')}`;
  }
  return null;
}

// Agrupa por número final (el nuevo si cambia, o el actual si no cambia) para
// detectar si dos registros distintos terminarían con el mismo número.
function planificarCambiosNumeracion(db, tabla, prefijo) {
  const filas = db.prepare(`SELECT id, numero FROM ${tabla}`).all();
  const porNumeroFinal = new Map();
  const cambios = [];
  for (const fila of filas) {
    const nuevo = calcularNuevoNumero(fila.numero, prefijo);
    const final = nuevo || fila.numero;
    if (!porNumeroFinal.has(final)) porNumeroFinal.set(final, []);
    porNumeroFinal.get(final).push({ id: fila.id, numeroOriginal: fila.numero });
    if (nuevo) cambios.push({ id: fila.id, numeroOriginal: fila.numero, numeroNuevo: nuevo });
  }
  const colisiones = [];
  for (const [numeroFinal, registros] of porNumeroFinal) {
    if (registros.length > 1) colisiones.push({ tabla, numeroFinal, registros });
  }
  return { cambios, colisiones };
}

function planificarMigracionNumeracion(db) {
  const boletas = planificarCambiosNumeracion(db, 'boletas', 'SAL');
  const retornos = planificarCambiosNumeracion(db, 'retornos', 'RET');
  return {
    cambiosBoletas: boletas.cambios,
    cambiosRetornos: retornos.cambios,
    colisiones: [...boletas.colisiones, ...retornos.colisiones],
  };
}

function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);');
  let versionActual = Number(getMeta(db, 'schema_version') || 0);
  let colisionesNumeracion = [];

  if (versionActual < 1) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA_SQL);
      sembrarAreas(db);
      setMeta(db, 'schema_version', '1');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    versionActual = 1;
  } else {
    // Asegura que tablas/columnas nuevas existan aunque la base ya tenga datos.
    db.exec(SCHEMA_SQL);
  }

  if (versionActual < 2) {
    respaldoPreMigracion(db, 'premigracion-v2');
    db.exec('BEGIN');
    try {
      migrarSkuColorTalla(db);
      setMeta(db, 'schema_version', '2');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    versionActual = 2;
  }

  if (versionActual < 3) {
    const plan = planificarMigracionNumeracion(db);
    if (plan.colisiones.length > 0) {
      // No se toca nada: se deja schema_version en 2 para reintentar en el
      // próximo arranque, una vez que el usuario corrija los números a mano.
      colisionesNumeracion = plan.colisiones;
    } else {
      respaldoPreMigracion(db, 'premigracion-v3');
      db.exec('BEGIN');
      try {
        const stmtBoletas = db.prepare('UPDATE boletas SET numero = ? WHERE id = ?');
        for (const c of plan.cambiosBoletas) stmtBoletas.run(c.numeroNuevo, c.id);
        const stmtRetornos = db.prepare('UPDATE retornos SET numero = ? WHERE id = ?');
        for (const c of plan.cambiosRetornos) stmtRetornos.run(c.numeroNuevo, c.id);
        setMeta(db, 'schema_version', '3');
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      versionActual = 3;
    }
  }

  // Idempotente: no depende de versión, para que bases antiguas también
  // terminen con los índices sin forzar un bump de schema_version.
  db.exec(INDICES_SQL);

  return { colisionesNumeracion };
}

let colisionesNumeracionPendiente = [];

function getDb() {
  if (dbInstance) return dbInstance;

  const db = new DatabaseSync(getDbPath());
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  const { colisionesNumeracion } = migrar(db);
  colisionesNumeracionPendiente = colisionesNumeracion;

  dbInstance = db;
  return dbInstance;
}

function getColisionesNumeracionPendiente() {
  return colisionesNumeracionPendiente;
}

function cerrarDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, getDbPath, cerrarDb, getColisionesNumeracionPendiente };
