const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const config = require('./config');
const logger = require('./logger');
const { sleep } = require('./utils');
const { extraerProductos } = require('./groqService');
const { procesarProductos } = require('./supabaseService');
const { TelegramBot, iniciarTelegramBot, enviarSolicitudAprobacion } = require('./telegramService');
const {
    crearPendiente,
    obtenerPendiente,
    rechazarPendiente,
    cargarPendientesDesdeDB,
} = require('./aprobacionManager');

// ─── Estado de reconexión ───────────────────────────────────────────────────
let intentosReconexion = 0;

// ─── Enviar mensaje helper ──────────────────────────────────────────────────
let _sock = null;
async function enviarMensaje(chatId, texto) {
    if (_sock) {
        // Silenciado por solicitud del usuario: no enviamos mensajes al grupo de WA
        logger.info(`[WA Silenciado] Mensaje evitado: ${texto}`);
        // await _sock.sendMessage(chatId, { text: texto });
    }
}

// ─── Detectar tipo MIME de imagen ───────────────────────────────────────────
function obtenerMimeType(msg) {
    if (msg.message?.imageMessage) {
        return msg.message.imageMessage.mimetype || 'image/jpeg';
    }
    if (msg.message?.documentMessage) {
        return msg.message.documentMessage.mimetype || '';
    }
    return null;
}

// ─── Manejar mensaje de media (imagen/PDF) ──────────────────────────────────
async function manejarMedia(sock, msg, chatId) {
    let buffer = null;
    let mimeType = null;

    // Detectar imagen
    if (msg.message?.imageMessage) {
        logger.info('🖼️ Imagen detectada');
        buffer = await downloadMediaMessage(msg, 'buffer', {});
        mimeType = obtenerMimeType(msg);
    }
    // Detectar PDF
    else if (msg.message?.documentMessage) {
        const mime = msg.message.documentMessage.mimetype || '';
        if (mime.includes('pdf')) {
            logger.info('📄 PDF detectado');
            buffer = await downloadMediaMessage(msg, 'buffer', {});
            mimeType = 'application/pdf';
        }
    }

    if (!buffer) return;

    try {
        await enviarMensaje(chatId, '🔍 Analizando factura con IA...');

        const datos = await extraerProductos(buffer, mimeType);

        if (!datos.productos || datos.productos.length === 0) {
            await enviarMensaje(chatId, '⚠️ No encontré productos en este archivo. ¿Es una factura válida?');
            return;
        }

        // Obtener nombre del grupo si es posible
        let nombreGrupo = 'Desconocido';
        try {
            const metadata = await sock.groupMetadata(chatId);
            nombreGrupo = metadata?.subject || 'Desconocido';
        } catch (e) { }

        // Generar ID único para esta factura
        const facturaId = require('crypto').randomUUID();

        // Enviar a Telegram para aprobación
        await enviarSolicitudAprobacion(datos, nombreGrupo, facturaId);
        await enviarMensaje(chatId, '⏳ Factura extraída. Mando solicitud de aprobación por Telegram al administrador...');

        // Guardar como pendiente en memoria
        crearPendiente(facturaId, chatId, datos, enviarMensaje);

    } catch (err) {
        logger.error('❌ Error analizando factura:', err.message);
        await enviarMensaje(chatId, `❌ Error procesando factura: ${err.message}`);
    }
}

// ─── Función principal del bot ──────────────────────────────────────────────
async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`📡 Usando WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.macOS('Desktop'),
    });

    _sock = sock;

    // Guardar credenciales
    sock.ev.on('creds.update', saveCreds);

    const qrcode = require('qrcode-terminal');

    // ─── Manejar conexión / desconexión ─────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('Generando nuevo código QR...');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            intentosReconexion = 0;
            logger.info('🤖 Bot conectado a WhatsApp');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect && intentosReconexion < config.maxReconexiones) {
                intentosReconexion++;
                const delay = config.reconexionDelayMs * intentosReconexion;
                logger.warn(`🔄 Reconectando en ${delay / 1000}s... (intento ${intentosReconexion}/${config.maxReconexiones})`);
                await sleep(delay);
                iniciarBot();
            } else if (!shouldReconnect) {
                logger.error('🚪 Sesión cerrada (logged out). Elimina la carpeta auth/ y escanea QR de nuevo.');
            } else {
                logger.error(`❌ Máximo de reconexiones alcanzado (${config.maxReconexiones}). Reinicia el bot manualmente.`);
            }
        }
    });

    // ─── Manejar mensajes entrantes ─────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.message) return;
        if (msg.key.fromMe) return; // Ignorar mensajes propios

        const chatId = msg.key.remoteJid;

        // Verificar que sea de un grupo configurado
        let nombreGrupo = '';
        try {
            const metadata = await sock.groupMetadata(chatId);
            nombreGrupo = metadata?.subject || '';
        } catch {
            // No es un grupo, ignorar
            return;
        }

        const esGrupoPermitido = config.gruposPermitidos.some(g => nombreGrupo.includes(g.substring(0, 10)));
        if (!esGrupoPermitido) return;

        logger.info(`📩 Mensaje en: ${nombreGrupo}`);

        // Extraer texto del mensaje (si lo tiene)
        const textoMsg =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '';

        // Procesar media (imagen o PDF) 
        await manejarMedia(sock, msg, chatId);
    });

    logger.info('🤖 Escuchando eventos de WhatsApp...');
}

// ─── Inicialización única de Telegram ───────────────────────────────────────
let telegramIniciado = false;
async function inicializarServicios() {
    if (!telegramIniciado) {
        iniciarTelegramBot({
            enviarMensajeWs: enviarMensaje,
            obtenerPendiente: obtenerPendiente,
            rechazarPendiente: rechazarPendiente,
            procesarProductos: procesarProductos
        });
        telegramIniciado = true;
    }
    // Recuperar facturas pendientes del reinicio anterior
    await cargarPendientesDesdeDB(enviarMensaje);
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown(signal) {
    logger.info(`\n🛑 Señal ${signal} recibida. Cerrando bot...`);
    if (_sock) {
        _sock.end();
    }
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Iniciar ────────────────────────────────────────────────────────────────
inicializarServicios()
    .then(() => iniciarBot())
    .catch((err) => {
        logger.error('❌ Error fatal al iniciar el bot:', err);
        process.exit(1);
    });
