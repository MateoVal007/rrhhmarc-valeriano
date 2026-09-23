// Frontend RRHH
const API = '/api/marcaciones';
const CAMPOS = ['codigo_empleado', 'nombre_empleado', 'fecha', 'hora_ingreso_programada',
  'hora_ingreso_real', 'hora_salida_programada', 'hora_salida_real', 'observacion'];

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mostrarMensaje(texto, tipo = 'ok') {
  const m = $('mensaje');
  m.hidden = false;
  m.className = `mensaje ${tipo}`;
  m.innerHTML = texto;
  if (tipo === 'ok') setTimeout(() => { m.hidden = true; }, 3000);
}

async function pedir(url, opciones = {}) {
  let resp;
  try {
    resp = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  } catch {
    throw new Error('No se pudo contactar al servidor');
  }
  let datos = null;
  try { datos = await resp.json(); } catch { /* respuesta sin JSON (p. ej. 502 de nginx) */ }
  if (!resp.ok) {
    if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
      throw new Error('El API no está disponible en este momento (servicio caído).');
    }
    const detalle = datos?.detalles ? '<ul>' + datos.detalles.map((d) => `<li>${esc(d)}</li>`).join('') + '</ul>' : '';
    throw new Error(`${esc(datos?.error || 'Error ' + resp.status)}${detalle}`);
  }
  return datos;
}

async function verificarApi() {
  const p = $('estadoApi');
  try {
    await pedir('/api/health');
    p.textContent = 'API en línea'; p.className = 'pill ok';
  } catch {
    p.textContent = 'API no disponible'; p.className = 'pill error';
  }
}

async function cargar() {
  const params = new URLSearchParams();
  const emp = $('fEmpleado').value.trim();
  const fec = $('fFecha').value;
  if (emp) params.set('empleado', emp);
  if (fec) params.set('fecha', fec);
  const cuerpo = $('cuerpo');
  try {
    const lista = await pedir(`${API}${params.toString() ? '?' + params : ''}`);
    if (!lista.length) {
      cuerpo.innerHTML = '<tr><td colspan="11" class="vacio">No hay marcaciones registradas</td></tr>';
      return;
    }
    cuerpo.innerHTML = lista.map((m) => `
      <tr>
        <td>${m.id}</td>
        <td>${esc(m.codigo_empleado)}</td>
        <td>${esc(m.nombre_empleado)}</td>
        <td>${esc(m.fecha)}</td>
        <td>${esc(m.hora_ingreso_programada)}</td>
        <td>${esc(m.hora_ingreso_real) || '—'}</td>
        <td>${esc(m.hora_salida_programada)}</td>
        <td>${esc(m.hora_salida_real) || '—'}</td>
        <td><span class="estado ${esc(m.estado)}">${esc(m.estado.replaceAll('_', ' '))}</span></td>
        <td>${esc(m.observacion)}</td>
        <td>
          <button class="mini" onclick="editar(${m.id})">Editar</button>
          <button class="mini peligro" onclick="eliminar(${m.id})">Eliminar</button>
        </td>
      </tr>`).join('');
  } catch (e) {
    cuerpo.innerHTML = `<tr><td colspan="11" class="vacio">${e.message}</td></tr>`;
  }
  verificarApi();
}

async function editar(id) {
  try {
    const m = await pedir(`${API}/${id}`);
    $('id').value = m.id;
    CAMPOS.forEach((c) => { $(c).value = m[c] ?? ''; });
    $('tituloForm').textContent = `Editar marcación #${m.id}`;
    $('btnCancelar').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { mostrarMensaje(e.message, 'error'); }
}

async function eliminar(id) {
  if (!confirm(`¿Eliminar la marcación #${id}?`)) return;
  try {
    await pedir(`${API}/${id}`, { method: 'DELETE' });
    mostrarMensaje(`Marcación #${id} eliminada`);
    cargar();
  } catch (e) { mostrarMensaje(e.message, 'error'); }
}

function reiniciarForm() {
  $('form').reset();
  $('id').value = '';
  $('tituloForm').textContent = 'Registrar marcación';
  $('btnCancelar').hidden = true;
  const hoy = new Date();
  $('fecha').value = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = {};
  CAMPOS.forEach((c) => { datos[c] = $(c).value.trim() || null; });
  const id = $('id').value;
  try {
    const r = await pedir(id ? `${API}/${id}` : API, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(datos),
    });
    mostrarMensaje(`Marcación #${r.id} ${id ? 'actualizada' : 'registrada'} · Estado: <b>${esc(r.estado)}</b>`);
    reiniciarForm();
    cargar();
  } catch (e) { mostrarMensaje(e.message, 'error'); }
});

$('btnCancelar').addEventListener('click', reiniciarForm);
$('filtros').addEventListener('submit', (ev) => { ev.preventDefault(); cargar(); });
$('btnLimpiar').addEventListener('click', () => { $('filtros').reset(); cargar(); });

reiniciarForm();
cargar();
setInterval(verificarApi, 10000);
