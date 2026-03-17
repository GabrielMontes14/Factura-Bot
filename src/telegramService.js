const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const logger = require('./logger');

let bot = null;
let enviarWsCallback = null;
let getPendienteCallback = null;
let rechazarCallback = null;
let procesarCallback = null;

// ─── Iniciar bot de Telegram y escuchar callbacks (botones) ─────────────────
function iniciarTelegramBot(callbacks) {
    if (!config.telegramBotToken || !config.telegramAdminChatId) {
        logger.warn('⚠️ Credenciales de Telegram no configuradas. El bot no enviará aprobaciones por Telegram.');
        return null;
    }

    enviarWsCallback = callbacks.enviarMensajeWs;
    getPendienteCallback = callbacks.obtenerPendiente;
    rechazarCallback = callbacks.rechazarPendiente;
    procesarCallback = callbacks.procesarProductos;

    bot = new TelegramBot(config.telegramBotToken, { polling: true });

    logger.info('🤖 Bot de Telegram iniciado y escuchando interacciones.');

    // Notificar al admin que el bot arrancó
    bot.sendMessage(config.telegramAdminChatId, '🎉 *Factura Bot está en línea!*\n\n🤖 Esperando nuevas facturas en los grupos de WhatsApp...', { parse_mode: 'Markdown' })
        .catch(err => logger.error('❌ Error enviando mensaje de inicio a Telegram:', err.message));

    // Manejar clics en los botones Inline
    bot.on('callback_query', async (query) => {
        const action = query.data; // 'aprobar_ID' o 'rechazar_ID'
        const msg = query.message;
        const chatIdTelegram = msg.chat.id;

        // Solo permitir acciones del admin
        if (chatIdTelegram.toString() !== config.telegramAdminChatId.toString()) {
            await bot.answerCallbackQuery(query.id, { text: 'No tienes permisos para esto.', show_alert: true });
            return;
        }

        const [decision, facturaId] = action.split('_');

        // Buscar si existe la factura pendiente con ese ID
        const pendiente = getPendienteCallback(facturaId);

        if (!pendiente) {
            await bot.answerCallbackQuery(query.id, { text: 'Esta factura ya expiró o fue procesada.', show_alert: true });
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatIdTelegram, message_id: msg.message_id });
            return;
        }

        const chatIdWs = pendiente.chatIdWs; // Necesitamos saber de dónde vino

        if (decision === 'aprobar') {
            await bot.answerCallbackQuery(query.id, { text: '⏳ Procesando...' });
            await bot.editMessageText(msg.text + '\n\n✅ *Has aprobado esta factura.* Procesando...', {
                chat_id: chatIdTelegram,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });

            await enviarWsCallback(chatIdWs, '⏳ Administrador verificando e insertando en inventario...');

            try {
                const resultados = await procesarCallback(pendiente.datos.productos);
                const resumenWs = [
                    `📦 *Factura procesada y aprobada por Admin* ${pendiente.datos.proveedor ? `— ${pendiente.datos.proveedor}` : ''}`,
                    `📅 ${pendiente.datos.fecha || 'Fecha no detectada'}`,
                    ``,
                    ...resultados,
                    ``,
                    `✔️ ${resultados.length} producto(s) actualizados en inventario.`
                ].join('\n');

                await enviarWsCallback(chatIdWs, resumenWs);
                
                // Confirmar éxito en telegram
                await bot.sendMessage(chatIdTelegram, `✅ Inventario actualizado exitosamente para la factura de ${pendiente.datos.proveedor || 'proveedor desconocido'}.`);
                rechazarCallback(facturaId, 'aprobada'); // Marcar como aprobada en Supabase

            } catch (err) {
                logger.error('❌ Error actualizando inventario:', err.message);
                await bot.sendMessage(chatIdTelegram, `❌ Error en DB: ${err.message}`);
                await enviarWsCallback(chatIdWs, `❌ Hubo un error al actualizar el inventario: ${err.message}`);
            }

        } else if (decision === 'rechazar') {
            await bot.answerCallbackQuery(query.id, { text: 'Factura rechazada' });
            await bot.editMessageText(msg.text + '\n\n❌ *Has rechazado esta factura.*', {
                chat_id: chatIdTelegram,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });

            rechazarCallback(facturaId, 'rechazada');
            await enviarWsCallback(chatIdWs, '❌ Factura rechazada por el administrador. No se actualizó el inventario.');
        }
    });

    return bot;
}

// ─── Enviar solicitud de aprobación a Telegram ───────────────────────────────
async function enviarSolicitudAprobacion(datosFactura, nombreGrupo, facturaId) {
    if (!bot) return;

    const textoResumen = [
        `📄 *NUEVA FACTURA DETECTADA*`,
        `🏢 *Grupo:* ${nombreGrupo}`,
        `🏭 *Proveedor:* ${datosFactura.proveedor || 'Desconocido'}`,
        `📅 *Fecha:* ${datosFactura.fecha || 'No detectada'}`,
        ``,
        `📦 *Productos extraídos (${datosFactura.productos.length}):*`,
        ...datosFactura.productos.map(p => `  • ${p.cantidad}x ${p.nombre} ($${p.precio_costo})`),
        ``,
        `¿Deseas enviar estos productos a Supabase?`
    ].join('\n');

    const opciones = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Aprobar', callback_data: `aprobar_${facturaId}` },
                    { text: '❌ Rechazar', callback_data: `rechazar_${facturaId}` }
                ]
            ]
        }
    };

    try {
        await bot.sendMessage(config.telegramAdminChatId, textoResumen, opciones);
        logger.info(`📩 Solicitud de aprobación enviada a Telegram (Factura ID: ${facturaId})`);
    } catch (err) {
        logger.error('❌ Error enviando mensaje a Telegram:', err.message);
    }
}

module.exports = {
    iniciarTelegramBot,
    enviarSolicitudAprobacion
};
