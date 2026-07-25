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

function diasDesde(iso) {
  if (!iso) return 0;
  const inicio = new Date(`${iso}T00:00:00`);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - inicio.getTime()) / 86400000));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const PROXIMAMENTE = {
  devolver: { titulo: 'Registrar devolución', desc: 'El área devuelve prendas mezcladas de varias salidas.' },
  retornos: { titulo: 'Retornos', desc: 'Boletas que emiten las áreas al devolver.' },
  pendientes: { titulo: 'Pendientes', desc: 'Todo lo que salió del almacén y todavía no regresa.' },
  ajustes: { titulo: 'Ajustes', desc: 'Datos y respaldo. Todo vive en esta computadora.' },
};

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
      <button class="btn" data-go="nueva">Nueva salida</button>
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
  fecha: '',
  areaId: '',
  encargadoId: '',
  observacion: '',
  lineas: [],
  busqueda: '',
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
    estadoNueva.cantidadTmp = 1;

    if (editarId) {
      const detalle = await window.api.boletas.obtenerDetalle(editarId);
      if (detalle.boleta.anulada || detalle.tieneAsignaciones) {
        irA('detalle', { id: editarId });
        return;
      }
      estadoNueva.modoEdicion = true;
      estadoNueva.boletaId = editarId;
      estadoNueva.numero = detalle.boleta.numero;
      estadoNueva.fecha = detalle.boleta.fecha_salida;
      estadoNueva.areaId = String(detalle.boleta.area_id);
      estadoNueva.encargadoId = String(detalle.boleta.encargado_id);
      estadoNueva.observacion = detalle.boleta.observacion || '';
      estadoNueva.lineas = detalle.items.map((it) => ({
        productoId: it.producto_id,
        modelo: it.modelo,
        talla: it.talla,
        color: it.color,
        cantidad: it.cantidad_salida,
      }));
      await cargarEncargadosPorArea(estadoNueva.areaId);
    } else {
      estadoNueva.modoEdicion = false;
      estadoNueva.boletaId = null;
      estadoNueva.numero = '';
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
      `<div class="head"><div><h2>Nueva salida</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
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

function opcionesProductosDatalist() {
  return estadoNueva.productosDisponibles
    .map((p) => `<option data-id="${p.id}" value="${escapeHtml(`${p.modelo} · ${p.talla} · ${p.color}`)}"></option>`)
    .join('');
}

function filaLinea(l) {
  return `
    <tr>
      <td>${escapeHtml(l.modelo)}</td>
      <td>${escapeHtml(l.talla)}</td>
      <td>${escapeHtml(l.color)}</td>
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
  const titulo = estadoNueva.modoEdicion ? 'Editar salida' : 'Nueva salida';

  sec.innerHTML = `
    <div class="head"><div><h2>${titulo}</h2><p>Registra la boleta y las prendas que salen del almacén.</p></div></div>
    <div class="card">
      <h3>Datos de la boleta</h3>
      <div class="pad">
        <div class="grid2" style="margin-bottom:14px">
          <div><label>N° de boleta</label><input data-mayus id="ns-numero" value="${escapeHtml(estadoNueva.numero)}"></div>
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
    </div>
    <div class="card">
      <h3>Prendas</h3>
      <div class="pad" style="border-bottom:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div>
            <label>Buscar producto</label>
            <input list="ns-productos-lista" id="ns-buscar" placeholder="modelo, talla o color…" value="${escapeHtml(estadoNueva.busqueda)}">
            <datalist id="ns-productos-lista">${opcionesProductosDatalist()}</datalist>
          </div>
          <div><label>Cantidad</label><input class="qty" type="number" min="1" step="1" id="ns-cantidad" value="${escapeHtml(String(estadoNueva.cantidadTmp))}"></div>
          <div><button class="btn ghost" style="width:100%" data-accion="agregar-linea">Agregar</button></div>
        </div>
        ${msgLinea}
      </div>
      <table>
        <thead><tr><th>Modelo</th><th>Talla</th><th>Color</th><th class="r">Cantidad</th><th></th></tr></thead>
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

nuevaEl.addEventListener('change', async (e) => {
  if (e.target.id === 'ns-area') {
    capturarCamposNueva();
    estadoNueva.areaId = e.target.value;
    estadoNueva.encargadoId = '';
    await cargarEncargadosPorArea(estadoNueva.areaId);
    pintarNueva();
  }
});

nuevaEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'agregar-linea') {
    capturarCamposNueva();
    const texto = estadoNueva.busqueda.trim();
    const cantidad = Number(estadoNueva.cantidadTmp);
    const producto = estadoNueva.productosDisponibles.find(
      (p) => `${p.modelo} · ${p.talla} · ${p.color}` === texto
    );
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
        productoId: producto.id, modelo: producto.modelo, talla: producto.talla, color: producto.color, cantidad,
      });
    }
    estadoNueva.busqueda = '';
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
      const payload = {
        numero: estadoNueva.numero,
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
      <td>${escapeHtml(it.talla)}</td>
      <td>${escapeHtml(it.color)}</td>
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
    <button class="btn" data-go="devolver">Registrar devolución</button>`;

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
    ? `<ul class="time">${retornos.map((r) => `
        <li><b>${escapeHtml(r.numero)} · ${formatoFechaLarga(r.fecha)}</b>
        <p>Trajo ${r.total_retorno} prendas en total, de las cuales <b>${r.aplicado_aqui}</b> se aplicaron aquí.</p></li>`).join('')}</ul>`
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
        <thead><tr><th>Producto</th><th>Talla</th><th>Color</th><th class="r">Salió</th><th class="r">Devuelto</th><th class="r">Falta</th><th>Avance</th></tr></thead>
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
// MAESTROS
// ---------------------------------------------------------------------------

const estado = {
  productos: [],
  areas: [],
  encargados: [],
  mostrarAreasInactivas: false,
  mostrarEncargadosInactivos: false,
  filtroAreaEncargados: '',
  edicion: { producto: null, area: null, encargado: null },
  mensaje: { productos: null, areas: null, encargados: null },
};

async function refrescarMaestros() {
  try {
    const [productos, areas, encargados] = await Promise.all([
      window.api.productos.listar({ incluirInactivos: true }),
      window.api.areas.listar({ incluirInactivos: true }),
      window.api.encargados.listar({ incluirInactivos: true }),
    ]);
    estado.productos = productos;
    estado.areas = areas;
    estado.encargados = encargados;
    pintarMaestros();
  } catch (err) {
    document.getElementById('maestros').innerHTML =
      `<div class="head"><div><h2>Maestros</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
  }
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
        <td><input data-mayus value="${escapeHtml(p.talla)}" id="ep-talla"></td>
        <td><input data-mayus value="${escapeHtml(p.color)}" id="ep-color"></td>
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
      <td>${escapeHtml(p.talla)}</td>
      <td>${escapeHtml(p.color)}</td>
      <td class="sku num">${escapeHtml(p.sku)}</td>
      <td class="r"><button class="btn ghost sm" data-accion="editar-producto" data-id="${p.id}">Editar</button></td>
    </tr>`;
}

function cardProductos() {
  const filas = estado.productos.length
    ? estado.productos.map(filaProducto).join('')
    : `<tr><td colspan="5" class="vacio">Sin productos registrados todavía.</td></tr>`;

  const msg = estado.mensaje.productos
    ? `<div class="${estado.mensaje.productos.tipo}">${escapeHtml(estado.mensaje.productos.texto)}</div>` : '';

  return `
    <div class="card">
      <h3>Productos <em>Cada combinación modelo + talla + color es un producto distinto</em></h3>
      <table>
        <thead><tr><th>Modelo</th><th>Talla</th><th>Color</th><th>SKU</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${msg}
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div><label>Modelo</label><input data-mayus placeholder="VESTIDO SFIDA" id="np-modelo"></div>
          <div><label>Talla</label><input data-mayus placeholder="M" id="np-talla"></div>
          <div><label>Color</label><input data-mayus placeholder="NEGRO" id="np-color"></div>
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
      <div><h2>Maestros</h2><p>Catálogo base. Cada combinación modelo + talla + color es un producto distinto.</p></div>
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
  }
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
        const talla = document.getElementById('np-talla').value;
        const color = document.getElementById('np-color').value;
        await window.api.productos.crear({ modelo, talla, color });
        limpiarMensajes();
        await refrescarMaestros();
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
        const talla = document.getElementById('ep-talla').value;
        const color = document.getElementById('ep-color').value;
        await window.api.productos.editar(Number(id), { modelo, talla, color });
        estado.edicion.producto = null;
        limpiarMensajes();
        await refrescarMaestros();
        return;
      }

      // Áreas
      case 'crear-area': {
        const nombre = document.getElementById('na-nombre').value;
        await window.api.areas.crear({ nombre });
        limpiarMensajes();
        await refrescarMaestros();
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
        await refrescarMaestros();
        return;
      }
      case 'desactivar-area': {
        if (!window.confirm('¿Desactivar esta área? Podrás reactivarla luego.')) return;
        await window.api.areas.desactivar(Number(id));
        limpiarMensajes();
        await refrescarMaestros();
        return;
      }
      case 'reactivar-area': {
        await window.api.areas.reactivar(Number(id));
        limpiarMensajes();
        await refrescarMaestros();
        return;
      }

      // Encargados
      case 'crear-encargado': {
        const areaId = Number(document.getElementById('ne-area').value);
        const nombre = document.getElementById('ne-nombre').value;
        await window.api.encargados.crear({ nombre, areaId });
        limpiarMensajes();
        await refrescarMaestros();
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
        await refrescarMaestros();
        return;
      }
      case 'desactivar-encargado': {
        if (!window.confirm('¿Desactivar a este encargado? Podrás reactivarlo luego.')) return;
        await window.api.encargados.desactivar(Number(id));
        limpiarMensajes();
        await refrescarMaestros();
        return;
      }
      case 'reactivar-encargado': {
        await window.api.encargados.reactivar(Number(id));
        limpiarMensajes();
        await refrescarMaestros();
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
