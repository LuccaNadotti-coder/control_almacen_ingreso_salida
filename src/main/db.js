'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const SCHEMA_VERSION = 1;

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

function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);');
  const versionActual = Number(getMeta(db, 'schema_version') || 0);

  if (versionActual < SCHEMA_VERSION) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA_SQL);
      sembrarAreas(db);
      setMeta(db, 'schema_version', String(SCHEMA_VERSION));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

function getDb() {
  if (dbInstance) return dbInstance;

  const db = new DatabaseSync(getDbPath());
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db);

  dbInstance = db;
  return dbInstance;
}

function cerrarDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, getDbPath, cerrarDb };
