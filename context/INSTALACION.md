# 📦 Factura Bot — Guía de Instalación para Antigravity

Bot que lee facturas (PDF e imágenes) del grupo de WhatsApp y actualiza el inventario en Supabase automáticamente.

---

## ✅ Requisitos

- Node.js v18 o superior
- Una cuenta en [Anthropic](https://console.anthropic.com) (Claude API)
- Acceso a Supabase del cliente
- Un celular con WhatsApp para escanear el QR

---

## 🚀 Instalación paso a paso

### 1. Clonar / copiar el proyecto
```bash
cd /ruta/donde/instalar
# copiar la carpeta factura-bot aquí
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con los valores reales del cliente
```

Los valores necesarios son:
| Variable | Dónde conseguirla |
|---|---|
| `SUPABASE_URL` | Supabase > Settings > API > Project URL |
| `SUPABASE_KEY` | Supabase > Settings > API > anon/public key |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys |

### 4. Crear tabla en Supabase
Ir a **Supabase > SQL Editor** y ejecutar el contenido de `docs/supabase_tabla.sql`

> ⚠️ Si el cliente ya tiene una tabla de productos, ajustar los nombres de columnas en `src/index.js` líneas marcadas con `TABLA_PRODUCTOS`.

### 5. Iniciar el bot
```bash
npm start
```

Aparecerá un **código QR en la terminal**. El cliente debe:
1. Abrir WhatsApp en su celular
2. Ir a **Dispositivos vinculados**
3. Escanear el QR

### 6. Verificar que funciona
- El bot mostrará: `🤖 Bot iniciado`
- Enviar una imagen de prueba al grupo
- Debe responder con el resumen de productos procesados

---

## 🔁 Mantener el bot corriendo (producción)

Instalar PM2 para que el bot se reinicie automáticamente:
```bash
npm install -g pm2
pm2 start src/index.js --name factura-bot
pm2 save
pm2 startup
```

---

## 📁 Estructura del proyecto

```
factura-bot/
├── src/
│   └── index.js          ← Código principal del bot
├── auth/                  ← Se crea automáticamente (sesión de WhatsApp)
├── docs/
│   └── supabase_tabla.sql ← SQL para crear la tabla
├── .env.example           ← Plantilla de variables de entorno
├── .env                   ← Variables reales (NO subir a git)
└── package.json
```

---

## ⚠️ Notas importantes

- La carpeta `auth/` guarda la sesión de WhatsApp. **No borrarla** o tocará escanear QR de nuevo.
- Si cambia el nombre del grupo, actualizar `GRUPO_NOMBRE` en `src/index.js` línea 9.
- Si la tabla de Supabase tiene columnas diferentes, ajustar en las funciones `crearProducto` y `actualizarCantidad`.
- El bot solo lee mensajes del grupo configurado, ignora todo lo demás.

---

## 🆘 Soporte

Si Claude no puede leer una factura (mala calidad, idioma extraño), responderá con un mensaje de error en el grupo para que el usuario lo suba de nuevo.
