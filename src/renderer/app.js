'use strict';

// ---------------------------------------------------------------------------
// Utilidades generales
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function mensajeError(err) {
  const texto = String(err && err.message ? err.message : err);
  const idx = texto.lastIndexOf('Error: ');
  return idx >= 0 ? texto.slice(idx + 'Error: '.length) : texto;
}

// Convierte a mayúsculas mientras se escribe, sin perder la posición del cursor.
function vincularMayusculas(input) {
  if (!input || input.dataset.mayusVinculado) return;
  input.dataset.mayusVinculado = '1';
  input.classList.add('mayus');
  input.addEventListener('input', () => {
    const inicio = input.selectionStart;
    const fin = input.selectionEnd;
    input.value = input.value.toUpperCase();
    try { input.setSelectionRange(inicio, fin); } catch (_) { /* inputs sin soporte de selección */ }
  });
}

function vincularMayusculasEn(contenedor) {
  contenedor.querySelectorAll('input[data-mayus]').forEach(vincularMayusculas);
}

// ---------------------------------------------------------------------------
// Prefijo fijo del número de boleta/retorno (SAL-000007 / RET-000007)
// ---------------------------------------------------------------------------

const PREFIJO_SALIDA = 'SAL-';
const PREFIJO_RETORNO = 'RET-';

// Solo los números que ya siguen el formato de prefijo fijo usan el widget de
// prefijo + dígitos. Números viejos (anteriores a esta numeración) se editan
// como texto libre para no renombrarlos sin que el usuario lo pida.
function sigueFormatoPrefijo(numero, prefijo) {
  return new RegExp(`^${prefijo}\\d+$`).test(String(numero ?? '').trim());
}

function soloDigitos(s) {
  return String(s ?? '').replace(/\D/g, '');
}

// Deja pasar solo dígitos en un input mientras se escribe, preservando la
// posición del cursor (igual criterio que vincularMayusculas). Si se pasa
// maxLen, además recorta el valor a esa cantidad de dígitos.
function filtrarSoloDigitos(input, maxLen) {
  const inicio = input.selectionStart;
  const antes = input.value;
  let limpio = soloDigitos(antes);
  if (maxLen) limpio = limpio.slice(0, maxLen);
  if (limpio === antes) return;
  input.value = limpio;
  const pos = Math.max(0, inicio - (antes.length - limpio.length));
  try { input.setSelectionRange(pos, pos); } catch (_) { /* inputs sin soporte de selección */ }
}

// Fechas: la base guarda YYYY-MM-DD (formato de <input type="date">).
function fechaHoyISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatoFechaCorta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function formatoFechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatoFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function diasDesde(iso) {
  if (!iso) return 0;
  const inicio = new Date(`${iso}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - inicio.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------
// Búsqueda inteligente de productos (Registro de salidas / Registro de retornos)
// ---------------------------------------------------------------------------

function textoProducto(p) {
  return `${p.modelo} · ${p.color} · ${p.talla}`;
}

function normalizarBusquedaProducto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

// Coincidencia por palabras sin importar el orden ("vestido negro l" encuentra
// "VESTIDO ... L ... NEGRO"), priorizando lo que empieza igual que lo escrito.
function buscarSugerenciasProducto(productos, texto) {
  const normalizado = normalizarBusquedaProducto(texto);
  if (normalizado.length < 2) return [];
  const palabras = normalizado.split(/\s+/).filter(Boolean);
  const coincidencias = productos.filter((p) => {
    const t = normalizarBusquedaProducto(`${p.modelo} ${p.color} ${p.talla}`);
    return palabras.every((palabra) => t.includes(palabra));
  });
  coincidencias.sort((a, b) => {
    const ta = normalizarBusquedaProducto(`${a.modelo} ${a.color} ${a.talla}`);
    const tb = normalizarBusquedaProducto(`${b.modelo} ${b.color} ${b.talla}`);
    const aEmpieza = ta.startsWith(normalizado) ? 0 : 1;
    const bEmpieza = tb.startsWith(normalizado) ? 0 : 1;
    if (aEmpieza !== bEmpieza) return aEmpieza - bEmpieza;
    return ta.localeCompare(tb);
  });
  return coincidencias.slice(0, 8);
}

// Reparte lo escrito en modelo/color/talla lo mejor posible: último token =
// talla, penúltimo = color, el resto = modelo. El usuario ajusta antes de guardar.
function partirTextoProducto(texto) {
  const palabras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return { modelo: '', color: '', talla: '' };
  if (palabras.length === 1) return { modelo: palabras[0], color: '', talla: '' };
  if (palabras.length === 2) return { modelo: palabras[0], color: palabras[1], talla: '' };
  const talla = palabras[palabras.length - 1];
  const color = palabras[palabras.length - 2];
  const modelo = palabras.slice(0, palabras.length - 2).join(' ');
  return { modelo, color, talla };
}

// Devuelve solo los items (sin el div contenedor .sugerencias): el llamador
// decide dónde montarlos (ver mostrarPortalSugerencias, que los monta en un
// portal fuera del flujo para que ningún ancestro con overflow los recorte).
// indiceActivo marca el ítem resaltado por teclado (-1 = ninguno).
function itemsSugerenciasProducto(productos, texto, prefijo, indiceActivo = -1) {
  const textoLimpio = String(texto ?? '').trim();
  if (textoLimpio.length < 2) return '';
  const sugerencias = buscarSugerenciasProducto(productos, textoLimpio);
  const itemsProductos = sugerencias
    .map(
      (p, i) => `
      <div class="sug-item${i === indiceActivo ? ' sug-activo' : ''}" data-accion="elegir-producto-${prefijo}" data-id="${p.id}" data-index="${i}">
        <b>${escapeHtml(p.modelo)}</b> <span>${escapeHtml(p.color)} · ${escapeHtml(p.talla)}</span>
      </div>`
    )
    .join('');
  const indiceCrear = sugerencias.length;
  const itemCrear = `
    <div class="sug-item sug-crear${indiceCrear === indiceActivo ? ' sug-activo' : ''}" data-accion="crear-producto-nuevo-${prefijo}" data-texto="${escapeHtml(textoLimpio)}" data-index="${indiceCrear}">
      + Crear producto nuevo: "${escapeHtml(textoLimpio)}"
    </div>`;
  return `${itemsProductos}${itemCrear}`;
}

function totalSugerencias(productos, texto) {
  const textoLimpio = String(texto ?? '').trim();
  if (textoLimpio.length < 2) return 0;
  return buscarSugerenciasProducto(productos, textoLimpio).length + 1; // +1 = "crear producto nuevo"
}

// ---------------------------------------------------------------------------
// Portal de sugerencias: vive fuera de las tarjetas (hijo directo de <body>)
// y se posiciona con position:fixed calculado desde el input, así ninguna
// .card con overflow:hidden lo recorta, sin importar dónde esté el buscador.
// ---------------------------------------------------------------------------

const elPortalSugerencias = document.getElementById('sugerencias-portal');

// Estado del portal abierto (qué input lo pidió, con qué datos y qué ítem
// está resaltado por teclado), para poder repintarlo en cada ArrowUp/Down
// sin depender de que el llamador vuelva a pasar los mismos argumentos.
const estadoPortal = { input: null, productos: [], texto: '', prefijo: '', indice: -1 };

function ocultarPortalSugerencias() {
  elPortalSugerencias.style.display = 'none';
  elPortalSugerencias.innerHTML = '';
  estadoPortal.input = null;
  estadoPortal.indice = -1;
}

function posicionarPortalSugerencias(input) {
  const r = input.getBoundingClientRect();
  elPortalSugerencias.style.left = `${r.left}px`;
  elPortalSugerencias.style.top = `${r.bottom + 6}px`;
  elPortalSugerencias.style.width = `${r.width}px`;
}

function repintarPortalSugerencias() {
  const html = itemsSugerenciasProducto(estadoPortal.productos, estadoPortal.texto, estadoPortal.prefijo, estadoPortal.indice);
  if (!html) {
    ocultarPortalSugerencias();
    return;
  }
  elPortalSugerencias.innerHTML = html;
  elPortalSugerencias.style.display = 'block';
  posicionarPortalSugerencias(estadoPortal.input);
}

function mostrarPortalSugerencias(input, productos, texto, prefijo) {
  estadoPortal.input = input;
  estadoPortal.productos = productos;
  estadoPortal.texto = texto;
  estadoPortal.prefijo = prefijo;
  estadoPortal.indice = -1;
  repintarPortalSugerencias();
}

// Navega el resaltado con flechas arriba/abajo (con wraparound) y hace
// scroll para mantener el ítem activo visible dentro de la lista.
function moverIndiceSugerencias(delta) {
  if (elPortalSugerencias.style.display === 'none') return false;
  const total = totalSugerencias(estadoPortal.productos, estadoPortal.texto);
  if (total === 0) return false;
  let nuevo = estadoPortal.indice + delta;
  if (nuevo < 0) nuevo = total - 1;
  if (nuevo >= total) nuevo = 0;
  estadoPortal.indice = nuevo;
  repintarPortalSugerencias();
  elPortalSugerencias.querySelector('.sug-activo')?.scrollIntoView({ block: 'nearest' });
  return true;
}

// Confirma con Enter el ítem resaltado por teclado, reutilizando el mismo
// manejador de click del portal (elegir producto / crear producto nuevo).
function activarSeleccionPortal() {
  if (estadoPortal.indice < 0) return false;
  const el = elPortalSugerencias.querySelector(`[data-index="${estadoPortal.indice}"]`);
  if (!el) return false;
  el.click();
  return true;
}

// Solo el scroll de la propia página cierra el portal; el scroll ocurrido
// dentro de él (rueda del mouse o arrastre de su barra) no debe cerrarlo.
// Tampoco lo cierra el desplazamiento horizontal DENTRO del propio input de
// búsqueda: al escribir más letras de las que caben en el renglón, el campo
// hace scroll de su texto y dispara 'scroll'; eso no es scroll de la página y
// no debe apagar las sugerencias (el portal sigue anclado al mismo input).
// El listener está en capture porque 'scroll' no burbujea, pero sí se
// dispara en fase de captura para elementos con overflow anidados.
window.addEventListener(
  'scroll',
  (e) => {
    if (elPortalSugerencias.contains(e.target)) return;
    if (e.target === estadoPortal.input) return;
    if (e.target instanceof Element && e.target.matches('input, textarea')) return;
    ocultarPortalSugerencias();
  },
  true
);
window.addEventListener('resize', ocultarPortalSugerencias);

// mousedown en cualquier parte del portal (ítems o su barra de scroll) no
// debe quitarle el foco al input de búsqueda.
elPortalSugerencias.addEventListener('mousedown', (e) => {
  e.preventDefault();
});

// Los data-accion de "elegir"/"crear producto" quedan en el portal, no en las
// vistas #nueva/#devolver; se despachan aquí hacia las funciones de cada vista
// (elegirProductoNs/crearProductoNuevoNs/elegirProductoDv/crearProductoNuevoDv,
// declaradas más abajo — se pueden referenciar antes porque son function
// declarations, sujetas a hoisting).
elPortalSugerencias.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');
  ocultarPortalSugerencias();

  if (accion === 'elegir-producto-ns') {
    elegirProductoNs(Number(btn.getAttribute('data-id')));
  } else if (accion === 'crear-producto-nuevo-ns') {
    crearProductoNuevoNs(btn.getAttribute('data-texto') || '');
  } else if (accion === 'elegir-producto-dv') {
    elegirProductoDv(Number(btn.getAttribute('data-id')));
  } else if (accion === 'crear-producto-nuevo-dv') {
    crearProductoNuevoDv(btn.getAttribute('data-texto') || '');
  }
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const PROXIMAMENTE = {};

function pintarProximamente(id) {
  const info = PROXIMAMENTE[id];
  const sec = document.getElementById(id);
  sec.innerHTML = `
    <div class="head"><div><h2>${info.titulo}</h2><p>${info.desc}</p></div></div>
    <div class="card"><div class="vacio">Próximamente.</div></div>
  `;
}

const vistasInicializadas = new Set();

function irA(id, params) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === id));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-go') === id));
  window.scrollTo(0, 0);

  if (id === 'maestros') {
    refrescarMaestros();
  } else if (id === 'salidas') {
    refrescarSalidas();
  } else if (id === 'nueva') {
    abrirNuevaSalida(params && params.id);
  } else if (id === 'detalle') {
    abrirDetalle(params && params.id);
  } else if (id === 'devolver') {
    abrirDevolucion();
  } else if (id === 'retornos') {
    refrescarRetornos();
  } else if (id === 'pendientes') {
    abrirPendientes();
  } else if (id === 'ajustes') {
    abrirAjustes();
  } else if (!vistasInicializadas.has(id)) {
    pintarProximamente(id);
    vistasInicializadas.add(id);
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (!el) return;
  const id = el.getAttribute('data-go');
  const rawId = el.getAttribute('data-id');
  irA(id, rawId ? { id: Number(rawId) } : undefined);
});

// Cierra el portal de sugerencias de producto al hacer clic fuera de él.
document.addEventListener('click', (e) => {
  if (e.target.closest('.campo-buscar') || e.target.closest('#sugerencias-portal')) return;
  ocultarPortalSugerencias();
});

function tagEstadoBoleta(estadoBoleta, anulada) {
  if (anulada) return '<span class="tag t-inactivo">Anulada</span>';
  const mapa = {
    pendiente: ['t-pend', 'Pendiente'],
    parcial: ['t-parc', 'Parcial'],
    completo: ['t-comp', 'Completo'],
  };
  const [clase, texto] = mapa[estadoBoleta] || mapa.pendiente;
  return `<span class="tag ${clase}">${texto}</span>`;
}

// ---------------------------------------------------------------------------
// SALIDAS
// ---------------------------------------------------------------------------

const estadoSalidas = { boletas: [], kpis: null, error: null };

async function refrescarSalidas() {
  try {
    const [boletas, kpis] = await Promise.all([
      window.api.boletas.listar({ incluirAnuladas: true }),
      window.api.boletas.kpis(),
    ]);
    estadoSalidas.boletas = boletas;
    estadoSalidas.kpis = kpis;
    estadoSalidas.error = null;
  } catch (err) {
    estadoSalidas.error = mensajeError(err);
  }
  pintarSalidas();
}

function filaSalida(b) {
  return `
    <tr class="click" data-go="detalle" data-id="${b.id}">
      <td class="num">${escapeHtml(b.numero)}</td>
      <td>${escapeHtml(b.area_nombre)}</td>
      <td>${escapeHtml(b.encargado_nombre)}</td>
      <td class="num">${formatoFechaCorta(b.fecha_salida)}</td>
      <td class="r num">${b.total_salido}</td>
      <td class="r num ${b.total_falta > 0 ? 'falta' : 'cero'}">${b.total_falta}</td>
      <td>${tagEstadoBoleta(b.estado, b.anulada)}</td>
    </tr>`;
}

function pintarSalidas() {
  const sec = document.getElementById('salidas');
  if (estadoSalidas.error) {
    sec.innerHTML = `<div class="head"><div><h2>Salidas</h2></div></div><div class="error">${escapeHtml(estadoSalidas.error)}</div>`;
    return;
  }

  const k = estadoSalidas.kpis || { boletasAbiertas: 0, prendasFuera: 0, sinDevolver: 0, cerradasEsteMes: 0 };
  const filas = estadoSalidas.boletas.length
    ? estadoSalidas.boletas.map(filaSalida).join('')
    : `<tr><td colspan="7" class="vacio">Sin boletas de salida todavía.</td></tr>`;

  sec.innerHTML = `
    <div class="head">
      <div><h2>Salidas</h2><p>Boletas emitidas hacia las áreas de trabajo.</p></div>
      <button class="btn" data-go="nueva">Registro de salidas</button>
    </div>
    <div class="kpi">
      <div><span>Boletas abiertas</span><b class="num">${k.boletasAbiertas}</b></div>
      <div><span>Prendas fuera</span><b class="num">${k.prendasFuera}</b></div>
      <div class="acc"><span>Sin devolver</span><b class="num">${k.sinDevolver}</b></div>
      <div><span>Cerradas este mes</span><b class="num">${k.cerradasEsteMes}</b></div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Boleta</th><th>Área</th><th>Encargado</th><th>Salida</th><th class="r">Salió</th><th class="r">Falta</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="note">Clic en una fila para ver el detalle y qué retornos la afectaron.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// NUEVA SALIDA / EDITAR SALIDA
// ---------------------------------------------------------------------------

const estadoNueva = {
  modoEdicion: false,
  boletaId: null,
  numero: '',
  numeroModo: 'prefijo', // 'prefijo' (SAL-XXXX, numero = solo dígitos) | 'libre' (numero viejo, texto completo)
  fecha: '',
  areaId: '',
  encargadoId: '',
  observacion: '',
  lineas: [],
  busqueda: '',
  productoSeleccionadoId: null,
  formNuevoProducto: null,
  cantidadTmp: 1,
  productosDisponibles: [],
  areas: [],
  encargados: [],
  mensaje: null,
  mensajeLinea: null,
};

async function cargarEncargadosPorArea(areaId) {
  estadoNueva.encargados = areaId ? await window.api.encargados.listar({ areaId: Number(areaId) }) : [];
}

async function abrirNuevaSalida(editarId) {
  try {
    const [productos, areas] = await Promise.all([
      window.api.productos.listar(),
      window.api.areas.listar(),
    ]);
    estadoNueva.productosDisponibles = productos;
    estadoNueva.areas = areas;
    estadoNueva.mensaje = null;
    estadoNueva.mensajeLinea = null;
    estadoNueva.busqueda = '';
    estadoNueva.productoSeleccionadoId = null;
    estadoNueva.formNuevoProducto = null;
    estadoNueva.cantidadTmp = 1;

    if (editarId) {
      const detalle = await window.api.boletas.obtenerDetalle(editarId);
      if (detalle.boleta.anulada || detalle.tieneAsignaciones) {
        irA('detalle', { id: editarId });
        return;
      }
      estadoNueva.modoEdicion = true;
      estadoNueva.boletaId = editarId;
      if (sigueFormatoPrefijo(detalle.boleta.numero, PREFIJO_SALIDA)) {
        estadoNueva.numeroModo = 'prefijo';
        estadoNueva.numero = detalle.boleta.numero.slice(PREFIJO_SALIDA.length);
      } else {
        estadoNueva.numeroModo = 'libre';
        estadoNueva.numero = detalle.boleta.numero;
      }
      estadoNueva.fecha = detalle.boleta.fecha_salida;
      estadoNueva.areaId = String(detalle.boleta.area_id);
      estadoNueva.encargadoId = String(detalle.boleta.encargado_id);
      estadoNueva.observacion = detalle.boleta.observacion || '';
      estadoNueva.lineas = detalle.items.map((it) => ({
        productoId: it.producto_id,
        modelo: it.modelo,
        color: it.color,
        talla: it.talla,
        cantidad: it.cantidad_salida,
      }));
      await cargarEncargadosPorArea(estadoNueva.areaId);
    } else {
      estadoNueva.modoEdicion = false;
      estadoNueva.boletaId = null;
      estadoNueva.numeroModo = 'prefijo';
      estadoNueva.numero = soloDigitos(await window.api.boletas.siguienteNumero());
      estadoNueva.fecha = fechaHoyISO();
      estadoNueva.areaId = '';
      estadoNueva.encargadoId = '';
      estadoNueva.observacion = '';
      estadoNueva.lineas = [];
      estadoNueva.encargados = [];
    }
    pintarNueva();
  } catch (err) {
    document.getElementById('nueva').innerHTML =
      `<div class="head"><div><h2>Registro de salidas</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
  }
}

function capturarCamposNueva() {
  const campo = (id) => document.getElementById(id);
  if (campo('ns-numero')) estadoNueva.numero = campo('ns-numero').value;
  if (campo('ns-fecha')) estadoNueva.fecha = campo('ns-fecha').value;
  if (campo('ns-area')) estadoNueva.areaId = campo('ns-area').value;
  if (campo('ns-encargado')) estadoNueva.encargadoId = campo('ns-encargado').value;
  if (campo('ns-buscar')) estadoNueva.busqueda = campo('ns-buscar').value;
  if (campo('ns-cantidad')) estadoNueva.cantidadTmp = campo('ns-cantidad').value;
}

function formNuevoProductoHtml(form, prefijo) {
  if (!form) return '';
  return `
    <div class="pad" style="border-top:1px solid var(--line);background:var(--panel-2)">
      <p style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Crear producto nuevo</p>
      <div class="grid3">
        <div><label>Modelo</label><input data-mayus id="${prefijo}-inline-modelo" value="${escapeHtml(form.modelo)}"></div>
        <div><label>Color</label><input data-mayus id="${prefijo}-inline-color" value="${escapeHtml(form.color)}"></div>
        <div><label>Talla</label><input data-mayus id="${prefijo}-inline-talla" value="${escapeHtml(form.talla)}"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn ghost sm" data-accion="cancelar-producto-inline-${prefijo}">Cancelar</button>
        <button class="btn sm" data-accion="guardar-producto-inline-${prefijo}">Guardar producto</button>
      </div>
    </div>`;
}

function filaLinea(l) {
  return `
    <tr>
      <td>${escapeHtml(l.modelo)}</td>
      <td>${escapeHtml(l.color)}</td>
      <td>${escapeHtml(l.talla)}</td>
      <td class="r num">${l.cantidad}</td>
      <td class="r"><button class="btn ghost sm" data-accion="quitar-linea" data-id="${l.productoId}">Quitar</button></td>
    </tr>`;
}

function pintarNueva() {
  const sec = document.getElementById('nueva');
  const opcionesArea = estadoNueva.areas
    .map((a) => `<option value="${a.id}" ${String(a.id) === String(estadoNueva.areaId) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`)
    .join('');
  const opcionesEncargado = estadoNueva.encargados
    .map((e) => `<option value="${e.id}" ${String(e.id) === String(estadoNueva.encargadoId) ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`)
    .join('');
  const filas = estadoNueva.lineas.length
    ? estadoNueva.lineas.map(filaLinea).join('')
    : `<tr><td colspan="5" class="vacio">Todavía no agregas prendas.</td></tr>`;
  const totalPrendas = estadoNueva.lineas.reduce((s, l) => s + l.cantidad, 0);
  const msg = estadoNueva.mensaje
    ? `<div class="${estadoNueva.mensaje.tipo}">${escapeHtml(estadoNueva.mensaje.texto)}</div>` : '';
  const msgLinea = estadoNueva.mensajeLinea
    ? `<div class="error" style="margin:0 18px 16px">${escapeHtml(estadoNueva.mensajeLinea)}</div>` : '';
  const titulo = estadoNueva.modoEdicion ? 'Editar salida' : 'Registro de salidas';
  const avisoSinEncargados = estadoNueva.areaId && !estadoNueva.encargados.length
    ? `<div class="error" style="margin:12px 18px 0">Esta área no tiene encargados activos. Regístralos en Maestros antes de continuar.</div>`
    : '';
  const campoNumero = estadoNueva.numeroModo === 'prefijo'
    ? `<div class="input-prefijo"><span class="prefijo-fijo">${PREFIJO_SALIDA}</span><input inputmode="numeric" autocomplete="off" maxlength="6" id="ns-numero" placeholder="000007" value="${escapeHtml(estadoNueva.numero)}"></div>`
    : `<input data-mayus id="ns-numero" value="${escapeHtml(estadoNueva.numero)}">`;

  sec.innerHTML = `
    <div class="head"><div><h2>${titulo}</h2><p>Registra la boleta y las prendas que salen del almacén.</p></div></div>
    <div class="card">
      <h3>Datos de la boleta</h3>
      <div class="pad">
        <div class="grid2" style="margin-bottom:14px">
          <div><label>N° de boleta</label>${campoNumero}</div>
          <div><label>Fecha de salida</label><input type="date" id="ns-fecha" value="${escapeHtml(estadoNueva.fecha)}"></div>
        </div>
        <div class="grid2">
          <div><label>Área</label><select id="ns-area"><option value="">Selecciona…</option>${opcionesArea}</select></div>
          <div><label>Encargado que recibe</label>
            <select id="ns-encargado" ${estadoNueva.encargados.length ? '' : 'disabled'}>
              <option value="">${estadoNueva.areaId ? 'Selecciona…' : 'Elige un área primero'}</option>${opcionesEncargado}
            </select>
          </div>
        </div>
      </div>
      ${avisoSinEncargados}
    </div>
    <div class="card">
      <h3>Prendas</h3>
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div class="campo-buscar">
            <label>Buscar producto</label>
            <input id="ns-buscar" autocomplete="off" placeholder="modelo, color o talla…" value="${escapeHtml(estadoNueva.busqueda)}">
          </div>
          <div><label>Cantidad</label><input class="qty" type="number" min="1" step="1" id="ns-cantidad" value="${escapeHtml(String(estadoNueva.cantidadTmp))}"></div>
          <div><button class="btn ghost" style="width:100%" data-accion="agregar-linea">Agregar</button></div>
        </div>
        ${msgLinea}
      </div>
      ${formNuevoProductoHtml(estadoNueva.formNuevoProducto, 'ns')}
      <table>
        <thead><tr><th>Modelo</th><th>Color</th><th>Talla</th><th class="r">Cantidad</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      <div class="foot">
        <span class="resumen">${estadoNueva.lineas.length} línea${estadoNueva.lineas.length === 1 ? '' : 's'} · <b class="num" style="color:var(--text)">${totalPrendas}</b> prendas</span>
        <div style="display:flex;gap:10px">
          <button class="btn ghost" data-accion="cancelar-nueva">Cancelar</button>
          <button class="btn" data-accion="guardar-boleta">${estadoNueva.modoEdicion ? 'Guardar cambios' : 'Guardar boleta'}</button>
        </div>
      </div>
    </div>`;
  vincularMayusculasEn(sec);
}

const nuevaEl = document.getElementById('nueva');

// Primer encargado activo por orden de creación (id ascendente = orden de alta).
function primerEncargadoActivoId(encargados) {
  if (!encargados.length) return '';
  const primero = [...encargados].sort((a, b) => a.id - b.id)[0];
  return String(primero.id);
}

nuevaEl.addEventListener('change', async (e) => {
  if (e.target.id === 'ns-area') {
    capturarCamposNueva();
    estadoNueva.areaId = e.target.value;
    await cargarEncargadosPorArea(estadoNueva.areaId);
    estadoNueva.encargadoId = primerEncargadoActivoId(estadoNueva.encargados);
    pintarNueva();
  }
});

nuevaEl.addEventListener('input', (e) => {
  if (e.target.id === 'ns-numero' && estadoNueva.numeroModo === 'prefijo') {
    filtrarSoloDigitos(e.target, 6);
    return;
  }
  if (e.target.id === 'ns-buscar') {
    estadoNueva.busqueda = e.target.value;
    estadoNueva.productoSeleccionadoId = null;
    mostrarPortalSugerencias(e.target, estadoNueva.productosDisponibles, estadoNueva.busqueda, 'ns');
  }
});

nuevaEl.addEventListener('focusin', (e) => {
  if (e.target.id === 'ns-buscar') {
    mostrarPortalSugerencias(e.target, estadoNueva.productosDisponibles, estadoNueva.busqueda, 'ns');
  }
});

nuevaEl.addEventListener('keydown', (e) => {
  if (e.target.id !== 'ns-buscar') return;
  if (e.key === 'ArrowDown') {
    if (moverIndiceSugerencias(1)) e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    if (moverIndiceSugerencias(-1)) e.preventDefault();
  } else if (e.key === 'Enter') {
    if (activarSeleccionPortal()) e.preventDefault();
  } else if (e.key === 'Escape') {
    ocultarPortalSugerencias();
  }
});

function elegirProductoNs(productoId) {
  const producto = estadoNueva.productosDisponibles.find((p) => p.id === productoId);
  if (producto) {
    estadoNueva.busqueda = textoProducto(producto);
    estadoNueva.productoSeleccionadoId = producto.id;
  }
  estadoNueva.mensajeLinea = null;
  pintarNueva();
  document.getElementById('ns-cantidad')?.focus();
}

function crearProductoNuevoNs(texto) {
  estadoNueva.formNuevoProducto = partirTextoProducto(texto);
  pintarNueva();
}

nuevaEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'cancelar-producto-inline-ns') {
    estadoNueva.formNuevoProducto = null;
    pintarNueva();
    return;
  }

  if (accion === 'guardar-producto-inline-ns') {
    const modelo = document.getElementById('ns-inline-modelo').value;
    const talla = document.getElementById('ns-inline-talla').value;
    const color = document.getElementById('ns-inline-color').value;
    try {
      const producto = await window.api.productos.crear({ modelo, talla, color });
      estadoNueva.productosDisponibles.push(producto);
      estadoNueva.formNuevoProducto = null;
      estadoNueva.busqueda = textoProducto(producto);
      estadoNueva.productoSeleccionadoId = producto.id;
      estadoNueva.mensajeLinea = null;
      pintarNueva();
      document.getElementById('ns-cantidad')?.focus();
    } catch (err) {
      estadoNueva.mensajeLinea = mensajeError(err);
      pintarNueva();
    }
    return;
  }

  if (accion === 'agregar-linea') {
    capturarCamposNueva();
    const texto = estadoNueva.busqueda.trim();
    const cantidad = Number(estadoNueva.cantidadTmp);
    const producto = estadoNueva.productoSeleccionadoId
      ? estadoNueva.productosDisponibles.find((p) => p.id === estadoNueva.productoSeleccionadoId)
      : estadoNueva.productosDisponibles.find((p) => textoProducto(p) === texto);
    if (!producto) {
      estadoNueva.mensajeLinea = 'Selecciona un producto de la lista de sugerencias.';
      pintarNueva();
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      estadoNueva.mensajeLinea = 'La cantidad debe ser un entero mayor a 0.';
      pintarNueva();
      return;
    }
    const existente = estadoNueva.lineas.find((l) => l.productoId === producto.id);
    if (existente) existente.cantidad += cantidad;
    else {
      estadoNueva.lineas.push({
        productoId: producto.id, modelo: producto.modelo, color: producto.color, talla: producto.talla, cantidad,
      });
    }
    estadoNueva.busqueda = '';
    estadoNueva.productoSeleccionadoId = null;
    estadoNueva.cantidadTmp = 1;
    estadoNueva.mensajeLinea = null;
    pintarNueva();
    return;
  }

  if (accion === 'quitar-linea') {
    capturarCamposNueva();
    const productoId = Number(btn.getAttribute('data-id'));
    estadoNueva.lineas = estadoNueva.lineas.filter((l) => l.productoId !== productoId);
    pintarNueva();
    return;
  }

  if (accion === 'cancelar-nueva') {
    irA('salidas');
    return;
  }

  if (accion === 'guardar-boleta') {
    capturarCamposNueva();
    estadoNueva.mensaje = null;
    try {
      const digitos = estadoNueva.numero.trim();
      const numeroFinal = estadoNueva.numeroModo === 'prefijo'
        ? (digitos ? `${PREFIJO_SALIDA}${digitos.padStart(6, '0')}` : '')
        : estadoNueva.numero;
      const payload = {
        numero: numeroFinal,
        fechaSalida: estadoNueva.fecha,
        areaId: Number(estadoNueva.areaId),
        encargadoId: Number(estadoNueva.encargadoId),
        observacion: estadoNueva.observacion,
        items: estadoNueva.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      };
      const resultado = estadoNueva.modoEdicion
        ? await window.api.boletas.editar(estadoNueva.boletaId, payload)
        : await window.api.boletas.crear(payload);
      irA('detalle', { id: resultado.boleta.id });
    } catch (err) {
      estadoNueva.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarNueva();
    }
  }
});

// ---------------------------------------------------------------------------
// DETALLE DE BOLETA
// ---------------------------------------------------------------------------

const estadoDetalle = { boletaId: null, datos: null, error: null, mensaje: null, anulando: false };

async function abrirDetalle(id) {
  estadoDetalle.boletaId = id;
  estadoDetalle.mensaje = null;
  estadoDetalle.anulando = false;
  try {
    estadoDetalle.datos = await window.api.boletas.obtenerDetalle(id);
    estadoDetalle.error = null;
  } catch (err) {
    estadoDetalle.error = mensajeError(err);
  }
  pintarDetalle();
}

function filaDetalleItem(it) {
  const pct = it.cantidad_salida > 0 ? Math.round((it.cantidad_devuelta / it.cantidad_salida) * 100) : 0;
  return `
    <tr>
      <td>${escapeHtml(it.modelo)}</td>
      <td>${escapeHtml(it.color)}</td>
      <td>${escapeHtml(it.talla)}</td>
      <td class="r num">${it.cantidad_salida}</td>
      <td class="r num">${it.cantidad_devuelta}</td>
      <td class="r num ${it.cantidad_falta > 0 ? 'falta' : 'cero'}">${it.cantidad_falta}</td>
      <td><span class="bar"><i style="width:${pct}%"></i></span></td>
    </tr>`;
}

function pintarDetalle() {
  const sec = document.getElementById('detalle');
  if (estadoDetalle.error) {
    sec.innerHTML = `<div class="head"><div><h2>Detalle de boleta</h2></div></div><div class="error">${escapeHtml(estadoDetalle.error)}</div>`;
    return;
  }

  const { boleta, items, tieneAsignaciones, retornos } = estadoDetalle.datos;
  const totalSalio = items.reduce((s, it) => s + it.cantidad_salida, 0);
  const totalDevuelto = items.reduce((s, it) => s + it.cantidad_devuelta, 0);
  const totalFalta = totalSalio - totalDevuelto;
  const dias = diasDesde(boleta.fecha_salida);
  const filas = items.map(filaDetalleItem).join('');

  const puedeEditar = !boleta.anulada && !tieneAsignaciones;
  const puedeAnular = !boleta.anulada;

  const botones = `
    <button class="btn ghost" data-go="salidas">Volver</button>
    ${puedeEditar ? '<button class="btn ghost" data-accion="editar-boleta">Editar</button>' : ''}
    ${puedeAnular ? '<button class="btn ghost" data-accion="anular-boleta">Anular</button>' : ''}
    <button class="btn" data-go="devolver">Registro de retornos</button>`;

  const avisoAnulada = boleta.anulada
    ? `<div class="error">Boleta anulada. Motivo: ${escapeHtml(boleta.motivo_anulacion || '')}</div>` : '';
  const mensaje = estadoDetalle.mensaje
    ? `<div class="${estadoDetalle.mensaje.tipo}">${escapeHtml(estadoDetalle.mensaje.texto)}</div>` : '';

  const formAnular = estadoDetalle.anulando ? `
    <div class="card">
      <h3>Anular boleta ${escapeHtml(boleta.numero)}</h3>
      <div class="pad">
        <label>Motivo de anulación</label>
        <input id="det-motivo" placeholder="Explica por qué se anula esta boleta…">
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn ghost" data-accion="cancelar-anular">Cancelar</button>
          <button class="btn" data-accion="confirmar-anular">Confirmar anulación</button>
        </div>
      </div>
    </div>` : '';

  const retornosHtml = retornos.length
    ? `<ul class="time">${retornos.map((r) => {
        const detalle = r.detalle.map((d) => `${escapeHtml(d.modelo)} ${escapeHtml(d.color)} ${escapeHtml(d.talla)} (${d.cantidad})`).join(', ');
        return `
        <li><b>${escapeHtml(r.numero)} · ${formatoFechaLarga(r.fecha)}</b>
        <p>Trajo ${r.total_retorno} prendas en total, de las cuales <b>${r.aplicado_aqui}</b> se aplicaron aquí — ${detalle}</p></li>`;
      }).join('')}</ul>`
    : `<div class="vacio">Todavía no hay retornos que afecten esta boleta.</div>`;

  sec.innerHTML = `
    <div class="head">
      <div>
        <h2>Boleta ${escapeHtml(boleta.numero)} ${tagEstadoBoleta(boleta.estado, boleta.anulada)}</h2>
        <p>${escapeHtml(boleta.area_nombre)} · ${escapeHtml(boleta.encargado_nombre)} · salió el ${formatoFechaLarga(boleta.fecha_salida)} · ${dias} día${dias === 1 ? '' : 's'} fuera</p>
      </div>
      <div style="display:flex;gap:10px">${botones}</div>
    </div>
    ${avisoAnulada}
    ${mensaje}
    ${formAnular}
    <div class="card">
      <h3>Reconciliación por producto</h3>
      <table>
        <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th class="r">Salió</th><th class="r">Devuelto</th><th class="r">Falta</th><th>Avance</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="note">Salieron <b class="num">${totalSalio}</b> · devueltas <b class="num">${totalDevuelto}</b> · <span class="falta">faltan ${totalFalta}</span></p>
    </div>
    <div class="card">
      <h3>Retornos que afectaron esta boleta <em>El área devuelve mezclado; aquí se ve solo lo que tocó a esta boleta</em></h3>
      <div class="pad">${retornosHtml}</div>
    </div>`;
}

const detalleEl = document.getElementById('detalle');

detalleEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'editar-boleta') {
    irA('nueva', { id: estadoDetalle.boletaId });
    return;
  }

  if (accion === 'anular-boleta') {
    estadoDetalle.mensaje = null;
    estadoDetalle.anulando = true;
    pintarDetalle();
    return;
  }

  if (accion === 'cancelar-anular') {
    estadoDetalle.anulando = false;
    pintarDetalle();
    return;
  }

  if (accion === 'confirmar-anular') {
    const motivo = document.getElementById('det-motivo').value;
    if (!motivo.trim()) {
      estadoDetalle.mensaje = { tipo: 'error', texto: 'Debes indicar un motivo para anular la boleta.' };
      pintarDetalle();
      return;
    }
    try {
      await window.api.boletas.anular(estadoDetalle.boletaId, motivo);
      estadoDetalle.mensaje = null;
      estadoDetalle.anulando = false;
      await abrirDetalle(estadoDetalle.boletaId);
    } catch (err) {
      estadoDetalle.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarDetalle();
    }
  }
});

// ---------------------------------------------------------------------------
// REGISTRAR DEVOLUCIÓN (reparto FIFO)
// ---------------------------------------------------------------------------

const estadoDevolucion = {
  numero: '',
  fecha: '',
  areaId: '',
  encargadoId: '',
  observacion: '',
  areas: [],
  encargados: [],
  productosDisponibles: [],
  itemsLlegada: [], // [{productoId, modelo, color, talla, cantidad}]
  manual: {}, // { [productoId]: { [boletaItemId]: cantidadCorregida } }
  busqueda: '',
  productoSeleccionadoId: null,
  formNuevoProducto: null,
  cantidadTmp: 1,
  preview: null,
  mensaje: null,
  mensajeLinea: null,
};

async function abrirDevolucion() {
  try {
    const [areas, productos, numero] = await Promise.all([
      window.api.areas.listar(),
      window.api.productos.listar(),
      window.api.retornos.siguienteNumero(),
    ]);
    estadoDevolucion.areas = areas;
    estadoDevolucion.productosDisponibles = productos;
    estadoDevolucion.numero = soloDigitos(numero);
    estadoDevolucion.fecha = fechaHoyISO();
    estadoDevolucion.areaId = '';
    estadoDevolucion.encargadoId = '';
    estadoDevolucion.observacion = '';
    estadoDevolucion.encargados = [];
    estadoDevolucion.itemsLlegada = [];
    estadoDevolucion.manual = {};
    estadoDevolucion.busqueda = '';
    estadoDevolucion.productoSeleccionadoId = null;
    estadoDevolucion.formNuevoProducto = null;
    estadoDevolucion.cantidadTmp = 1;
    estadoDevolucion.preview = null;
    estadoDevolucion.mensaje = null;
    estadoDevolucion.mensajeLinea = null;
    pintarDevolucion();
  } catch (err) {
    document.getElementById('devolver').innerHTML =
      `<div class="head"><div><h2>Registro de retornos</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
  }
}

function capturarCamposDevolucion() {
  const campo = (id) => document.getElementById(id);
  if (campo('dv-numero')) estadoDevolucion.numero = campo('dv-numero').value;
  if (campo('dv-fecha')) estadoDevolucion.fecha = campo('dv-fecha').value;
  if (campo('dv-encargado')) estadoDevolucion.encargadoId = campo('dv-encargado').value;
  if (campo('dv-buscar')) estadoDevolucion.busqueda = campo('dv-buscar').value;
  if (campo('dv-cantidad')) estadoDevolucion.cantidadTmp = campo('dv-cantidad').value;
}

let previewRequestId = 0;

async function recalcularPreviewDevolucion() {
  if (!estadoDevolucion.areaId || estadoDevolucion.itemsLlegada.length === 0) {
    estadoDevolucion.preview = null;
    pintarDevolucion();
    return;
  }
  const miId = ++previewRequestId;
  try {
    const preview = await window.api.retornos.previsualizar({
      areaId: Number(estadoDevolucion.areaId),
      items: estadoDevolucion.itemsLlegada.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
      manual: estadoDevolucion.manual,
    });
    if (miId !== previewRequestId) return;
    estadoDevolucion.preview = preview;
  } catch (err) {
    if (miId !== previewRequestId) return;
    estadoDevolucion.preview = null;
    estadoDevolucion.mensaje = { tipo: 'error', texto: mensajeError(err) };
  }
  pintarDevolucion();
}

function pendienteAreaParaProducto(productoId) {
  if (!estadoDevolucion.preview) return null;
  const p = estadoDevolucion.preview.productos.find((x) => x.productoId === productoId);
  return p ? p.pendienteTotal : null;
}

function filaLlegada(it) {
  const pendienteArea = pendienteAreaParaProducto(it.productoId);
  const pendienteTxt = pendienteArea === null ? '…' : pendienteArea;
  return `
    <tr>
      <td>${escapeHtml(it.modelo)}</td>
      <td>${escapeHtml(it.color)}</td>
      <td>${escapeHtml(it.talla)}</td>
      <td class="r num ${pendienteArea > 0 ? 'falta' : 'cero'}">${pendienteTxt}</td>
      <td class="r"><input class="qty" type="number" min="0" step="1" value="${it.cantidad}" data-llega="${it.productoId}"></td>
      <td class="r"><button class="btn ghost sm" data-accion="quitar-llegada" data-id="${it.productoId}">Quitar</button></td>
    </tr>`;
}

function pintarPreviewReparto() {
  const preview = estadoDevolucion.preview;
  if (!preview) {
    return {
      preview: '<div class="pad" style="color:var(--muted);text-align:center;padding:26px">Elige un área y agrega productos para ver el reparto.</div>',
      aviso: '',
      resumen: 'Agrega productos para calcular el reparto.',
    };
  }

  const prodHtml = preview.productos.length
    ? preview.productos.map((p) => {
        const rows = p.lineas.map((l) => {
          const manualRaw = (estadoDevolucion.manual[p.productoId] || {})[l.boletaItemId];
          const valorInput = manualRaw !== undefined ? manualRaw : l.asignado;
          return `
            <div class="alloc">
              <span class="bol">${escapeHtml(l.numero)}</span><span class="fch">${formatoFechaCorta(l.fechaSalida)}</span>
              <input class="qty" type="number" min="0" max="${l.pendiente}" value="${escapeHtml(String(valorInput))}" data-producto="${p.productoId}" data-boleta-item="${l.boletaItemId}">
              <span class="est">de ${l.pendiente} pendientes ·
                ${l.queda === 0 && l.asignado > 0 ? '<span class="cierra">línea saldada</span>' : `<span class="queda">quedan ${l.queda}</span>`}
                ${l.editado ? '<span class="manual">corregido</span>' : ''}</span>
            </div>`;
        }).join('') || '<div class="est" style="padding:8px 0 0">No hay boletas pendientes de esta área para este producto.</div>';

        const exc = p.excedente > 0 ? `
          <div class="alloc excede">
            <span class="bol">Sin ubicar</span><span class="fch">—</span>
            <span class="num" style="width:72px;text-align:right;padding:9px 11px">${p.excedente}</span>
            <span class="est">llegaron más prendas de las que estaban pendientes</span>
          </div>` : '';

        return `
          <div class="prod">
            <div class="prod-h"><b>${escapeHtml(p.modelo)} · ${escapeHtml(p.color)} · ${escapeHtml(p.talla)}</b><span class="num">llegan ${p.cantidadLlega}</span></div>
            ${rows}${exc}
          </div>`;
      }).join('')
    : '<div class="pad" style="color:var(--muted);text-align:center;padding:26px">Sin productos que repartir.</div>';

  const avisoHtml = preview.resumen.totalExcedente > 0
    ? `<div class="aviso"><b>${preview.resumen.totalExcedente} prendas sin ubicar.</b> Llegaron más de las que el área tenía pendientes. Se guardan como excedente para revisarlas después; no se asignan a ninguna boleta.</div>`
    : '';

  const cierran = preview.resumen.boletasQueCierran.map((b) => escapeHtml(b.numero));
  const resumenHtml =
    `Llegan <b class="num" style="color:var(--text)">${preview.resumen.totalLlega}</b> prendas · afecta ${preview.resumen.boletasTocadas} boleta${preview.resumen.boletasTocadas === 1 ? '' : 's'}` +
    (cierran.length ? ` · <span class="tag t-comp">${cierran.join(', ')} pasa a Completo</span>` : '');

  return { preview: prodHtml, aviso: avisoHtml, resumen: resumenHtml };
}

function pintarDevolucion() {
  const sec = document.getElementById('devolver');
  const opcionesArea = estadoDevolucion.areas
    .map((a) => `<option value="${a.id}" ${String(a.id) === String(estadoDevolucion.areaId) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`)
    .join('');
  const opcionesEncargado = estadoDevolucion.encargados
    .map((e) => `<option value="${e.id}" ${String(e.id) === String(estadoDevolucion.encargadoId) ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`)
    .join('');
  const filasLlegada = estadoDevolucion.itemsLlegada.length
    ? estadoDevolucion.itemsLlegada.map(filaLlegada).join('')
    : `<tr><td colspan="6" class="vacio">Agrega los productos que trae el área.</td></tr>`;
  const msgLinea = estadoDevolucion.mensajeLinea
    ? `<div class="error" style="margin:0 18px 16px">${escapeHtml(estadoDevolucion.mensajeLinea)}</div>` : '';
  const msg = estadoDevolucion.mensaje
    ? `<div class="${estadoDevolucion.mensaje.tipo}">${escapeHtml(estadoDevolucion.mensaje.texto)}</div>` : '';
  const { preview: previewHtml, aviso: avisoHtml, resumen: resumenHtml } = pintarPreviewReparto();
  const hayArea = Boolean(estadoDevolucion.areaId);
  const avisoSinEncargados = hayArea && !estadoDevolucion.encargados.length
    ? `<div class="error" style="margin:12px 18px 0">Esta área no tiene encargados activos. Regístralos en Maestros antes de continuar.</div>`
    : '';

  sec.innerHTML = `
    <div class="head">
      <div><h2>Registro de retornos</h2><p>El área devuelve prendas mezcladas de varias salidas. Indica solo cuánto llega; el sistema lo reparte contra las boletas más antiguas y tú corriges si hace falta.</p></div>
    </div>
    <div class="card">
      <h3>Boleta de retorno</h3>
      <div class="pad">
        <div class="grid4">
          <div><label>N° de retorno</label><div class="input-prefijo"><span class="prefijo-fijo">${PREFIJO_RETORNO}</span><input inputmode="numeric" autocomplete="off" maxlength="6" id="dv-numero" placeholder="000007" value="${escapeHtml(estadoDevolucion.numero)}"></div></div>
          <div><label>Área</label><select id="dv-area"><option value="">Selecciona…</option>${opcionesArea}</select></div>
          <div><label>Fecha</label><input type="date" id="dv-fecha" value="${escapeHtml(estadoDevolucion.fecha)}"></div>
          <div><label>Entrega</label>
            <select id="dv-encargado" ${estadoDevolucion.encargados.length ? '' : 'disabled'}>
              <option value="">${hayArea ? 'Selecciona…' : 'Elige un área primero'}</option>${opcionesEncargado}
            </select>
          </div>
        </div>
      </div>
      ${avisoSinEncargados}
    </div>
    <div class="card">
      <h3>¿Qué llegó? <em>Cantidad total, sin importar de qué boleta salió</em></h3>
      <table>
        <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th class="r">Pendiente del área</th><th class="r">Llega ahora</th><th></th></tr></thead>
        <tbody>${filasLlegada}</tbody>
      </table>
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div class="campo-buscar">
            <label>Agregar otro producto</label>
            <input id="dv-buscar" autocomplete="off" placeholder="modelo, color o talla…" value="${escapeHtml(estadoDevolucion.busqueda)}" ${hayArea ? '' : 'disabled'}>
          </div>
          <div><label>Cantidad</label><input class="qty" type="number" min="1" step="1" id="dv-cantidad" value="${escapeHtml(String(estadoDevolucion.cantidadTmp))}" ${hayArea ? '' : 'disabled'}></div>
          <div><button class="btn ghost" style="width:100%" data-accion="agregar-llegada" ${hayArea ? '' : 'disabled'}>Agregar a la devolución</button></div>
        </div>
        ${msgLinea}
      </div>
      ${formNuevoProductoHtml(estadoDevolucion.formNuevoProducto, 'dv')}
    </div>
    <div class="card">
      <h3>Vista previa del reparto <em>Se salda primero la boleta más antigua · puedes corregir cualquier cantidad</em></h3>
      <div id="dv-preview">${previewHtml}</div>
      <div id="dv-aviso">${avisoHtml}</div>
      ${msg}
      <div class="foot">
        <span class="resumen" id="dv-resumen">${resumenHtml}</span>
        <div style="display:flex;gap:10px">
          <button class="btn ghost" data-accion="cancelar-devolucion">Cancelar</button>
          <button class="btn" data-accion="guardar-devolucion">Guardar devolución</button>
        </div>
      </div>
    </div>`;
  vincularMayusculasEn(sec);
}

const devolverEl = document.getElementById('devolver');

devolverEl.addEventListener('change', async (e) => {
  if (e.target.id === 'dv-area') {
    capturarCamposDevolucion();
    estadoDevolucion.areaId = e.target.value;
    estadoDevolucion.itemsLlegada = [];
    estadoDevolucion.manual = {};
    estadoDevolucion.preview = null;
    estadoDevolucion.busqueda = '';
    estadoDevolucion.productoSeleccionadoId = null;
    estadoDevolucion.formNuevoProducto = null;
    estadoDevolucion.encargados = estadoDevolucion.areaId
      ? await window.api.encargados.listar({ areaId: Number(estadoDevolucion.areaId) })
      : [];
    estadoDevolucion.encargadoId = primerEncargadoActivoId(estadoDevolucion.encargados);
    pintarDevolucion();
    return;
  }

  if (e.target.matches('input[data-llega]')) {
    capturarCamposDevolucion();
    const productoId = Number(e.target.getAttribute('data-llega'));
    const item = estadoDevolucion.itemsLlegada.find((it) => it.productoId === productoId);
    if (item) {
      const val = Number(e.target.value);
      item.cantidad = Number.isFinite(val) && val >= 0 ? val : 0;
      delete estadoDevolucion.manual[productoId];
    }
    await recalcularPreviewDevolucion();
    return;
  }

  if (e.target.matches('input[data-producto][data-boleta-item]')) {
    capturarCamposDevolucion();
    const productoId = e.target.getAttribute('data-producto');
    const boletaItemId = e.target.getAttribute('data-boleta-item');
    const val = e.target.value;
    if (!estadoDevolucion.manual[productoId]) estadoDevolucion.manual[productoId] = {};
    if (val === '') delete estadoDevolucion.manual[productoId][boletaItemId];
    else estadoDevolucion.manual[productoId][boletaItemId] = Number(val);
    await recalcularPreviewDevolucion();
  }
});

devolverEl.addEventListener('input', (e) => {
  if (e.target.id === 'dv-numero') {
    filtrarSoloDigitos(e.target, 6);
    return;
  }
  if (e.target.id === 'dv-buscar') {
    estadoDevolucion.busqueda = e.target.value;
    estadoDevolucion.productoSeleccionadoId = null;
    mostrarPortalSugerencias(e.target, estadoDevolucion.productosDisponibles, estadoDevolucion.busqueda, 'dv');
  }
});

devolverEl.addEventListener('focusin', (e) => {
  if (e.target.id === 'dv-buscar') {
    mostrarPortalSugerencias(e.target, estadoDevolucion.productosDisponibles, estadoDevolucion.busqueda, 'dv');
  }
});

devolverEl.addEventListener('keydown', (e) => {
  if (e.target.id !== 'dv-buscar') return;
  if (e.key === 'ArrowDown') {
    if (moverIndiceSugerencias(1)) e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    if (moverIndiceSugerencias(-1)) e.preventDefault();
  } else if (e.key === 'Enter') {
    if (activarSeleccionPortal()) e.preventDefault();
  } else if (e.key === 'Escape') {
    ocultarPortalSugerencias();
  }
});

function elegirProductoDv(productoId) {
  const producto = estadoDevolucion.productosDisponibles.find((p) => p.id === productoId);
  if (producto) {
    estadoDevolucion.busqueda = textoProducto(producto);
    estadoDevolucion.productoSeleccionadoId = producto.id;
  }
  estadoDevolucion.mensajeLinea = null;
  pintarDevolucion();
  document.getElementById('dv-cantidad')?.focus();
}

function crearProductoNuevoDv(texto) {
  estadoDevolucion.formNuevoProducto = partirTextoProducto(texto);
  pintarDevolucion();
}

devolverEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'cancelar-producto-inline-dv') {
    estadoDevolucion.formNuevoProducto = null;
    pintarDevolucion();
    return;
  }

  if (accion === 'guardar-producto-inline-dv') {
    const modelo = document.getElementById('dv-inline-modelo').value;
    const talla = document.getElementById('dv-inline-talla').value;
    const color = document.getElementById('dv-inline-color').value;
    try {
      const producto = await window.api.productos.crear({ modelo, talla, color });
      estadoDevolucion.productosDisponibles.push(producto);
      estadoDevolucion.formNuevoProducto = null;
      estadoDevolucion.busqueda = textoProducto(producto);
      estadoDevolucion.productoSeleccionadoId = producto.id;
      estadoDevolucion.mensajeLinea = null;
      pintarDevolucion();
      document.getElementById('dv-cantidad')?.focus();
    } catch (err) {
      estadoDevolucion.mensajeLinea = mensajeError(err);
      pintarDevolucion();
    }
    return;
  }

  if (accion === 'agregar-llegada') {
    capturarCamposDevolucion();
    const texto = estadoDevolucion.busqueda.trim();
    const cantidad = Number(estadoDevolucion.cantidadTmp);
    const producto = estadoDevolucion.productoSeleccionadoId
      ? estadoDevolucion.productosDisponibles.find((p) => p.id === estadoDevolucion.productoSeleccionadoId)
      : estadoDevolucion.productosDisponibles.find((p) => textoProducto(p) === texto);
    if (!producto) {
      estadoDevolucion.mensajeLinea = 'Selecciona un producto de la lista de sugerencias.';
      pintarDevolucion();
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      estadoDevolucion.mensajeLinea = 'La cantidad debe ser un entero mayor a 0.';
      pintarDevolucion();
      return;
    }
    const existente = estadoDevolucion.itemsLlegada.find((it) => it.productoId === producto.id);
    if (existente) {
      existente.cantidad += cantidad;
      delete estadoDevolucion.manual[producto.id];
    } else {
      estadoDevolucion.itemsLlegada.push({
        productoId: producto.id, modelo: producto.modelo, color: producto.color, talla: producto.talla, cantidad,
      });
    }
    estadoDevolucion.busqueda = '';
    estadoDevolucion.productoSeleccionadoId = null;
    estadoDevolucion.cantidadTmp = 1;
    estadoDevolucion.mensajeLinea = null;
    await recalcularPreviewDevolucion();
    return;
  }

  if (accion === 'quitar-llegada') {
    capturarCamposDevolucion();
    const productoId = Number(btn.getAttribute('data-id'));
    estadoDevolucion.itemsLlegada = estadoDevolucion.itemsLlegada.filter((it) => it.productoId !== productoId);
    delete estadoDevolucion.manual[productoId];
    await recalcularPreviewDevolucion();
    return;
  }

  if (accion === 'cancelar-devolucion') {
    irA('salidas');
    return;
  }

  if (accion === 'guardar-devolucion') {
    capturarCamposDevolucion();
    estadoDevolucion.mensaje = null;
    try {
      const digitosRet = estadoDevolucion.numero.trim();
      const numeroFinalRet = digitosRet ? `${PREFIJO_RETORNO}${digitosRet.padStart(6, '0')}` : '';
      await window.api.retornos.crear({
        numero: numeroFinalRet,
        areaId: Number(estadoDevolucion.areaId),
        encargadoId: estadoDevolucion.encargadoId ? Number(estadoDevolucion.encargadoId) : null,
        fecha: estadoDevolucion.fecha,
        observacion: estadoDevolucion.observacion,
        items: estadoDevolucion.itemsLlegada.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
        manual: estadoDevolucion.manual,
      });
      irA('retornos');
    } catch (err) {
      estadoDevolucion.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarDevolucion();
    }
  }
});

// ---------------------------------------------------------------------------
// RETORNOS
// ---------------------------------------------------------------------------

const estadoRetornos = {
  retornos: [],
  sinUbicar: [],
  error: null,
  mensaje: null,
  asignando: null,
  opcionesAsignar: [],
  cantidadAsignar: 1,
  boletaSeleccionada: '',
};

async function refrescarRetornos() {
  try {
    const [retornos, sinUbicar] = await Promise.all([
      window.api.retornos.listar(),
      window.api.retornos.pendientesSinUbicar(),
    ]);
    estadoRetornos.retornos = retornos;
    estadoRetornos.sinUbicar = sinUbicar;
    estadoRetornos.error = null;
  } catch (err) {
    estadoRetornos.error = mensajeError(err);
  }
  pintarRetornos();
}

function filaRetorno(r) {
  const aplicadoTxt = r.aplicado_a.length ? escapeHtml(r.aplicado_a.join(', ')) : '<span class="cero">—</span>';
  return `
    <tr>
      <td class="num">${escapeHtml(r.numero)}</td>
      <td>${escapeHtml(r.area_nombre)}</td>
      <td>${escapeHtml(r.encargado_nombre || '—')}</td>
      <td class="num">${formatoFechaCorta(r.fecha)}</td>
      <td class="r num">${r.total_prendas}</td>
      <td class="sku">${aplicadoTxt}</td>
      <td class="r num" ${r.sin_ubicar > 0 ? 'style="color:#E3B95F"' : 'style="color:var(--muted)"'}>${r.sin_ubicar}</td>
    </tr>`;
}

function filaSinUbicar(row) {
  const enEdicion = estadoRetornos.asignando === row.retorno_item_id;
  if (enEdicion) {
    const opciones = estadoRetornos.opcionesAsignar
      .map((o) => `<option value="${o.boletaItemId}" ${String(o.boletaItemId) === String(estadoRetornos.boletaSeleccionada) ? 'selected' : ''}>${escapeHtml(o.numero)} · ${formatoFechaCorta(o.fechaSalida)} · pendiente ${o.pendiente}</option>`)
      .join('');
    return `
      <tr>
        <td class="num">${escapeHtml(row.retorno_numero)}</td>
        <td colspan="5">
          <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:6px 0">
            <div style="flex:1;min-width:200px">
              <label>Asignar a boleta (sin ubicar: ${row.sin_ubicar})</label>
              <select id="asig-boleta">${opciones || '<option value="">Sin boletas pendientes de este producto</option>'}</select>
            </div>
            <div style="width:100px">
              <label>Cantidad</label>
              <input class="qty" type="number" min="1" max="${row.sin_ubicar}" id="asig-cantidad" value="${estadoRetornos.cantidadAsignar}">
            </div>
            <button class="btn ghost sm" data-accion="cancelar-asignar">Cancelar</button>
            <button class="btn sm" data-accion="confirmar-asignar" data-id="${row.retorno_item_id}">Confirmar</button>
          </div>
        </td>
      </tr>`;
  }
  return `
    <tr>
      <td class="num">${escapeHtml(row.retorno_numero)}</td>
      <td>${escapeHtml(row.modelo)}</td>
      <td>${escapeHtml(row.color)}</td>
      <td>${escapeHtml(row.talla)}</td>
      <td class="r num" style="color:#E3B95F">${row.sin_ubicar}</td>
      <td class="r"><button class="btn ghost sm" data-accion="abrir-asignar" data-id="${row.retorno_item_id}" data-producto="${row.producto_id}" data-area="${row.area_id}">Asignar a boleta</button></td>
    </tr>`;
}

function pintarRetornos() {
  const sec = document.getElementById('retornos');
  if (estadoRetornos.error) {
    sec.innerHTML = `<div class="head"><div><h2>Retornos</h2></div></div><div class="error">${escapeHtml(estadoRetornos.error)}</div>`;
    return;
  }

  const filasRetornos = estadoRetornos.retornos.length
    ? estadoRetornos.retornos.map(filaRetorno).join('')
    : `<tr><td colspan="7" class="vacio">Sin retornos registrados todavía.</td></tr>`;
  const filasSinUbicar = estadoRetornos.sinUbicar.length
    ? estadoRetornos.sinUbicar.map(filaSinUbicar).join('')
    : `<tr><td colspan="6" class="vacio">No hay prendas sin ubicar.</td></tr>`;
  const msg = estadoRetornos.mensaje
    ? `<div class="${estadoRetornos.mensaje.tipo}">${escapeHtml(estadoRetornos.mensaje.texto)}</div>` : '';

  sec.innerHTML = `
    <div class="head">
      <div><h2>Retornos</h2><p>Boletas que emiten las áreas al devolver. Una puede saldar varias salidas a la vez.</p></div>
      <button class="btn" data-go="devolver">Registro de retornos</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Retorno</th><th>Área</th><th>Entregó</th><th>Fecha</th><th class="r">Prendas</th><th>Aplicado a</th><th class="r">Sin ubicar</th></tr></thead>
        <tbody>${filasRetornos}</tbody>
      </table>
    </div>
    <div class="card">
      <h3>Prendas sin ubicar <em>Llegaron de más; no se asignaron a ninguna boleta</em></h3>
      <table>
        <thead><tr><th>Retorno</th><th>Producto</th><th>Color</th><th>Talla</th><th class="r">Cantidad</th><th></th></tr></thead>
        <tbody>${filasSinUbicar}</tbody>
      </table>
      ${msg}
      <p class="note">Se guardan para que las revises sin trabar la operación del día.</p>
    </div>`;
}

const retornosEl = document.getElementById('retornos');

retornosEl.addEventListener('change', (e) => {
  if (e.target.id === 'asig-boleta') {
    estadoRetornos.boletaSeleccionada = e.target.value;
  } else if (e.target.id === 'asig-cantidad') {
    estadoRetornos.cantidadAsignar = e.target.value;
  }
});

retornosEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'abrir-asignar') {
    const retornoItemId = Number(btn.getAttribute('data-id'));
    const productoId = Number(btn.getAttribute('data-producto'));
    const areaId = Number(btn.getAttribute('data-area'));
    try {
      const opciones = await window.api.retornos.pendientesPorProducto({ areaId, productoId });
      estadoRetornos.asignando = retornoItemId;
      estadoRetornos.opcionesAsignar = opciones;
      estadoRetornos.boletaSeleccionada = opciones.length ? String(opciones[0].boletaItemId) : '';
      estadoRetornos.cantidadAsignar = 1;
      estadoRetornos.mensaje = null;
      pintarRetornos();
    } catch (err) {
      estadoRetornos.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarRetornos();
    }
    return;
  }

  if (accion === 'cancelar-asignar') {
    estadoRetornos.asignando = null;
    pintarRetornos();
    return;
  }

  if (accion === 'confirmar-asignar') {
    const retornoItemId = Number(btn.getAttribute('data-id'));
    const boletaItemId = Number(document.getElementById('asig-boleta').value);
    const cantidad = Number(document.getElementById('asig-cantidad').value);
    if (!boletaItemId) {
      estadoRetornos.mensaje = { tipo: 'error', texto: 'Selecciona una boleta.' };
      pintarRetornos();
      return;
    }
    try {
      await window.api.retornos.asignarSinUbicar({ retornoItemId, boletaItemId, cantidad });
      estadoRetornos.asignando = null;
      estadoRetornos.mensaje = null;
      await refrescarRetornos();
    } catch (err) {
      estadoRetornos.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarRetornos();
    }
  }
});

// ---------------------------------------------------------------------------
// PENDIENTES
// ---------------------------------------------------------------------------

const estadoPendientes = {
  areaId: '',
  encargadoId: '',
  desde: '',
  areas: [],
  encargados: [],
  filas: [],
  saldo: [],
  error: null,
  exportando: false,
  mensaje: null,
};

function filtrosPendientesActuales() {
  return {
    areaId: estadoPendientes.areaId ? Number(estadoPendientes.areaId) : null,
    encargadoId: estadoPendientes.encargadoId ? Number(estadoPendientes.encargadoId) : null,
    desde: estadoPendientes.desde || null,
  };
}

async function refrescarPendientes() {
  try {
    const filtros = filtrosPendientesActuales();
    const [filas, saldo] = await Promise.all([
      window.api.pendientes.listar(filtros),
      window.api.pendientes.saldoPorArea(filtros),
    ]);
    estadoPendientes.filas = filas;
    estadoPendientes.saldo = saldo;
    estadoPendientes.error = null;
  } catch (err) {
    estadoPendientes.error = mensajeError(err);
  }
  pintarPendientes();
}

async function abrirPendientes() {
  try {
    const [areas, encargados] = await Promise.all([
      window.api.areas.listar({ incluirInactivos: true }),
      window.api.encargados.listar({ incluirInactivos: true }),
    ]);
    estadoPendientes.areas = areas;
    estadoPendientes.encargados = encargados;
  } catch (err) {
    estadoPendientes.error = mensajeError(err);
  }
  await refrescarPendientes();
}

function filaPendiente(p) {
  return `
    <tr>
      <td class="num">${escapeHtml(p.numero)}</td>
      <td>${escapeHtml(p.area_nombre)}</td>
      <td>${escapeHtml(p.modelo)}</td>
      <td>${escapeHtml(p.color)}</td>
      <td>${escapeHtml(p.talla)}</td>
      <td class="r num">${p.cantidad_salida}</td>
      <td class="r num">${p.cantidad_devuelta}</td>
      <td class="r num falta">${p.cantidad_falta}</td>
      <td class="r num">${p.dias}</td>
    </tr>`;
}

function filaSaldoArea(s) {
  return `
    <tr>
      <td>${escapeHtml(s.areaNombre)}</td>
      <td class="r num">${s.boletasAbiertas}</td>
      <td class="r num ${s.prendasDebiendo > 0 ? 'falta' : 'cero'}">${s.prendasDebiendo}</td>
      <td class="r num">${s.diasMasAntigua === null ? '—' : `${s.diasMasAntigua} días`}</td>
    </tr>`;
}

function pintarPendientes() {
  const sec = document.getElementById('pendientes');
  if (estadoPendientes.error) {
    sec.innerHTML = `<div class="head"><div><h2>Pendientes</h2></div></div><div class="error">${escapeHtml(estadoPendientes.error)}</div>`;
    return;
  }

  const opcionesArea = estadoPendientes.areas
    .map((a) => `<option value="${a.id}" ${String(a.id) === String(estadoPendientes.areaId) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`)
    .join('');
  const opcionesEncargado = estadoPendientes.encargados
    .map((e) => `<option value="${e.id}" ${String(e.id) === String(estadoPendientes.encargadoId) ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`)
    .join('');

  const filas = estadoPendientes.filas.length
    ? estadoPendientes.filas.map(filaPendiente).join('')
    : `<tr><td colspan="9" class="vacio">Sin líneas pendientes con estos filtros.</td></tr>`;
  const filasSaldo = estadoPendientes.saldo.length
    ? estadoPendientes.saldo.map(filaSaldoArea).join('')
    : `<tr><td colspan="4" class="vacio">Sin áreas para mostrar.</td></tr>`;

  const totalFalta = estadoPendientes.filas.reduce((s, p) => s + p.cantidad_falta, 0);
  const msg = estadoPendientes.mensaje
    ? `<div class="${estadoPendientes.mensaje.tipo}">${escapeHtml(estadoPendientes.mensaje.texto)}</div>` : '';

  sec.innerHTML = `
    <div class="head">
      <div><h2>Pendientes</h2><p>Todo lo que salió del almacén y todavía no regresa.</p></div>
      <button class="btn ghost" data-accion="exportar-excel" ${estadoPendientes.exportando ? 'disabled' : ''}>${estadoPendientes.exportando ? 'Exportando…' : 'Exportar a Excel'}</button>
    </div>
    <div class="card">
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="grid3">
          <div><label>Área</label><select id="pd-area"><option value="">Todas</option>${opcionesArea}</select></div>
          <div><label>Encargado</label><select id="pd-encargado"><option value="">Todos</option>${opcionesEncargado}</select></div>
          <div><label>Desde</label><input type="date" id="pd-desde" value="${escapeHtml(estadoPendientes.desde)}"></div>
        </div>
      </div>
      <table>
        <thead><tr><th>Boleta</th><th>Área</th><th>Producto</th><th>Color</th><th>Talla</th><th class="r">Salió</th><th class="r">Devuelto</th><th class="r">Falta</th><th class="r">Días</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      <p class="note">${estadoPendientes.filas.length} línea${estadoPendientes.filas.length === 1 ? '' : 's'} abiertas · <span class="falta">${totalFalta} prendas sin devolver</span></p>
    </div>
    <div class="card">
      <h3>Saldo por área <em>Cuánto debe cada área en total, sin mirar boletas</em></h3>
      <table>
        <thead><tr><th>Área</th><th class="r">Boletas abiertas</th><th class="r">Prendas debiendo</th><th class="r">Más antigua</th></tr></thead>
        <tbody>${filasSaldo}</tbody>
      </table>
    </div>`;
}

const pendientesEl = document.getElementById('pendientes');

pendientesEl.addEventListener('change', async (e) => {
  if (e.target.id === 'pd-area' || e.target.id === 'pd-encargado' || e.target.id === 'pd-desde') {
    estadoPendientes.areaId = document.getElementById('pd-area').value;
    estadoPendientes.encargadoId = document.getElementById('pd-encargado').value;
    estadoPendientes.desde = document.getElementById('pd-desde').value;
    await refrescarPendientes();
  }
});

pendientesEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn || btn.getAttribute('data-accion') !== 'exportar-excel') return;

  estadoPendientes.exportando = true;
  estadoPendientes.mensaje = null;
  pintarPendientes();
  try {
    const resultado = await window.api.pendientes.exportarExcel(filtrosPendientesActuales());
    estadoPendientes.mensaje = resultado.cancelado
      ? null
      : { tipo: 'ok', texto: `Archivo guardado en ${resultado.ruta}` };
  } catch (err) {
    estadoPendientes.mensaje = { tipo: 'error', texto: mensajeError(err) };
  }
  estadoPendientes.exportando = false;
  pintarPendientes();
});

// ---------------------------------------------------------------------------
// AJUSTES
// ---------------------------------------------------------------------------

const estadoAjustes = {
  infoRespaldo: null,
  mensaje: null,
  cargandoRespaldo: false,
  archivoRestaurar: null,
  integridad: null,
  recalculando: false,
};

function nombreArchivo(ruta) {
  return String(ruta ?? '').split(/[\\/]/).pop();
}

async function abrirAjustes() {
  estadoAjustes.mensaje = null;
  estadoAjustes.archivoRestaurar = null;
  estadoAjustes.integridad = null;
  try {
    estadoAjustes.infoRespaldo = await window.api.respaldo.info();
  } catch (err) {
    estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
  }
  pintarAjustes();
}

async function verificarIntegridadUI() {
  estadoAjustes.mensaje = null;
  pintarAjustes();
  try {
    estadoAjustes.integridad = await window.api.integridad.verificar();
  } catch (err) {
    estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
  }
  pintarAjustes();
}

function filaDescuadre(d) {
  return `
    <tr>
      <td class="num">${escapeHtml(d.numero)}</td>
      <td>${escapeHtml(d.modelo)}</td>
      <td>${escapeHtml(d.color)}</td>
      <td>${escapeHtml(d.talla)}</td>
      <td class="r num">${d.cantidadDevuelta}</td>
      <td class="r num">${d.sumaAsignaciones}</td>
      <td class="r num falta">${d.diferencia}</td>
    </tr>`;
}

function pintarAjustes() {
  const sec = document.getElementById('ajustes');
  const info = estadoAjustes.infoRespaldo;
  const ultimoTxt = info && info.ultimo ? formatoFechaHora(info.ultimo.creadoEn) : 'todavía no hay respaldos';
  const totalTxt = info ? `${info.total}/${info.maximo}` : '—';
  const maximo = info ? info.maximo : 30;

  const msg = estadoAjustes.mensaje
    ? `<div class="${estadoAjustes.mensaje.tipo}">${escapeHtml(estadoAjustes.mensaje.texto)}</div>` : '';

  const confirmarRestaurar = estadoAjustes.archivoRestaurar ? `
    <div class="aviso" style="margin:0 18px 16px">
      <b>¿Restaurar desde "${escapeHtml(nombreArchivo(estadoAjustes.archivoRestaurar))}"?</b><br>
      Esto reemplazará TODOS los datos actuales por los del archivo elegido. Se crea un respaldo de
      seguridad del estado actual antes de reemplazar, y la aplicación se reiniciará sola.
      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="btn ghost sm" data-accion="cancelar-restaurar">Cancelar</button>
        <button class="btn warn sm" data-accion="confirmar-restaurar">Sí, reemplazar todos los datos</button>
      </div>
    </div>` : '';

  let integridadHtml = '';
  if (estadoAjustes.integridad) {
    if (estadoAjustes.integridad.descuadres.length === 0) {
      integridadHtml = `<div class="ok" style="margin-top:14px">Todo cuadra. Se revisaron ${estadoAjustes.integridad.revisadas} línea(s).</div>`;
    } else {
      const filas = estadoAjustes.integridad.descuadres.map(filaDescuadre).join('');
      integridadHtml = `
        <div class="error" style="margin-top:14px">
          Se encontraron ${estadoAjustes.integridad.descuadres.length} descuadre(s) de ${estadoAjustes.integridad.revisadas} línea(s) revisadas.
        </div>
        <table>
          <thead><tr><th>Boleta</th><th>Producto</th><th>Color</th><th>Talla</th><th class="r">Devuelto registrado</th><th class="r">Suma real</th><th class="r">Diferencia</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="pad">
          <button class="btn warn" data-accion="recalcular-integridad" ${estadoAjustes.recalculando ? 'disabled' : ''}>${estadoAjustes.recalculando ? 'Recalculando…' : 'Recalcular automáticamente'}</button>
        </div>`;
    }
  }

  sec.innerHTML = `
    <div class="head"><div><h2>Ajustes</h2><p>Datos y respaldo. Todo vive en esta computadora.</p></div></div>
    ${msg}
    <div class="card">
      <h3>Respaldo</h3>
      <div class="pad">
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px">Último respaldo: <b class="num" style="color:var(--text)">${ultimoTxt}</b> · ${totalTxt} guardados · se conservan los últimos ${maximo}.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" data-accion="crear-respaldo" ${estadoAjustes.cargandoRespaldo ? 'disabled' : ''}>${estadoAjustes.cargandoRespaldo ? 'Creando…' : 'Crear respaldo ahora'}</button>
          <button class="btn ghost" data-accion="abrir-carpeta">Abrir carpeta de datos</button>
          <button class="btn ghost" data-accion="elegir-restaurar">Restaurar desde archivo</button>
        </div>
      </div>
      ${confirmarRestaurar}
      <p class="note">Recomendación: una vez al mes copia la carpeta de respaldos a una USB o a Drive.</p>
    </div>
    <div class="card">
      <h3>Integridad</h3>
      <div class="pad">
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px">Verifica que lo devuelto acumulado (cantidad_devuelta) cuadre con la suma real de asignaciones de cada línea.</p>
        <button class="btn ghost" data-accion="verificar-integridad">Verificar ahora</button>
        ${integridadHtml}
      </div>
    </div>`;
}

const ajustesEl = document.getElementById('ajustes');

ajustesEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'crear-respaldo') {
    estadoAjustes.cargandoRespaldo = true;
    estadoAjustes.mensaje = null;
    pintarAjustes();
    try {
      const ruta = await window.api.respaldo.crearAhora();
      estadoAjustes.infoRespaldo = await window.api.respaldo.info();
      estadoAjustes.mensaje = { tipo: 'ok', texto: `Respaldo creado: ${nombreArchivo(ruta)}` };
    } catch (err) {
      estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
    }
    estadoAjustes.cargandoRespaldo = false;
    pintarAjustes();
    return;
  }

  if (accion === 'abrir-carpeta') {
    try {
      await window.api.respaldo.abrirCarpeta();
    } catch (err) {
      estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarAjustes();
    }
    return;
  }

  if (accion === 'elegir-restaurar') {
    try {
      const resultado = await window.api.respaldo.elegirArchivoRestaurar();
      if (!resultado.cancelado) {
        estadoAjustes.archivoRestaurar = resultado.ruta;
        estadoAjustes.mensaje = null;
      }
      pintarAjustes();
    } catch (err) {
      estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
      pintarAjustes();
    }
    return;
  }

  if (accion === 'cancelar-restaurar') {
    estadoAjustes.archivoRestaurar = null;
    pintarAjustes();
    return;
  }

  if (accion === 'confirmar-restaurar') {
    try {
      await window.api.respaldo.restaurar(estadoAjustes.archivoRestaurar);
    } catch (err) {
      estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
      estadoAjustes.archivoRestaurar = null;
      pintarAjustes();
    }
    return;
  }

  if (accion === 'verificar-integridad') {
    await verificarIntegridadUI();
    return;
  }

  if (accion === 'recalcular-integridad') {
    estadoAjustes.recalculando = true;
    pintarAjustes();
    try {
      const resultado = await window.api.integridad.recalcular();
      estadoAjustes.mensaje = { tipo: 'ok', texto: `Se corrigieron ${resultado.corregidas} línea(s) en ${resultado.boletasRecalculadas} boleta(s).` };
      estadoAjustes.integridad = await window.api.integridad.verificar();
    } catch (err) {
      estadoAjustes.mensaje = { tipo: 'error', texto: mensajeError(err) };
    }
    estadoAjustes.recalculando = false;
    pintarAjustes();
  }
});

// ---------------------------------------------------------------------------
// MAESTROS
// ---------------------------------------------------------------------------

const estado = {
  productos: [],
  productosPagina: 1,
  productosPorPagina: 10,
  productosBusqueda: '',
  productosTotal: 0,
  productosTotalPaginas: 1,
  cargandoProductos: false,
  areas: [],
  encargados: [],
  mostrarAreasInactivas: false,
  mostrarEncargadosInactivos: false,
  filtroAreaEncargados: '',
  edicion: { producto: null, area: null, encargado: null },
  mensaje: { productos: null, areas: null, encargados: null },
  importandoProductos: false,
  resumenImportacion: null,
};

// No usamos toLocaleString('es-PE'): el ICU reducido que trae Electron por
// defecto no incluye datos de esa locale y cae en el separador inglés (coma).
// Formateamos a mano para garantizar el punto de miles ("27.439").
function formatoMiles(n) {
  return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Paginado en servidor: solo se traen y pintan las ~50 filas de la página
// actual, nunca el catálogo completo (que puede rondar los 27.000 productos).
async function cargarProductosPagina() {
  estado.cargandoProductos = true;
  pintarMaestros();
  try {
    const resultado = await window.api.productos.listarPagina({
      pagina: estado.productosPagina,
      porPagina: estado.productosPorPagina,
      busqueda: estado.productosBusqueda,
      incluirInactivos: true,
    });
    estado.productos = resultado.productos;
    estado.productosTotal = resultado.total;
    estado.productosTotalPaginas = resultado.totalPaginas;
    estado.productosPagina = resultado.pagina;
  } catch (err) {
    setMensaje('productos', 'error', mensajeError(err));
  }
  estado.cargandoProductos = false;
  pintarMaestros();
}

async function refrescarAreasEncargados() {
  try {
    const [areas, encargados] = await Promise.all([
      window.api.areas.listar({ incluirInactivos: true }),
      window.api.encargados.listar({ incluirInactivos: true }),
    ]);
    estado.areas = areas;
    estado.encargados = encargados;
  } catch (err) {
    setMensaje('areas', 'error', mensajeError(err));
  }
  pintarMaestros();
}

async function refrescarMaestros() {
  estado.cargandoProductos = true;
  pintarMaestros();
  try {
    const [areas, encargados] = await Promise.all([
      window.api.areas.listar({ incluirInactivos: true }),
      window.api.encargados.listar({ incluirInactivos: true }),
    ]);
    estado.areas = areas;
    estado.encargados = encargados;
  } catch (err) {
    document.getElementById('maestros').innerHTML =
      `<div class="head"><div><h2>Maestros</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
    return;
  }
  await cargarProductosPagina();
}

function tagEstado(activo) {
  return activo
    ? '<span class="tag t-comp">Activo</span>'
    : '<span class="tag t-inactivo">Inactivo</span>';
}

// ---- Productos --------------------------------------------------------

function filaProducto(p) {
  if (estado.edicion.producto === p.id) {
    return `
      <tr>
        <td><input data-mayus value="${escapeHtml(p.modelo)}" id="ep-modelo"></td>
        <td><input data-mayus value="${escapeHtml(p.color)}" id="ep-color"></td>
        <td><input data-mayus value="${escapeHtml(p.talla)}" id="ep-talla"></td>
        <td class="sku num" colspan="1">${escapeHtml(p.sku)}</td>
        <td class="r">
          <button class="btn sm" data-accion="guardar-producto" data-id="${p.id}">Guardar</button>
          <button class="btn ghost sm" data-accion="cancelar-producto">Cancelar</button>
        </td>
      </tr>`;
  }
  return `
    <tr>
      <td>${escapeHtml(p.modelo)}</td>
      <td>${escapeHtml(p.color)}</td>
      <td>${escapeHtml(p.talla)}</td>
      <td class="sku num">${escapeHtml(p.sku)}</td>
      <td class="r"><button class="btn ghost sm" data-accion="editar-producto" data-id="${p.id}">Editar</button></td>
    </tr>`;
}

function filaVacioImportacion(v) {
  return `
    <tr>
      <td class="num">${v.fila}</td>
      <td>${escapeHtml(v.modelo)}</td>
      <td>${escapeHtml(v.color)}</td>
      <td>${escapeHtml(v.talla)}</td>
    </tr>`;
}

function bloqueResumenImportacion() {
  const r = estado.resumenImportacion;
  if (!r) return '';
  const detalleVacios = r.vacios.length
    ? `
      <div class="pad" style="border-top:1px solid var(--line)">
        <p style="color:var(--muted);font-size:12.5px;margin-bottom:10px">Filas con MODELO, COLOR o TALLA vacío — revísalas y agrégalas manualmente si corresponde:</p>
        <table>
          <thead><tr><th>Fila</th><th>Modelo</th><th>Color</th><th>Talla</th></tr></thead>
          <tbody>${r.vacios.map(filaVacioImportacion).join('')}</tbody>
        </table>
      </div>`
    : '';
  return `
    <div class="ok" style="margin:0 18px 0">
      Importación completa: <b>${r.importados}</b> nuevo(s) · <b>${r.existentes}</b> ya existían (omitidos) · <b>${r.vacios.length}</b> fila(s) incompleta(s).
    </div>
    ${detalleVacios}`;
}

function cardProductos() {
  const filas = estado.cargandoProductos
    ? `<tr><td colspan="5" class="vacio">Cargando…</td></tr>`
    : estado.productos.length
      ? estado.productos.map(filaProducto).join('')
      : `<tr><td colspan="5" class="vacio">Sin productos para estos filtros.</td></tr>`;

  const msg = estado.mensaje.productos
    ? `<div class="${estado.mensaje.productos.tipo}">${escapeHtml(estado.mensaje.productos.texto)}</div>` : '';

  const totalTxt = `${formatoMiles(estado.productosTotal)} producto${estado.productosTotal === 1 ? '' : 's'}`;
  const puedeAnterior = !estado.cargandoProductos && estado.productosPagina > 1;
  const puedeSiguiente = !estado.cargandoProductos && estado.productosPagina < estado.productosTotalPaginas;

  return `
    <div class="card">
      <h3>Productos
        <span style="display:flex;align-items:center;gap:14px">
          <em>Cada combinación modelo + color + talla es un producto distinto · ${totalTxt}</em>
          <button class="btn ghost sm" data-accion="importar-productos" ${estado.importandoProductos ? 'disabled' : ''}>${estado.importandoProductos ? 'Importando…' : 'Importar desde Excel'}</button>
        </span>
      </h3>
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div><label>Buscar</label><input id="mp-buscar" autocomplete="off" placeholder="Buscar por modelo, color o talla…" value="${escapeHtml(estado.productosBusqueda)}"></div>
      </div>
      <table>
        <thead><tr><th>Modelo</th><th>Color</th><th>Talla</th><th>SKU</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      ${bloqueResumenImportacion()}
      <div class="foot">
        <span class="resumen">
          Mostrar
          <select id="mp-porpagina" style="width:auto;display:inline-block;padding:4px 8px">${[10, 25, 50].map((n) => `<option value="${n}" ${n === estado.productosPorPagina ? 'selected' : ''}>${n}</option>`).join('')}</select>
          · Página ${estado.productosPagina} de ${estado.productosTotalPaginas}
        </span>
        <div style="display:flex;gap:10px">
          <button class="btn ghost sm" data-accion="mp-anterior" ${puedeAnterior ? '' : 'disabled'}>Anterior</button>
          <button class="btn ghost sm" data-accion="mp-siguiente" ${puedeSiguiente ? '' : 'disabled'}>Siguiente</button>
        </div>
      </div>
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div><label>Modelo</label><input data-mayus placeholder="VESTIDO SFIDA" id="np-modelo"></div>
          <div><label>Color</label><input data-mayus placeholder="NEGRO" id="np-color"></div>
          <div><label>Talla</label><input data-mayus placeholder="M" id="np-talla"></div>
        </div>
        <div style="margin-top:12px">
          <button class="btn ghost" data-accion="crear-producto">Agregar producto</button>
        </div>
      </div>
    </div>`;
}

// ---- Áreas --------------------------------------------------------------

function filaArea(a) {
  const boletasTxt = a.boletas_abiertas > 0
    ? `<span class="falta num">${a.boletas_abiertas}</span>` : `<span class="cero num">0</span>`;

  if (estado.edicion.area === a.id) {
    return `
      <tr>
        <td><input data-mayus value="${escapeHtml(a.nombre)}" id="ea-nombre"></td>
        <td class="r">${boletasTxt}</td>
        <td>${tagEstado(a.activo)}</td>
        <td class="r">
          <button class="btn sm" data-accion="guardar-area" data-id="${a.id}">Guardar</button>
          <button class="btn ghost sm" data-accion="cancelar-area">Cancelar</button>
        </td>
      </tr>`;
  }

  const botonEstado = a.activo
    ? `<button class="btn ghost sm" data-accion="desactivar-area" data-id="${a.id}">Desactivar</button>`
    : `<button class="btn ghost sm" data-accion="reactivar-area" data-id="${a.id}">Reactivar</button>`;

  return `
    <tr>
      <td>${escapeHtml(a.nombre)}</td>
      <td class="r">${boletasTxt}</td>
      <td>${tagEstado(a.activo)}</td>
      <td class="r">
        <button class="btn ghost sm" data-accion="editar-area" data-id="${a.id}">Editar</button>
        ${botonEstado}
      </td>
    </tr>`;
}

function cardAreas() {
  const visibles = estado.mostrarAreasInactivas ? estado.areas : estado.areas.filter((a) => a.activo);
  const filas = visibles.length
    ? visibles.map(filaArea).join('')
    : `<tr><td colspan="4" class="vacio">Sin áreas para mostrar.</td></tr>`;

  const msg = estado.mensaje.areas
    ? `<div class="${estado.mensaje.areas.tipo}">${escapeHtml(estado.mensaje.areas.texto)}</div>` : '';

  return `
    <div class="card">
      <h3>Áreas
        <label class="switch-row"><input type="checkbox" id="chk-areas-inactivas" ${estado.mostrarAreasInactivas ? 'checked' : ''}> Mostrar inactivas</label>
      </h3>
      <table>
        <thead><tr><th>Área</th><th class="r">Boletas abiertas</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid2" style="align-items:end">
          <div><label>Nombre del área</label><input data-mayus placeholder="EMPAQUE" id="na-nombre"></div>
          <div><button class="btn ghost" style="width:100%" data-accion="crear-area">Agregar área</button></div>
        </div>
      </div>
    </div>`;
}

// ---- Encargados -----------------------------------------------------------

function filaEncargado(e) {
  const boletasTxt = e.boletas_abiertas > 0
    ? `<span class="falta num">${e.boletas_abiertas}</span>` : `<span class="cero num">0</span>`;

  if (estado.edicion.encargado === e.id) {
    return `
      <tr>
        <td>${escapeHtml(e.area_nombre)}</td>
        <td><input data-mayus value="${escapeHtml(e.nombre)}" id="ee-nombre"></td>
        <td class="r">${boletasTxt}</td>
        <td>${tagEstado(e.activo)}</td>
        <td class="r">
          <button class="btn sm" data-accion="guardar-encargado" data-id="${e.id}">Guardar</button>
          <button class="btn ghost sm" data-accion="cancelar-encargado">Cancelar</button>
        </td>
      </tr>`;
  }

  const botonEstado = e.activo
    ? `<button class="btn ghost sm" data-accion="desactivar-encargado" data-id="${e.id}">Desactivar</button>`
    : `<button class="btn ghost sm" data-accion="reactivar-encargado" data-id="${e.id}">Reactivar</button>`;

  return `
    <tr>
      <td>${escapeHtml(e.area_nombre)}</td>
      <td>${escapeHtml(e.nombre)}</td>
      <td class="r">${boletasTxt}</td>
      <td>${tagEstado(e.activo)}</td>
      <td class="r">
        <button class="btn ghost sm" data-accion="editar-encargado" data-id="${e.id}">Editar</button>
        ${botonEstado}
      </td>
    </tr>`;
}

function opcionesAreasActivas(seleccionId) {
  return estado.areas
    .filter((a) => a.activo)
    .map((a) => `<option value="${a.id}" ${String(a.id) === String(seleccionId) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`)
    .join('');
}

function cardEncargados() {
  let visibles = estado.mostrarEncargadosInactivos ? estado.encargados : estado.encargados.filter((e) => e.activo);
  if (estado.filtroAreaEncargados) {
    visibles = visibles.filter((e) => String(e.area_id) === String(estado.filtroAreaEncargados));
  }
  const filas = visibles.length
    ? visibles.map(filaEncargado).join('')
    : `<tr><td colspan="5" class="vacio">Sin encargados para mostrar.</td></tr>`;

  const msg = estado.mensaje.encargados
    ? `<div class="${estado.mensaje.encargados.tipo}">${escapeHtml(estado.mensaje.encargados.texto)}</div>` : '';

  const opcionesFiltro = estado.areas
    .map((a) => `<option value="${a.id}" ${String(a.id) === String(estado.filtroAreaEncargados) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`)
    .join('');

  return `
    <div class="card">
      <h3>Encargados
        <label class="switch-row"><input type="checkbox" id="chk-encargados-inactivos" ${estado.mostrarEncargadosInactivos ? 'checked' : ''}> Mostrar inactivos</label>
      </h3>
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="grid3">
          <div><label>Filtrar por área</label><select id="filtro-area-encargados"><option value="">Todas</option>${opcionesFiltro}</select></div>
        </div>
      </div>
      <table>
        <thead><tr><th>Área</th><th>Encargado</th><th class="r">Boletas abiertas</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div><label>Área</label><select id="ne-area">${opcionesAreasActivas()}</select></div>
          <div><label>Nombre del encargado</label><input data-mayus placeholder="ROSA QUISPE" id="ne-nombre"></div>
          <div><button class="btn ghost" style="width:100%" data-accion="crear-encargado">Agregar encargado</button></div>
        </div>
      </div>
    </div>`;
}

// ---- Pintado y eventos ------------------------------------------------

function pintarMaestros() {
  const sec = document.getElementById('maestros');
  sec.innerHTML = `
    <div class="head">
      <div><h2>Maestros</h2><p>Catálogo base. Cada combinación modelo + color + talla es un producto distinto.</p></div>
    </div>
    ${cardProductos()}
    ${cardAreas()}
    ${cardEncargados()}
  `;
  vincularMayusculasEn(sec);
}

function setMensaje(seccion, tipo, texto) {
  estado.mensaje[seccion] = { tipo, texto };
}

function limpiarMensajes() {
  estado.mensaje.productos = null;
  estado.mensaje.areas = null;
  estado.mensaje.encargados = null;
  estado.resumenImportacion = null;
}

const maestrosEl = document.getElementById('maestros');

maestrosEl.addEventListener('change', (e) => {
  if (e.target.id === 'chk-areas-inactivas') {
    estado.mostrarAreasInactivas = e.target.checked;
    pintarMaestros();
  } else if (e.target.id === 'chk-encargados-inactivos') {
    estado.mostrarEncargadosInactivos = e.target.checked;
    pintarMaestros();
  } else if (e.target.id === 'filtro-area-encargados') {
    estado.filtroAreaEncargados = e.target.value;
    pintarMaestros();
  } else if (e.target.id === 'mp-porpagina') {
    estado.productosPorPagina = Number(e.target.value);
    estado.productosPagina = 1;
    cargarProductosPagina();
  }
});

let temporizadorBusquedaProductos = null;

maestrosEl.addEventListener('input', (e) => {
  if (e.target.id !== 'mp-buscar') return;
  estado.productosBusqueda = e.target.value;
  clearTimeout(temporizadorBusquedaProductos);
  temporizadorBusquedaProductos = setTimeout(async () => {
    estado.productosPagina = 1;
    await cargarProductosPagina();
    const input = document.getElementById('mp-buscar');
    if (input) {
      input.focus();
      const pos = input.value.length;
      input.setSelectionRange(pos, pos);
    }
  }, 350);
});

maestrosEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');
  const id = btn.getAttribute('data-id');

  try {
    switch (accion) {
      // Productos
      case 'crear-producto': {
        const modelo = document.getElementById('np-modelo').value;
        const color = document.getElementById('np-color').value;
        const talla = document.getElementById('np-talla').value;
        await window.api.productos.crear({ modelo, talla, color });
        limpiarMensajes();
        await cargarProductosPagina();
        return;
      }
      case 'editar-producto':
        limpiarMensajes();
        estado.edicion.producto = Number(id);
        pintarMaestros();
        return;
      case 'cancelar-producto':
        estado.edicion.producto = null;
        pintarMaestros();
        return;
      case 'guardar-producto': {
        const modelo = document.getElementById('ep-modelo').value;
        const color = document.getElementById('ep-color').value;
        const talla = document.getElementById('ep-talla').value;
        await window.api.productos.editar(Number(id), { modelo, talla, color });
        estado.edicion.producto = null;
        limpiarMensajes();
        await cargarProductosPagina();
        return;
      }
      case 'importar-productos': {
        estado.importandoProductos = true;
        limpiarMensajes();
        pintarMaestros();
        try {
          const resultado = await window.api.productos.importarExcel();
          estado.importandoProductos = false;
          if (resultado.cancelado) {
            pintarMaestros();
            return;
          }
          estado.resumenImportacion = resultado;
          estado.productosPagina = 1;
          await cargarProductosPagina();
        } catch (err) {
          estado.importandoProductos = false;
          setMensaje('productos', 'error', mensajeError(err));
          pintarMaestros();
        }
        return;
      }
      case 'mp-anterior':
        if (estado.productosPagina > 1) {
          estado.productosPagina -= 1;
          await cargarProductosPagina();
        }
        return;
      case 'mp-siguiente':
        if (estado.productosPagina < estado.productosTotalPaginas) {
          estado.productosPagina += 1;
          await cargarProductosPagina();
        }
        return;

      // Áreas
      case 'crear-area': {
        const nombre = document.getElementById('na-nombre').value;
        await window.api.areas.crear({ nombre });
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'editar-area':
        limpiarMensajes();
        estado.edicion.area = Number(id);
        pintarMaestros();
        return;
      case 'cancelar-area':
        estado.edicion.area = null;
        pintarMaestros();
        return;
      case 'guardar-area': {
        const nombre = document.getElementById('ea-nombre').value;
        await window.api.areas.editarNombre(Number(id), nombre);
        estado.edicion.area = null;
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'desactivar-area': {
        if (!window.confirm('¿Desactivar esta área? Podrás reactivarla luego.')) return;
        await window.api.areas.desactivar(Number(id));
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'reactivar-area': {
        await window.api.areas.reactivar(Number(id));
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }

      // Encargados
      case 'crear-encargado': {
        const areaId = Number(document.getElementById('ne-area').value);
        const nombre = document.getElementById('ne-nombre').value;
        await window.api.encargados.crear({ nombre, areaId });
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'editar-encargado':
        limpiarMensajes();
        estado.edicion.encargado = Number(id);
        pintarMaestros();
        return;
      case 'cancelar-encargado':
        estado.edicion.encargado = null;
        pintarMaestros();
        return;
      case 'guardar-encargado': {
        const nombre = document.getElementById('ee-nombre').value;
        await window.api.encargados.editarNombre(Number(id), nombre);
        estado.edicion.encargado = null;
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'desactivar-encargado': {
        if (!window.confirm('¿Desactivar a este encargado? Podrás reactivarlo luego.')) return;
        await window.api.encargados.desactivar(Number(id));
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      case 'reactivar-encargado': {
        await window.api.encargados.reactivar(Number(id));
        limpiarMensajes();
        await refrescarAreasEncargados();
        return;
      }
      default:
        return;
    }
  } catch (err) {
    const texto = mensajeError(err);
    if (accion.includes('producto')) setMensaje('productos', 'error', texto);
    else if (accion.includes('area')) setMensaje('areas', 'error', texto);
    else if (accion.includes('encargado')) setMensaje('encargados', 'error', texto);
    pintarMaestros();
  }
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

refrescarMaestros();
