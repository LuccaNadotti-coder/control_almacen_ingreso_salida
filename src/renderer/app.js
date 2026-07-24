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
// Router
// ---------------------------------------------------------------------------

const PROXIMAMENTE = {
  salidas: { titulo: 'Salidas', desc: 'Boletas emitidas hacia las áreas de trabajo.' },
  nueva: { titulo: 'Nueva salida', desc: 'Registra la boleta y las prendas que salen del almacén.' },
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

function irA(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === id));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-go') === id));
  window.scrollTo(0, 0);

  if (id === 'maestros') {
    refrescarMaestros();
  } else if (!vistasInicializadas.has(id)) {
    pintarProximamente(id);
    vistasInicializadas.add(id);
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (!el) return;
  irA(el.getAttribute('data-go'));
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
