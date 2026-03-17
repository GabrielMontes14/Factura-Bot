const OpenAI = require('openai');
const config = require('./config');
const logger = require('./logger');
const { retry } = require('./utils');

// ─── Cliente de Groq (OpenAI-compatible) ────────────────────────────────────
const groq = new OpenAI({
    apiKey: config.groqApiKey,
    baseURL: config.groqBaseUrl,
});

const PROMPT_EXTRACCION = `Analiza esta factura y extrae TODOS los productos/ítems.
Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
{
  "productos": [
    {
      "nombre": "nombre del producto",
      "cantidad": 10,
      "precio_costo": 25000
    }
  ],
  "proveedor": "nombre del proveedor si aparece",
  "fecha": "fecha de la factura si aparece"
}
Si no puedes leer algún campo, usa null. El precio_costo debe ser número sin símbolos.`;

// ─── Extraer productos de imagen con Groq Vision ───────────────────────────
async function extraerProductos(buffer, mimeType) {
    return retry(
        async () => {
            logger.info('🤖 Groq analizando factura...');

            const base64 = buffer.toString('base64');

            // Groq Vision acepta imágenes como data URI base64
            // Formatos soportados: image/jpeg, image/png, image/webp, image/gif
            // Límite: 4MB por imagen en base64
            const dataUri = `data:${mimeType};base64,${base64}`;

            const response = await groq.chat.completions.create({
                model: config.groqModel,
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: dataUri,
                                },
                            },
                            {
                                type: 'text',
                                text: PROMPT_EXTRACCION,
                            },
                        ],
                    },
                ],
            });

            const texto = response.choices[0].message.content.trim();
            const jsonLimpio = texto.replace(/```json|```/g, '').trim();

            let datos;
            try {
                datos = JSON.parse(jsonLimpio);
            } catch (parseErr) {
                logger.error('❌ JSON inválido de Groq:', jsonLimpio.substring(0, 200));
                throw new Error('Groq devolvió una respuesta que no es JSON válido.');
            }

            // Validar estructura mínima
            if (!datos.productos || !Array.isArray(datos.productos)) {
                throw new Error('La respuesta de Groq no contiene un array de productos.');
            }

            logger.info(`📦 Groq extrajo ${datos.productos.length} producto(s)`);
            return datos;
        },
        { maxRetries: config.maxRetries, delayMs: config.retryDelayMs, label: 'extraerProductos (Groq)' }
    );
}

module.exports = { extraerProductos };
