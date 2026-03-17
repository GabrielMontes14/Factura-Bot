const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const logger = require('./logger');
const { retry, normalizarTexto } = require('./utils');

// ─── Cliente de Supabase ─────────────────────────────────────────────────────
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// ─── Buscar producto por nombre (normalizado) ───────────────────────────────
async function buscarProducto(nombre) {
    return retry(
        async () => {
            const { data, error } = await supabase
                .from(config.tablaProductos)
                .select('*')
                .ilike('nombre', `%${nombre}%`)
                .limit(5);

            if (error) throw error;

            // Si hay múltiples resultados, buscar el más parecido
            if (data && data.length > 1) {
                const nombreNorm = normalizarTexto(nombre);
                const exacto = data.find((p) => normalizarTexto(p.nombre) === nombreNorm);
                if (exacto) return exacto;
            }

            return data?.[0] || null;
        },
        { maxRetries: config.maxRetries, delayMs: config.retryDelayMs, label: `buscarProducto(${nombre})` }
    );
}

// ─── Actualizar cantidad de producto existente ──────────────────────────────
async function actualizarCantidad(id, cantidadActual, cantidadNueva) {
    return retry(
        async () => {
            const { error } = await supabase
                .from(config.tablaProductos)
                .update({
                    cantidad: cantidadActual + cantidadNueva,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (error) throw error;
            logger.info(`📦 Producto #${id}: +${cantidadNueva} unidades (total: ${cantidadActual + cantidadNueva})`);
        },
        { maxRetries: config.maxRetries, delayMs: config.retryDelayMs, label: `actualizarCantidad(#${id})` }
    );
}

// ─── Crear producto nuevo ───────────────────────────────────────────────────
async function crearProducto(nombre, cantidad, precioCosto) {
    return retry(
        async () => {
            const ahora = new Date().toISOString();
            const { error } = await supabase
                .from(config.tablaProductos)
                .insert([{ nombre, cantidad, precio_costo: precioCosto, created_at: ahora, updated_at: ahora }]);

            if (error) throw error;
            logger.info(`🆕 Producto creado: "${nombre}" — ${cantidad} uds.`);
        },
        { maxRetries: config.maxRetries, delayMs: config.retryDelayMs, label: `crearProducto(${nombre})` }
    );
}

// ─── Procesar lista de productos extraídos ──────────────────────────────────
async function procesarProductos(productos) {
    const resultados = [];

    for (const item of productos) {
        if (!item.nombre || item.cantidad == null) {
            logger.warn(`⚠️ Producto omitido (datos incompletos): ${JSON.stringify(item)}`);
            continue;
        }

        try {
            const existente = await buscarProducto(item.nombre);

            if (existente) {
                await actualizarCantidad(existente.id, existente.cantidad || 0, item.cantidad);
                resultados.push(
                    `✅ *${item.nombre}*: +${item.cantidad} uds. (total: ${(existente.cantidad || 0) + item.cantidad})`
                );
            } else {
                await crearProducto(item.nombre, item.cantidad, item.precio_costo);
                const precio = item.precio_costo != null ? `$${item.precio_costo}` : 'sin precio';
                resultados.push(`🆕 *${item.nombre}*: NUEVO — ${item.cantidad} uds. @ ${precio}`);
            }
        } catch (err) {
            logger.error(`❌ Error procesando "${item.nombre}":`, err.message);
            resultados.push(`❌ *${item.nombre}*: Error — ${err.message}`);
        }
    }

    return resultados;
}

// ─── Guardar factura pendiente en Supabase ───────────────────────────────────
async function guardarFacturaPendiente(facturaId, chatIdWs, datos) {
    const { error } = await supabase
        .from('facturas_pendientes')
        .insert([{
            id: facturaId,
            chat_id_ws: chatIdWs,
            datos: datos,
            estado: 'pendiente',
        }]);
    if (error) throw error;
    logger.info(`💾 Factura guardada en Supabase (ID: ${facturaId})`);
}

// ─── Actualizar estado de factura en Supabase ────────────────────────────────
async function actualizarEstadoFactura(facturaId, estado) {
    const { error } = await supabase
        .from('facturas_pendientes')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', facturaId);
    if (error) throw error;
    logger.info(`📝 Factura ${facturaId} → estado: ${estado}`);
}

// ─── Obtener todas las facturas pendientes (para recuperar tras reinicio) ─────
async function obtenerFacturasPendientesDB() {
    const { data, error } = await supabase
        .from('facturas_pendientes')
        .select('*')
        .eq('estado', 'pendiente');
    if (error) throw error;
    return data || [];
}

module.exports = {
    buscarProducto,
    actualizarCantidad,
    crearProducto,
    procesarProductos,
    guardarFacturaPendiente,
    actualizarEstadoFactura,
    obtenerFacturasPendientesDB,
};

