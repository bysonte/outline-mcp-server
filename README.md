# Outline MCP Server

Servidor [Model Context Protocol](https://modelcontextprotocol.io/) para integrar [Outline](https://www.getoutline.com/) con clientes MCP. Permite que un asistente o agente compatible consulte, busque y gestione documentos de una instancia de Outline mediante su API.

## Para Qué Sirve

Este servidor actúa como puente entre un cliente MCP y Outline. Una vez configurado, el cliente puede invocar herramientas para leer documentación interna, buscar contenido, crear notas, actualizar documentos y consultar colecciones.

Casos de uso típicos:

- Consultar la base de conocimiento de Outline desde un asistente de IA.
- Buscar documentación interna sin salir del cliente MCP.
- Crear o actualizar documentos en Markdown desde flujos automatizados.
- Usar Outline como memoria documental editable para agentes.

## Características

- Lectura de documentos por ID.
- Búsqueda de texto en documentos de Outline.
- Listado de documentos, con filtro opcional por colección.
- Creación de documentos con contenido Markdown.
- Actualización de título, contenido y estado de publicación.
- Eliminación de documentos.
- Listado de colecciones.
- Consulta de información de una colección concreta.
- Transporte MCP por `stdio` por defecto, ideal para clientes locales.
- Transporte Streamable HTTP opcional para despliegues remotos.
- Modo solo lectura para ocultar herramientas de escritura.
- Timeout HTTP y reintentos acotados ante errores temporales de Outline.
- Validación de argumentos con esquemas Zod mediante el SDK MCP actual.

## Requisitos

- Node.js `>=18`.
- Una instancia de Outline accesible por URL.
- Un token de API de Outline con permisos suficientes para las operaciones que quieras usar.

## Instalación Rápida Con npx

La forma más sencilla es configurarlo directamente en tu cliente MCP usando `npx`:

```json
{
  "mcpServers": {
    "outline": {
      "command": "npx",
      "args": ["-y", "getoutline-mcp-server"],
      "env": {
        "OUTLINE_BASE_URL": "https://tu-instancia-outline.com",
        "OUTLINE_API_KEY": "tu-token-de-api"
      }
    }
  }
}
```

## Instalación Desde Código Fuente

```bash
npm install
npm run build
npm start
```

Para desarrollo:

```bash
npm run dev
```

Para recompilar automáticamente mientras editas:

```bash
npm run watch
```

## Configuración

El servidor lee la configuración desde variables de entorno:

```bash
OUTLINE_BASE_URL=https://tu-instancia-outline.com
OUTLINE_API_KEY=tu-token-de-api
OUTLINE_READ_ONLY=false
MCP_TRANSPORT=stdio
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
OUTLINE_MAX_RETRIES=2
OUTLINE_RETRY_BASE_DELAY_MS=100
# OUTLINE_HTTP_TIMEOUT_MS=10000
```

Puedes tomar `env.example` como referencia.

Variables disponibles:

| Variable | Default | Descripción |
| --- | --- | --- |
| `OUTLINE_BASE_URL` | requerido | URL base de tu instancia de Outline. |
| `OUTLINE_API_KEY` | requerido | Token de API de Outline. No se imprime en logs. |
| `OUTLINE_READ_ONLY` | `false` | Si es `true`, no registra `outline_create_document`, `outline_update_document` ni `outline_delete_document`. |
| `MCP_TRANSPORT` | `stdio` | Transporte MCP: `stdio` o `http`. Valores inválidos fallan al arrancar. |
| `MCP_HTTP_HOST` | `127.0.0.1` | Host de escucha para Streamable HTTP. Usa `0.0.0.0` solo si el despliegue lo protege correctamente. |
| `MCP_HTTP_PORT` | `3000` | Puerto HTTP cuando `MCP_TRANSPORT=http`. |
| `MCP_HTTP_PATH` | `/mcp` | Path HTTP del endpoint MCP. Debe empezar con `/`. |
| `OUTLINE_MAX_RETRIES` | `2` | Reintentos máximos por endpoint para `429`, `5xx` y errores transitorios de red. Usa `0` para desactivar. |
| `OUTLINE_RETRY_BASE_DELAY_MS` | `100` | Delay base para backoff acotado entre reintentos. |
| `OUTLINE_HTTP_TIMEOUT_MS` | sin valor | Timeout opcional en milisegundos para Axios. |

### Modo Solo Lectura

Con `OUTLINE_READ_ONLY=true`, el servidor no expone las herramientas de escritura en `tools/list`. Las herramientas ocultas son `outline_create_document`, `outline_update_document` y `outline_delete_document`.

Aunque actives este modo, usa también un token de Outline con permisos mínimos de lectura siempre que tu instancia lo permita.

### Transporte Streamable HTTP

`stdio` sigue siendo el transporte por defecto y no requiere configurar variables HTTP. Para exponer el servidor por Streamable HTTP:

```bash
MCP_TRANSPORT=http
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
npm start
```

El endpoint queda disponible en `http://127.0.0.1:3000/mcp` con transporte Streamable HTTP del SDK MCP. Si necesitas exponerlo fuera de la máquina local, cambia `MCP_HTTP_HOST`, por ejemplo a `0.0.0.0`, y protege el acceso desde la red o un proxy.

Este cambio no agrega autenticación propia al endpoint HTTP. En producción, publícalo solo detrás de una red confiable, VPN, reverse proxy con autenticación, reglas de firewall o controles equivalentes.

### Timeout Y Reintentos

El cliente de Outline puede reintentar errores temporales: `429`, `500`, `502`, `503`, `504`, `ECONNRESET`, `ETIMEDOUT` y `ECONNABORTED`. No reintenta errores permanentes como `400`, `401` o `403`.

Configura `OUTLINE_MAX_RETRIES=0` para desactivar reintentos. Define `OUTLINE_HTTP_TIMEOUT_MS` solo si quieres imponer un timeout explícito a las llamadas HTTP hacia Outline.

### Cómo Obtener El Token De Outline

1. Entra en tu instancia de Outline.
2. Abre `Settings`.
3. Ve a `API Tokens`.
4. Crea un token nuevo.
5. Usa ese valor como `OUTLINE_API_KEY`.

Recomendación: crea un token con los permisos mínimos necesarios para tu caso de uso.

## Configuración En Clientes MCP

### Cliente Local Con npx

```json
{
  "mcpServers": {
    "outline": {
      "command": "npx",
      "args": ["-y", "getoutline-mcp-server"],
      "env": {
        "OUTLINE_BASE_URL": "https://tu-instancia-outline.com",
        "OUTLINE_API_KEY": "tu-token-de-api"
      }
    }
  }
}
```

### Cliente Local Desde Este Repositorio

Primero compila el proyecto:

```bash
npm run build
```

Luego apunta el cliente al archivo compilado:

```json
{
  "mcpServers": {
    "outline": {
      "command": "node",
      "args": ["/ruta/absoluta/outline-mcp-server/dist/index.js"],
      "env": {
        "OUTLINE_BASE_URL": "https://tu-instancia-outline.com",
        "OUTLINE_API_KEY": "tu-token-de-api"
      }
    }
  }
}
```

En Windows, usa una ruta absoluta válida, por ejemplo:

```json
"args": ["D:/work/outline-mcp-server/dist/index.js"]
```

### OpenCode

OpenCode usa una forma de configuración distinta a otros clientes MCP: el comando va como un array único y las variables del proceso van en `environment`, no en `env`.

Ejemplo para `C:\Users\gbaso\.config\opencode\opencode.json`:

```json
{
  "mcp": {
    "outline": {
      "type": "local",
      "command": [
        "node",
        "D:/work/outline-mcp-server/dist/index.js"
      ],
      "enabled": true,
      "environment": {
        "OUTLINE_BASE_URL": "https://tu-instancia-outline.com",
        "OUTLINE_API_KEY": "tu-token-de-api"
      }
    }
  }
}
```

Si usas `env` en OpenCode, el servidor puede arrancar sin `OUTLINE_BASE_URL` y `OUTLINE_API_KEY`, fallar al inicio y aparecer en logs como `server unavailable key=outline type=local status=failed`.

Los logs de OpenCode en Windows están en:

```text
C:\Users\gbaso\.local\share\opencode\log\opencode.log
```

Después de modificar `opencode.json`, reinicia OpenCode. La configuración de MCP se carga al inicio y no se recarga en caliente.

## Herramientas Disponibles

### `outline_get_document`

Obtiene un documento por ID.

Parámetros:

- `id`: ID del documento.

Ejemplo:

```json
{
  "name": "outline_get_document",
  "arguments": {
    "id": "document-id"
  }
}
```

### `outline_search_documents`

Busca documentos en Outline.

Parámetros:

- `query`: texto de búsqueda.
- `limit`: número máximo de resultados. Por defecto `25`, máximo `100`.

Ejemplo:

```json
{
  "name": "outline_search_documents",
  "arguments": {
    "query": "documentación del proyecto",
    "limit": 10
  }
}
```

### `outline_list_documents`

Lista documentos, opcionalmente filtrados por colección.

Parámetros:

- `collectionId`: ID opcional de la colección.
- `limit`: número máximo de resultados. Por defecto `25`, máximo `100`.

### `outline_create_document`

Crea un documento con contenido Markdown.

Parámetros:

- `title`: título del documento.
- `text`: contenido en Markdown.
- `collectionId`: ID opcional de la colección.
- `parentDocumentId`: ID opcional del documento padre.
- `publish`: si debe publicarse inmediatamente. Por defecto `false`.

Ejemplo:

```json
{
  "name": "outline_create_document",
  "arguments": {
    "title": "Plan del proyecto",
    "text": "# Plan\n\nContenido inicial del documento.",
    "collectionId": "collection-id",
    "publish": true
  }
}
```

### `outline_update_document`

Actualiza un documento existente.

Parámetros:

- `id`: ID del documento.
- `title`: nuevo título, opcional.
- `text`: nuevo contenido Markdown, opcional.
- `publish`: cambia el estado de publicación, opcional.

### `outline_delete_document`

Elimina un documento por ID.

Parámetros:

- `id`: ID del documento.

### `outline_list_collections`

Lista todas las colecciones disponibles.

No requiere parámetros.

### `outline_get_collection`

Obtiene información de una colección por ID.

Parámetros:

- `id`: ID de la colección.

## Desarrollo

Estructura principal:

```text
src/
├── index.ts           # Servidor MCP y registro de herramientas
└── outline-client.ts  # Cliente HTTP para la API de Outline
```

Scripts disponibles:

- `npm run build`: compila TypeScript en `dist/`.
- `npm test`: ejecuta la suite Vitest sin credenciales reales de Outline.
- `npm run test:coverage`: ejecuta tests con cobertura global mínima del 85%.
- `npm start`: ejecuta `dist/index.js`.
- `npm run dev`: compila y ejecuta el servidor.
- `npm run watch`: recompila al detectar cambios.

## Seguridad

- No incluyas `OUTLINE_API_KEY` en commits, logs ni documentación pública.
- Usa variables de entorno o el sistema de secretos de tu cliente MCP.
- Evita tokens con permisos excesivos si el cliente solo necesita lectura.
- Ten cuidado con herramientas de escritura o borrado: el servidor puede modificar tu instancia de Outline.
- Si usas `MCP_TRANSPORT=http`, protege el endpoint con controles externos; el servidor no implementa autenticación HTTP propia.

## Limitaciones Actuales

- No implementa rate limiting interno; si haces muchas llamadas, depende de los límites de Outline.
- Las respuestas de Outline se devuelven como JSON de la API, con tipos TypeScript pragmáticos pero sin validación runtime exhaustiva de cada campo.
- El transporte HTTP es stateless; no agrega sesiones persistentes ni autenticación propia.

## Licencia

MIT. Consulta `LICENSE` para más detalles.
