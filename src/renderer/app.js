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
    ? `<ul class="time">${retornos.map((r) => {
        const detalle = r.detalle.map((d) => `${escapeHtml(d.modelo)} ${escapeHtml(d.talla)} ${escapeHtml(d.color)} (${d.cantidad})`).join(', ');
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
  itemsLlegada: [], // [{productoId, modelo, talla, color, cantidad}]
  manual: {}, // { [productoId]: { [boletaItemId]: cantidadCorregida } }
  busqueda: '',
  cantidadTmp: 1,
  preview: null,
  mensaje: null,
  mensajeLinea: null,
};

async function abrirDevolucion() {
  try {
    const [areas, productos] = await Promise.all([
      window.api.areas.listar(),
      window.api.productos.listar(),
    ]);
    estadoDevolucion.areas = areas;
    estadoDevolucion.productosDisponibles = productos;
    estadoDevolucion.numero = '';
    estadoDevolucion.fecha = fechaHoyISO();
    estadoDevolucion.areaId = '';
    estadoDevolucion.encargadoId = '';
    estadoDevolucion.observacion = '';
    estadoDevolucion.encargados = [];
    estadoDevolucion.itemsLlegada = [];
    estadoDevolucion.manual = {};
    estadoDevolucion.busqueda = '';
    estadoDevolucion.cantidadTmp = 1;
    estadoDevolucion.preview = null;
    estadoDevolucion.mensaje = null;
    estadoDevolucion.mensajeLinea = null;
    pintarDevolucion();
  } catch (err) {
    document.getElementById('devolver').innerHTML =
      `<div class="head"><div><h2>Registrar devolución</h2></div></div><div class="error">${escapeHtml(mensajeError(err))}</div>`;
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

function opcionesProductosDatalistDevolucion() {
  return estadoDevolucion.productosDisponibles
    .map((p) => `<option data-id="${p.id}" value="${escapeHtml(`${p.modelo} · ${p.talla} · ${p.color}`)}"></option>`)
    .join('');
}

function filaLlegada(it) {
  const pendienteArea = pendienteAreaParaProducto(it.productoId);
  const pendienteTxt = pendienteArea === null ? '…' : pendienteArea;
  return `
    <tr>
      <td>${escapeHtml(it.modelo)}</td>
      <td>${escapeHtml(it.talla)}</td>
      <td>${escapeHtml(it.color)}</td>
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
            <div class="prod-h"><b>${escapeHtml(p.modelo)} · ${escapeHtml(p.talla)} · ${escapeHtml(p.color)}</b><span class="num">llegan ${p.cantidadLlega}</span></div>
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

  sec.innerHTML = `
    <div class="head">
      <div><h2>Registrar devolución</h2><p>El área devuelve prendas mezcladas de varias salidas. Indica solo cuánto llega; el sistema lo reparte contra las boletas más antiguas y tú corriges si hace falta.</p></div>
    </div>
    <div class="card">
      <h3>Boleta de retorno</h3>
      <div class="pad">
        <div class="grid4">
          <div><label>N° de retorno</label><input data-mayus id="dv-numero" value="${escapeHtml(estadoDevolucion.numero)}"></div>
          <div><label>Área</label><select id="dv-area"><option value="">Selecciona…</option>${opcionesArea}</select></div>
          <div><label>Fecha</label><input type="date" id="dv-fecha" value="${escapeHtml(estadoDevolucion.fecha)}"></div>
          <div><label>Entrega</label>
            <select id="dv-encargado" ${estadoDevolucion.encargados.length ? '' : 'disabled'}>
              <option value="">${hayArea ? 'Selecciona…' : 'Elige un área primero'}</option>${opcionesEncargado}
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>¿Qué llegó? <em>Cantidad total, sin importar de qué boleta salió</em></h3>
      <table>
        <thead><tr><th>Producto</th><th>Talla</th><th>Color</th><th class="r">Pendiente del área</th><th class="r">Llega ahora</th><th></th></tr></thead>
        <tbody>${filasLlegada}</tbody>
      </table>
      <div class="pad" style="border-top:1px solid var(--line)">
        <div class="grid3" style="align-items:end">
          <div>
            <label>Agregar otro producto</label>
            <input list="dv-productos-lista" id="dv-buscar" placeholder="modelo, talla o color…" value="${escapeHtml(estadoDevolucion.busqueda)}" ${hayArea ? '' : 'disabled'}>
            <datalist id="dv-productos-lista">${opcionesProductosDatalistDevolucion()}</datalist>
          </div>
          <div><label>Cantidad</label><input class="qty" type="number" min="1" step="1" id="dv-cantidad" value="${escapeHtml(String(estadoDevolucion.cantidadTmp))}" ${hayArea ? '' : 'disabled'}></div>
          <div><button class="btn ghost" style="width:100%" data-accion="agregar-llegada" ${hayArea ? '' : 'disabled'}>Agregar a la devolución</button></div>
        </div>
        ${msgLinea}
      </div>
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
    estadoDevolucion.encargadoId = '';
    estadoDevolucion.itemsLlegada = [];
    estadoDevolucion.manual = {};
    estadoDevolucion.preview = null;
    estadoDevolucion.encargados = estadoDevolucion.areaId
      ? await window.api.encargados.listar({ areaId: Number(estadoDevolucion.areaId) })
      : [];
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

devolverEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.getAttribute('data-accion');

  if (accion === 'agregar-llegada') {
    capturarCamposDevolucion();
    const texto = estadoDevolucion.busqueda.trim();
    const cantidad = Number(estadoDevolucion.cantidadTmp);
    const producto = estadoDevolucion.productosDisponibles.find(
      (p) => `${p.modelo} · ${p.talla} · ${p.color}` === texto
    );
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
        productoId: producto.id, modelo: producto.modelo, talla: producto.talla, color: producto.color, cantidad,
      });
    }
    estadoDevolucion.busqueda = '';
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
      await window.api.retornos.crear({
        numero: estadoDevolucion.numero,
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
      <td>${escapeHtml(row.talla)}</td>
      <td>${escapeHtml(row.color)}</td>
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
      <button class="btn" data-go="devolver">Registrar devolución</button>
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
        <thead><tr><th>Retorno</th><th>Producto</th><th>Talla</th><th>Color</th><th class="r">Cantidad</th><th></th></tr></thead>
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
      <td>${escapeHtml(p.talla)}</td>
      <td>${escapeHtml(p.color)}</td>
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
        <thead><tr><th>Boleta</th><th>Área</th><th>Producto</th><th>Talla</th><th>Color</th><th class="r">Salió</th><th class="r">Devuelto</th><th class="r">Falta</th><th class="r">Días</th></tr></thead>
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
      <td>${escapeHtml(d.talla)}</td>
      <td>${escapeHtml(d.color)}</td>
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
          <thead><tr><th>Boleta</th><th>Producto</th><th>Talla</th><th>Color</th><th class="r">Devuelto registrado</th><th class="r">Suma real</th><th class="r">Diferencia</th></tr></thead>
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
