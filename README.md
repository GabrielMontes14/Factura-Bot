# 📄 Factura Bot v2.1

Bot de automatización para el procesamiento de facturas desde **WhatsApp** hacia **Supabase**, utilizando **IA (Groq Vision)** para la extracción de datos y **Telegram** para la validación humana.

## 🚀 Características Principales

-   **Captura Omnicanal:** Detecta imágenes y PDFs en grupos configurados de WhatsApp.
-   **IA Vision (Groq):** Extracción automática de productos, cantidades, precios, proveedores y fechas mediante modelos Llama 3.2/4.
-   **Aprobación vía Telegram:** Sistema de botones interactivos (`✅ Aprobar` / `❌ Rechazar`) para control total del administrador.
-   **Persistencia en Supabase:** Almacenamiento seguro del inventario y recuperación de facturas pendientes tras reinicios.
-   **Modo Fantasma (Stealth):** El bot opera de forma silenciosa en WhatsApp, sin responder en los grupos.
-   **Logs Profesionales:** Sistema de registros con rotación diaria y limpieza automática.

---

## 🛠️ Requisitos Previos

-   **Node.js** v18 o superior.
-   **Supabase:** Proyecto activo con una tabla de productos.
-   **Groq Cloud:** API Key para modelos de visión.
-   **Telegram:** Un bot creado vía @BotFather y tu `Chat ID`.

---

## 📦 Instalación

1.  Clona el repositorio:
    ```bash
    git clone https://github.com/GabrielMontes14/Factura-Bot.git
    cd Factura-Bot
    ```

2.  Instala las dependencias:
    ```bash
    npm install
    ```

3.  Configura las variables de entorno:
    Copia el archivo `.env.example` a `.env` y rellena tus credenciales:
    ```bash
    cp .env.example .env
    ```

---

## 🗄️ Configuración de Base de Datos

Ejecuta el siguiente script en el **SQL Editor** de Supabase para crear la tabla de gestión de estados:

```sql
CREATE TABLE facturas_pendientes (
    id          UUID PRIMARY KEY,
    chat_id_ws  TEXT NOT NULL,
    datos       JSONB NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'expirada')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegúrate de tener también tu tabla de 'productos' configurada
```

---

## 🚦 Uso

Para iniciar el bot en modo producción:
```bash
npm start
```

Para desarrollo con auto-reinado:
```bash
npm run dev
```

1.  Escanea el código QR que aparecerá en la terminal con tu WhatsApp.
2.  Asegúrate de que el bot de Telegram te haya enviado el mensaje de "Bot en línea".
3.  ¡Listo! El bot empezará a procesar facturas de los grupos autorizados.

---

## 🛡️ Seguridad

Este proyecto utiliza un archivo `.gitignore` robusto para evitar que las credenciales de Supabase, Groq, Telegram y las sesiones de WhatsApp (`auth/`) se suban al repositorio público. **Nunca compartas tu archivo `.env`**.

---

## 👤 Autor
**Gabriel Montes**
- GitHub: [@GabrielMontes14](https://github.com/GabrielMontes14)
