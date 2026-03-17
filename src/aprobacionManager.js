const logger = require('./logger');
const config = require('./config');
const {
    guardarFacturaPendiente,
    actualizarEstadoFactura,
    obtenerFacturasPendientesDB,
} = require('./supabaseService');

// ─── Caché en memoria (clave: facturaId) ─────────────────────────────────────
// Map<facturaId, { datos, chatIdWs, timestamp, timer }>
const pendientes = new Map();

// ─── Crear una factura pendiente ────────────────────────────────────────────
async function crearPendiente(facturaId, chatIdWs, datos, enviarMensajeWs) {
    // 1. Persistir en Supabase
    try {
        await guardarFacturaPendiente(facturaId, chatIdWs, datos);
    } catch (err) {
        logger.error(`❌ Error guardando factura en Supabase (ID: ${facturaId}):`, err.message);
        // Continuamos aunque falle Supabase (la factura queda en memoria)
    }

    // 2. Registrar en caché con timer de expiración
    _registrarEnMemoria(facturaId, chatIdWs, datos, enviarMensajeWs);
    logger.info(`⏳ Factura en memoria y Supabase (ID: ${facturaId}, ${datos.productos?.length || 0} productos)`);
}

// ─── Registrar en caché sin volver a tocar Supabase (para recuperación) ──────
function _registrarEnMemoria(facturaId, chatIdWs, datos, enviarMensajeWs) {
    const timer = setTimeout(async () => {
        pendientes.delete(facturaId);
        try {
            await actualizarEstadoFactura(facturaId, 'expirada');
        } catch (err) {
            logger.error('Error actualizando estado expirada en Supabase:', err.message);
        }
        logger.info(`⏰ Factura expirada (ID: ${facturaId})`);
    }, config.aprobacionTimeoutMs);

    pendientes.set(facturaId, {
        datos,
        chatIdWs,
        timestamp: Date.now(),
        timer,
    });
}

// ─── Obtener factura pendiente de la caché ───────────────────────────────────
function obtenerPendiente(facturaId) {
    return pendientes.get(facturaId);
}

// ─── Rechazar/Aprobar (limpia caché y actualiza Supabase) ────────────────────
async function rechazarPendiente(facturaId, estado = 'rechazada') {
    const pendiente = pendientes.get(facturaId);
    if (pendiente) {
        clearTimeout(pendiente.timer);
        pendientes.delete(facturaId);
        logger.info(`🗑️ Factura eliminada de memoria (ID: ${facturaId})`);
    }
    try {
        await actualizarEstadoFactura(facturaId, estado);
    } catch (err) {
        logger.error(`❌ Error actualizando estado Supabase (ID: ${facturaId}):`, err.message);
    }
    return true;
}

// ─── Recuperar facturas pendientes del reinicio anterior ─────────────────────
async function cargarPendientesDesdeDB(enviarMensajeWs) {
    try {
        const filas = await obtenerFacturasPendientesDB();
        if (filas.length === 0) {
            logger.info('✅ Sin facturas pendientes previas en Supabase.');
            return;
        }
        logger.info(`🔄 Recuperando ${filas.length} factura(s) pendiente(s) del reinicio anterior...`);
        for (const fila of filas) {
            _registrarEnMemoria(fila.id, fila.chat_id_ws, fila.datos, enviarMensajeWs);
            logger.info(`  ↩️ Factura recuperada: ${fila.id} (recibida: ${fila.created_at})`);
        }
    } catch (err) {
        logger.error('❌ Error recuperando facturas pendientes desde Supabase:', err.message);
    }
}

module.exports = {
    crearPendiente,
    obtenerPendiente,
    rechazarPendiente,
    cargarPendientesDesdeDB,
};
