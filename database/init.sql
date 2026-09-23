
CREATE TABLE IF NOT EXISTS empleados (
    codigo_empleado  VARCHAR(20)  PRIMARY KEY,
    nombre_empleado  VARCHAR(120) NOT NULL,
    creado_en        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marcaciones (
    id                       SERIAL       PRIMARY KEY,
    codigo_empleado          VARCHAR(20)  NOT NULL REFERENCES empleados(codigo_empleado) ON UPDATE CASCADE,
    fecha                    DATE         NOT NULL,
    hora_ingreso_programada  TIME         NOT NULL,
    hora_ingreso_real        TIME,
    hora_salida_programada   TIME         NOT NULL,
    hora_salida_real         TIME,
    estado                   VARCHAR(20)  NOT NULL,
    observacion              VARCHAR(255),
    creado_en                TIMESTAMP    NOT NULL DEFAULT NOW(),
    actualizado_en           TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_estado CHECK (estado IN ('PUNTUAL','ATRASO','SALIDA_ANTICIPADA','ATRASO_Y_SALIDA_ANTICIPADA','INCOMPLETO','AUSENTE')),
    CONSTRAINT chk_horario_programado CHECK (hora_salida_programada > hora_ingreso_programada),
    CONSTRAINT chk_horario_real CHECK (hora_salida_real IS NULL OR hora_ingreso_real IS NULL OR hora_salida_real >= hora_ingreso_real),
    CONSTRAINT uq_empleado_fecha UNIQUE (codigo_empleado, fecha)
);
CREATE INDEX IF NOT EXISTS idx_marcaciones_fecha ON marcaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_marcaciones_empleado ON marcaciones(codigo_empleado);

INSERT INTO empleados (codigo_empleado, nombre_empleado) VALUES
    ('EMP001', 'Ana Pérez'),
    ('EMP002', 'Carlos Rojas')
ON CONFLICT DO NOTHING;
INSERT INTO marcaciones (codigo_empleado, fecha, hora_ingreso_programada, hora_ingreso_real, hora_salida_programada, hora_salida_real, estado, observacion) VALUES
    ('EMP002', '2026-09-22', '08:00', '07:56', '16:00', '16:02', 'PUNTUAL', 'Registro de ejemplo')
ON CONFLICT DO NOTHING;
