require('dotenv').config();

// ─── Variables obligatorias ──────────────────────────────────────────────────
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_KEY', 'GROQ_API_KEY'];

for (const key of REQUIRED) {
    if (!process.env[key]) {
        console.error(`❌ Falta la variable de entorno: ${key}`);
        console.error('   Copia .env.example a .env y configura tus credenciales.');
        process.exit(1);
    }
}

// ─── Configuración exportada ─────────────────────────────────────────────────
const config = {
    // Supabase
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    tablaProductos: process.env.TABLA_PRODUCTOS || 'productos',

    // Groq
    groqApiKey: process.env.GROQ_API_KEY,
    groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    groqModel: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
    groqModelFallback: process.env.GROQ_MODEL_FALLBACK || 'llama-3.2-11b-vision-preview',

    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,

    // WhatsApp
    gruposPermitidos: (process.env.GRUPOS_PERMITIDOS || 'Provedores facturas a cómo sale,Fotos publicación 🔥')
        .split(',')
        .map(g => g.trim())
        .filter(Boolean),
    authDir: process.env.AUTH_DIR || './auth',

    // Aprobación
    aprobacionTimeoutMs: parseInt(process.env.APROBACION_TIMEOUT_MS, 10) || 10 * 60 * 1000, // 10 min

    // Reintentos
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS, 10) || 1000,

    // Reconexión
    reconexionDelayMs: parseInt(process.env.RECONEXION_DELAY_MS, 10) || 5000,
    maxReconexiones: parseInt(process.env.MAX_RECONEXIONES, 10) || 10,
};

module.exports = config;
