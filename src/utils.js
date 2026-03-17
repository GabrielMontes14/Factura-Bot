const logger = require('./logger');

// ─── Retry con backoff exponencial ──────────────────────────────────────────
async function retry(fn, { maxRetries = 3, delayMs = 1000, label = 'operación' } = {}) {
    let lastError;

    for (let intento = 1; intento <= maxRetries; intento++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (intento < maxRetries) {
                const espera = delayMs * Math.pow(2, intento - 1);
                logger.warn(`⚠️ ${label} falló (intento ${intento}/${maxRetries}). Reintentando en ${espera}ms...`);
                await sleep(espera);
            }
        }
    }

    logger.error(`❌ ${label} falló después de ${maxRetries} intentos.`);
    throw lastError;
}

// ─── Sleep ──────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Normalizar texto (quitar acentos, minúsculas, trim) ────────────────────
function normalizarTexto(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// ─── Formatear precio ───────────────────────────────────────────────────────
function formatearPrecio(valor) {
    if (valor == null) return 'sin precio';
    return `$${Number(valor).toLocaleString('es-CO')}`;
}

module.exports = { retry, sleep, normalizarTexto, formatearPrecio };
