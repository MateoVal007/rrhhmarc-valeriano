const express = require('express');
const { Pool } = require('pg');
const { validar, calcularEstado, fechaValida, RE_CODIGO } = require('./negocio');


const pool = new Pool({
  host: process.env.DB_HOST,          
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
});

pool.on('error', (err) => console.error('Conexión con la BD perdida:', err.message));

const app = express();
app.use(express.json({ limit: '100kb' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  next(err);
});

const SELECT = `
  SELECT m.id, m.codigo_empleado, e.nombre_empleado,
         to_char(m.fecha, 'YYYY-MM-DD') AS fecha,
         to_char(m.hora_ingreso_programada, 'HH24:MI') AS hora_ingreso_programada,
         to_char(m.hora_ingreso_real, 'HH24:MI')       AS hora_ingreso_real,
         to_char(m.hora_salida_programada, 'HH24:MI')  AS hora_salida_programada,
         to_char(m.hora_salida_real, 'HH24:MI')        AS hora_salida_real,
         m.estado, m.observacion
  FROM marcaciones m JOIN empleados e ON e.codigo_empleado = m.codigo_empleado`;

const limpio = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const idValido = (id) => /^\d+$/.test(id) && Number(id) > 0 && Number(id) < 2147483647;

function normalizar(body) {
  return {
    codigo_empleado: limpio(body.codigo_empleado)?.toUpperCase() ?? null,
    nombre_empleado: limpio(body.nombre_empleado),
    fecha: limpio(body.fecha),
    hora_ingreso_programada: limpio(body.hora_ingreso_programada),
    hora_ingreso_real: limpio(body.hora_ingreso_real),
    hora_salida_programada: limpio(body.hora_salida_programada),
    hora_salida_real: limpio(body.hora_salida_real),
    observacion: limpio(body.observacion),
  };
}

function manejarErrorDb(err, res) {
  if (err.code === '23505') return res.status(400).json({ error: 'Ya existe una marcación para ese empleado en esa fecha' });
  if (err.code === '23514' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ error: 'Datos inválidos', detalle: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch (e) {
    res.status(500).json({ status: 'error', database: 'down' });
  }
});

app.get('/api/marcaciones', async (req, res) => {
  const { empleado, fecha } = req.query;
  const cond = [];
  const params = [];
  if (empleado !== undefined) {
    if (!RE_CODIGO.test(empleado)) return res.status(400).json({ error: 'Parámetro empleado inválido' });
    params.push(empleado.toUpperCase());
    cond.push(`m.codigo_empleado = $${params.length}`);
  }
  if (fecha !== undefined) {
    if (!fechaValida(fecha)) return res.status(400).json({ error: 'Parámetro fecha inválido (YYYY-MM-DD)' });
    params.push(fecha);
    cond.push(`m.fecha = $${params.length}`);
  }
  try {
    const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`${SELECT}${where} ORDER BY m.fecha DESC, m.id DESC`, params);
    res.status(200).json(rows);
  } catch (e) { manejarErrorDb(e, res); }
});

app.get('/api/marcaciones/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await pool.query(`${SELECT} WHERE m.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Marcación no encontrada' });
    res.status(200).json(rows[0]);
  } catch (e) { manejarErrorDb(e, res); }
});

async function guardarEmpleado(client, d) {
  await client.query(
    `INSERT INTO empleados (codigo_empleado, nombre_empleado) VALUES ($1, $2)
     ON CONFLICT (codigo_empleado) DO UPDATE SET nombre_empleado = EXCLUDED.nombre_empleado`,
    [d.codigo_empleado, d.nombre_empleado]);
}

app.post('/api/marcaciones', async (req, res) => {
  const d = normalizar(req.body || {});
  const errores = validar(d);
  if (errores.length) return res.status(400).json({ error: 'Validación fallida', detalles: errores });

  const estado = calcularEstado(d); // el estado lo decide SIEMPRE el backend
  const client = await pool.connect().catch((e) => { manejarErrorDb(e, res); return null; });
  if (!client) return;
  try {
    await client.query('BEGIN');
    await guardarEmpleado(client, d);
    const { rows } = await client.query(
      `INSERT INTO marcaciones (codigo_empleado, fecha, hora_ingreso_programada, hora_ingreso_real,
         hora_salida_programada, hora_salida_real, estado, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.codigo_empleado, d.fecha, d.hora_ingreso_programada, d.hora_ingreso_real,
       d.hora_salida_programada, d.hora_salida_real, estado, d.observacion]);
    await client.query('COMMIT');
    const creado = await pool.query(`${SELECT} WHERE m.id = $1`, [rows[0].id]);
    res.status(201).json(creado.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    manejarErrorDb(e, res);
  } finally { client.release(); }
});

app.put('/api/marcaciones/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  const d = normalizar(req.body || {});
  const errores = validar(d);
  if (errores.length) return res.status(400).json({ error: 'Validación fallida', detalles: errores });

  const estado = calcularEstado(d);
  const client = await pool.connect().catch((e) => { manejarErrorDb(e, res); return null; });
  if (!client) return;
  try {
    await client.query('BEGIN');
    await guardarEmpleado(client, d);
    const r = await client.query(
      `UPDATE marcaciones SET codigo_empleado=$1, fecha=$2, hora_ingreso_programada=$3, hora_ingreso_real=$4,
         hora_salida_programada=$5, hora_salida_real=$6, estado=$7, observacion=$8, actualizado_en=NOW()
       WHERE id=$9`,
      [d.codigo_empleado, d.fecha, d.hora_ingreso_programada, d.hora_ingreso_real,
       d.hora_salida_programada, d.hora_salida_real, estado, d.observacion, req.params.id]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Marcación no encontrada' });
    }
    await client.query('COMMIT');
    const act = await pool.query(`${SELECT} WHERE m.id = $1`, [req.params.id]);
    res.status(200).json(act.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    manejarErrorDb(e, res);
  } finally { client.release(); }
});

app.delete('/api/marcaciones/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const r = await pool.query('DELETE FROM marcaciones WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Marcación no encontrada' });
    res.status(200).json({ mensaje: 'Marcación eliminada', id: Number(req.params.id) });
  } catch (e) { manejarErrorDb(e, res); }
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno del servidor' }); });

// Espera a que la base de datos esté disponible antes de aceptar tráfico
async function esperarBaseDeDatos(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try { await pool.query('SELECT 1'); console.log('Conectado a la base de datos'); return; }
    catch (e) {
      console.log(`Esperando base de datos (${i}/${intentos}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('No se pudo conectar a la base de datos');
  process.exit(1);
}

const PORT = parseInt(process.env.API_PORT || '3000', 10);
esperarBaseDeDatos().then(() => app.listen(PORT, () => console.log(`API escuchando en puerto ${PORT}`)));
