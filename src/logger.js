const fs = require('fs');
const path = require('path');

// ─── Directorio de logs ──────────────────────────────────────────────────────
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_RETENTION_DAYS = 30;

// Crear carpeta logs/ si no existe
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Purgar logs antiguos (>30 días) ─────────────────────────────────────────
function purgarLogsAntiguos() {
    try {
        const ahora = Date.now();
        const archivos = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        for (const archivo of archivos) {
            const ruta = path.join(LOG_DIR, archivo);
            const stats = fs.statSync(ruta);
            const edadDias = (ahora - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (edadDias > LOG_RETENTION_DAYS) {
                fs.unlinkSync(ruta);
            }
        }
    } catch (err) {
        console.error('[LOGGER] Error purgando logs antiguos:', err.message);
    }
}

// Purgar al iniciar
purgarLogsAntiguos();

// ─── Helper: obtener ruta del archivo de log del día actual ──────────────────
function getLogFilePath() {
    const fecha = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `${fecha}.log`);
}

// ─── Helper: timestamp legible ────────────────────────────────────────────────
function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// ─── Escribir línea a archivo de log ─────────────────────────────────────────
function escribirEnArchivo(linea) {
    try {
        fs.appendFileSync(getLogFilePath(), linea + '\n', 'utf8');
    } catch (err) {
        console.error('[LOGGER] Error escribiendo en archivo de log:', err.message);
    }
}

// ─── Logger con salida a consola + archivo ────────────────────────────────────
const logger = {
    info: (...args) => {
        const linea = `[${timestamp()}] [INFO] ${args.join(' ')}`;
        console.log(linea);
        escribirEnArchivo(linea);
    },
    warn: (...args) => {
        const linea = `[${timestamp()}] [WARN] ${args.join(' ')}`;
        console.warn(linea);
        escribirEnArchivo(linea);
    },
    error: (...args) => {
        const linea = `[${timestamp()}] [ERROR] ${args.join(' ')}`;
        console.error(linea);
        escribirEnArchivo(linea);
    },
    debug: (...args) => {
        if (process.env.DEBUG === 'true') {
            const linea = `[${timestamp()}] [DEBUG] ${args.join(' ')}`;
            console.log(linea);
            escribirEnArchivo(linea);
        }
    },
};

module.exports = logger;
