
const TOLERANCIA_MIN = parseInt(process.env.TOLERANCIA_MINUTOS || '0', 10);

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_CODIGO = /^[A-Za-z0-9_-]{1,20}$/;

function aMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function fechaValida(f) {
  if (!RE_FECHA.test(f)) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

function validar(d) {
  const errores = [];

  if (vacio(d.codigo_empleado)) errores.push('codigo_empleado es obligatorio');
  else if (!RE_CODIGO.test(d.codigo_empleado)) errores.push('codigo_empleado inválido (solo letras, números, - y _; máx. 20)');

  if (vacio(d.nombre_empleado)) errores.push('nombre_empleado es obligatorio');
  else if (String(d.nombre_empleado).length > 120) errores.push('nombre_empleado no debe superar 120 caracteres');

  if (vacio(d.fecha)) errores.push('fecha es obligatoria');
  else if (!fechaValida(d.fecha)) errores.push('fecha inválida (formato YYYY-MM-DD)');

  const horas = ['hora_ingreso_programada', 'hora_salida_programada', 'hora_ingreso_real', 'hora_salida_real'];
  for (const campo of horas) {
    const obligatorio = campo.endsWith('programada');
    if (vacio(d[campo])) {
      if (obligatorio) errores.push(`${campo} es obligatoria`);
    } else if (!RE_HORA.test(d[campo])) {
      errores.push(`${campo} tiene formato inválido (HH:MM)`);
    }
  }

  const ok = (c) => !vacio(d[c]) && RE_HORA.test(d[c]);

  if (ok('hora_ingreso_programada') && ok('hora_salida_programada') &&
      aMinutos(d.hora_salida_programada) <= aMinutos(d.hora_ingreso_programada)) {
    errores.push('hora_salida_programada debe ser posterior a hora_ingreso_programada');
  }
  if (ok('hora_ingreso_real') && ok('hora_salida_real') &&
      aMinutos(d.hora_salida_real) < aMinutos(d.hora_ingreso_real)) {
    errores.push('hora_salida_real no puede ser anterior a hora_ingreso_real');
  }
  if (vacio(d.hora_ingreso_real) && !vacio(d.hora_salida_real)) {
    errores.push('no se puede registrar hora_salida_real sin hora_ingreso_real');
  }
  if (!vacio(d.observacion) && String(d.observacion).length > 255) {
    errores.push('observacion no debe superar 255 caracteres');
  }
  return errores;
}
function calcularEstado(d) {
  const tieneIngreso = !vacio(d.hora_ingreso_real);
  const tieneSalida = !vacio(d.hora_salida_real);

  if (!tieneIngreso && !tieneSalida) return 'AUSENTE';
  if (!tieneIngreso || !tieneSalida) return 'INCOMPLETO';

  const atraso = aMinutos(d.hora_ingreso_real) > aMinutos(d.hora_ingreso_programada) + TOLERANCIA_MIN;
  const salidaAnticipada = aMinutos(d.hora_salida_real) < aMinutos(d.hora_salida_programada);

  if (atraso && salidaAnticipada) return 'ATRASO_Y_SALIDA_ANTICIPADA';
  if (atraso) return 'ATRASO';
  if (salidaAnticipada) return 'SALIDA_ANTICIPADA';
  return 'PUNTUAL';
}

module.exports = { validar, calcularEstado, fechaValida, RE_CODIGO };
