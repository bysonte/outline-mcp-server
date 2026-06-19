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
- Transporte MCP por `stdio`, ideal para clientes locales.
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
```

Puedes tomar `env.example` como referencia.

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
- `npm start`: ejecuta `dist/index.js`.
- `npm run dev`: compila y ejecuta el servidor.
- `npm run watch`: recompila al detectar cambios.

## Seguridad

- No incluyas `OUTLINE_API_KEY` en commits, logs ni documentación pública.
- Usa variables de entorno o el sistema de secretos de tu cliente MCP.
- Evita tokens con permisos excesivos si el cliente solo necesita lectura.
- Ten cuidado con herramientas de escritura o borrado: el servidor puede modificar tu instancia de Outline.

## Limitaciones Actuales

- No implementa rate limiting interno; si haces muchas llamadas, depende de los límites de Outline.
- Las respuestas de Outline se devuelven como JSON sin normalización de dominio propia.
- No hay suite de tests automatizada incluida.
- El transporte disponible es `stdio`; no expone Streamable HTTP para uso remoto.

## Licencia

MIT. Consulta `LICENSE` para más detalles.
