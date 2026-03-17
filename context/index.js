const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const GRUPO_NOMBRE = 'Provedores facturas a cómo sale'; // Nombre exacto del grupo
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const TABLA_PRODUCTOS = 'productos'; // Nombre de tu tabla en Supabase

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── FUNCIÓN: Extraer productos de imagen o PDF con Claude ───────────────────
async function extraerProductosConClaude(buffer, mimeType) {
  console.log('🤖 Claude analizando factura...');

  const base64 = buffer.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: `Analiza esta factura y extrae TODOS los productos/ítems.
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
Si no puedes leer algún campo, usa null. El precio_costo debe ser número sin símbolos.`,
          },
        ],
      },
    ],
  });

  const texto = response.content[0].text.trim();
  const jsonLimpio = texto.replace(/```json|```/g, '').trim();
  return JSON.parse(jsonLimpio);
}

// ─── FUNCIÓN: Buscar producto en Supabase ─────────────────────────────────────
async function buscarProducto(nombre) {
  const { data, error } = await supabase
    .from(TABLA_PRODUCTOS)
    .select('*')
    .ilike('nombre', `%${nombre}%`)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

// ─── FUNCIÓN: Actualizar cantidad de producto existente ──────────────────────
async function actualizarCantidad(id, cantidadActual, cantidadNueva) {
  const { error } = await supabase
    .from(TABLA_PRODUCTOS)
    .update({ cantidad: cantidadActual + cantidadNueva, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ─── FUNCIÓN: Crear producto nuevo ───────────────────────────────────────────
async function crearProducto(nombre, cantidad, precio_costo) {
  const { error } = await supabase
    .from(TABLA_PRODUCTOS)
    .insert([{ nombre, cantidad, precio_costo, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);

  if (error) throw error;
}

// ─── FUNCIÓN: Procesar lista de productos extraídos ──────────────────────────
async function procesarProductos(productos) {
  const resultados = [];

  for (const item of productos) {
    if (!item.nombre || item.cantidad == null) continue;

    const existente = await buscarProducto(item.nombre);

    if (existente) {
      await actualizarCantidad(existente.id, existente.cantidad || 0, item.cantidad);
      resultados.push(`✅ *${item.nombre}*: +${item.cantidad} unidades (total: ${(existente.cantidad || 0) + item.cantidad})`);
    } else {
      await crearProducto(item.nombre, item.cantidad, item.precio_costo);
      resultados.push(`🆕 *${item.nombre}*: NUEVO — ${item.cantidad} uds. @ $${item.precio_costo || 'sin precio'}`);
    }
  }

  return resultados;
}

// ─── FUNCIÓN PRINCIPAL: Bot de WhatsApp ──────────────────────────────────────
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    // Obtener nombre del chat
    const chatId = msg.key.remoteJid;
    const metadata = await sock.groupMetadata(chatId).catch(() => null);
    const nombreGrupo = metadata?.subject || '';

    // Solo procesar mensajes del grupo configurado
    if (!nombreGrupo.includes(GRUPO_NOMBRE.substring(0, 10))) return;

    console.log(`📩 Mensaje recibido en: ${nombreGrupo}`);

    let buffer = null;
    let mimeType = null;

    // Detectar si es imagen
    if (msg.message.imageMessage) {
      console.log('🖼️ Imagen detectada');
      buffer = await downloadMediaMessage(msg, 'buffer', {});
      mimeType = 'image/jpeg';
    }

    // Detectar si es PDF (documento)
    else if (msg.message.documentMessage) {
      const mime = msg.message.documentMessage.mimetype || '';
      if (mime.includes('pdf')) {
        console.log('📄 PDF detectado');
        buffer = await downloadMediaMessage(msg, 'buffer', {});
        mimeType = 'application/pdf';

        // Claude no procesa PDF binario directo, convertimos a imagen
        // Para PDFs, enviamos como documento base64 tipo image/jpeg (Claude puede leer PDFs como documento)
        mimeType = 'application/pdf';
      }
    }

    if (!buffer) return;

    try {
      await sock.sendMessage(chatId, { text: '🔍 Procesando factura...' });

      const datos = await extraerProductosConClaude(buffer, mimeType);
      console.log('📦 Productos extraídos:', datos.productos?.length || 0);

      if (!datos.productos || datos.productos.length === 0) {
        await sock.sendMessage(chatId, { text: '⚠️ No encontré productos en esta imagen. ¿Es una factura válida?' });
        return;
      }

      const resultados = await procesarProductos(datos.productos);

      const resumen = [
        `📦 *Factura procesada* ${datos.proveedor ? `- ${datos.proveedor}` : ''}`,
        `📅 ${datos.fecha || 'Fecha no detectada'}`,
        ``,
        ...resultados,
        ``,
        `✔️ ${resultados.length} producto(s) actualizados en inventario.`,
      ].join('\n');

      await sock.sendMessage(chatId, { text: resumen });
      console.log('✅ Inventario actualizado');

    } catch (err) {
      console.error('❌ Error procesando factura:', err);
      await sock.sendMessage(chatId, { text: `❌ Error procesando la factura: ${err.message}` });
    }
  });

  console.log('🤖 Bot iniciado. Escanea el QR con WhatsApp...');
}

iniciarBot().catch(console.error);
