#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { OutlineClient, type OutlineConfig } from './outline-client.js';

export interface OutlineMcpServerOptions {
  readOnly?: boolean;
}

export interface RuntimeConfig extends OutlineConfig {
  readOnly: boolean;
  transport: 'stdio' | 'http';
  httpHost: string;
  httpPort: number;
  httpPath: string;
}

export interface HttpTransportConfig {
  httpHost: string;
  httpPort: number;
  httpPath: string;
}

function toTextContent(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toErrorContent(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';

  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

class OutlineMCPServer {
  private readonly server: McpServer;
  private readonly outlineClient: OutlineClient;
  private readonly options: Required<OutlineMcpServerOptions>;

  constructor(outlineClient: OutlineClient, options: OutlineMcpServerOptions = {}) {
    this.outlineClient = outlineClient;
    this.options = {
      readOnly: options.readOnly ?? false,
    };
    this.server = new McpServer({
      name: 'outline-mcp-server',
      version: '1.0.0',
    });

    this.registerTools();
  }

  private registerTools() {
    this.server.registerTool(
      'outline_get_document',
      {
        title: 'Obtener documento de Outline',
        description: 'Obtiene un documento concreto de Outline por ID.',
        inputSchema: {
          id: z.string().min(1).describe('ID del documento a recuperar'),
        },
      },
      async ({ id }) => {
        try {
          return toTextContent(await this.outlineClient.getDocument(id));
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    this.server.registerTool(
      'outline_search_documents',
      {
        title: 'Buscar documentos de Outline',
        description: 'Busca documentos en toda la instancia de Outline.',
        inputSchema: {
          query: z.string().min(1).describe('Texto de búsqueda'),
          limit: z.number().int().positive().max(100).default(25).describe('Número máximo de resultados'),
        },
      },
      async ({ query, limit }) => {
        try {
          return toTextContent(await this.outlineClient.searchDocuments(query, limit));
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    this.server.registerTool(
      'outline_list_documents',
      {
        title: 'Listar documentos de Outline',
        description: 'Lista documentos de Outline, opcionalmente filtrados por colección.',
        inputSchema: {
          collectionId: z.string().min(1).optional().describe('ID opcional de la colección'),
          limit: z.number().int().positive().max(100).default(25).describe('Número máximo de resultados'),
        },
      },
      async ({ collectionId, limit }) => {
        try {
          return toTextContent(await this.outlineClient.listDocuments(collectionId, limit));
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    if (!this.options.readOnly) {
      this.registerWriteTools();
    }

    this.server.registerTool(
      'outline_list_collections',
      {
        title: 'Listar colecciones de Outline',
        description: 'Lista todas las colecciones disponibles en Outline.',
      },
      async () => {
        try {
          return toTextContent(await this.outlineClient.getCollections());
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    this.server.registerTool(
      'outline_get_collection',
      {
        title: 'Obtener colección de Outline',
        description: 'Obtiene información de una colección concreta de Outline.',
        inputSchema: {
          id: z.string().min(1).describe('ID de la colección a recuperar'),
        },
      },
      async ({ id }) => {
        try {
          return toTextContent(await this.outlineClient.getCollection(id));
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );
  }

  private registerWriteTools() {
    this.server.registerTool(
      'outline_create_document',
      {
        title: 'Crear documento en Outline',
        description: 'Crea un documento en Outline con contenido Markdown.',
        inputSchema: {
          title: z.string().min(1).describe('Título del documento'),
          text: z.string().min(1).describe('Contenido del documento en Markdown'),
          collectionId: z.string().min(1).optional().describe('ID opcional de la colección'),
          parentDocumentId: z.string().min(1).optional().describe('ID opcional del documento padre'),
          publish: z.boolean().default(false).describe('Publica el documento inmediatamente'),
        },
      },
      async ({ title, text, collectionId, parentDocumentId, publish }) => {
        try {
          return toTextContent(
            await this.outlineClient.createDocument({
              title,
              text,
              collectionId,
              parentDocumentId,
              publish,
            })
          );
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    this.server.registerTool(
      'outline_update_document',
      {
        title: 'Actualizar documento de Outline',
        description: 'Actualiza el título, contenido o estado de publicación de un documento de Outline.',
        inputSchema: {
          id: z.string().min(1).describe('ID del documento a actualizar'),
          title: z.string().min(1).optional().describe('Nuevo título del documento'),
          text: z.string().min(1).optional().describe('Nuevo contenido del documento en Markdown'),
          publish: z.boolean().optional().describe('Publica el documento'),
        },
      },
      async ({ id, title, text, publish }) => {
        try {
          return toTextContent(await this.outlineClient.updateDocument(id, { title, text, publish }));
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );

    this.server.registerTool(
      'outline_delete_document',
      {
        title: 'Eliminar documento de Outline',
        description: 'Elimina un documento de Outline por ID.',
        inputSchema: {
          id: z.string().min(1).describe('ID del documento a eliminar'),
        },
      },
      async ({ id }) => {
        try {
          await this.outlineClient.deleteDocument(id);
          return toTextContent(`Document ${id} deleted successfully`);
        } catch (error) {
          return toErrorContent(error);
        }
      }
    );
  }

  getMcpServer() {
    return this.server;
  }

  async run() {
    await runStdioServer(this.server);
  }
}

export function createOutlineMcpServer(outlineClient: OutlineClient, options: OutlineMcpServerOptions = {}) {
  return new OutlineMCPServer(outlineClient, options).getMcpServer();
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function parseRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    apiKey: getRequiredEnvFrom(env, 'OUTLINE_API_KEY'),
    baseUrl: getRequiredEnvFrom(env, 'OUTLINE_BASE_URL'),
    readOnly: parseBooleanEnv(env.OUTLINE_READ_ONLY),
    transport: parseTransportEnv(env.MCP_TRANSPORT),
    httpHost: env.MCP_HTTP_HOST || '127.0.0.1',
    httpPort: parseOptionalIntegerEnv(env.MCP_HTTP_PORT, 'MCP_HTTP_PORT', { minimum: 1 }) ?? 3000,
    httpPath: parseHttpPathEnv(env.MCP_HTTP_PATH),
    maxRetries: parseOptionalIntegerEnv(env.OUTLINE_MAX_RETRIES, 'OUTLINE_MAX_RETRIES', { minimum: 0 }),
    retryBaseDelayMs: parseOptionalIntegerEnv(env.OUTLINE_RETRY_BASE_DELAY_MS, 'OUTLINE_RETRY_BASE_DELAY_MS', { minimum: 0 }),
    timeoutMs: parseOptionalIntegerEnv(env.OUTLINE_HTTP_TIMEOUT_MS, 'OUTLINE_HTTP_TIMEOUT_MS', { minimum: 1 }),
  };
}

export function buildServerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config = parseRuntimeConfig(env);
  const outlineClient = new OutlineClient(config);

  return new OutlineMCPServer(outlineClient, { readOnly: config.readOnly });
}

export async function runServerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config = parseRuntimeConfig(env);
  const outlineClient = new OutlineClient(config);
  const server = createOutlineMcpServer(outlineClient, { readOnly: config.readOnly });

  if (config.transport === 'http') {
    return startHttpServer(server, config);
  }

  await runStdioServer(server);
  return undefined;
}

export async function runStdioServer(server: McpServer) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Outline MCP Server running on stdio');
}

export async function startHttpServer(server: McpServer, config: HttpTransportConfig): Promise<HttpServer> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer((req, res) => {
    handleHttpTransportRequest(req, res, config.httpPath, transport).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown HTTP transport error';
      console.error('HTTP transport error:', message);

      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
      }

      res.end('Internal server error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.httpPort, config.httpHost, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  console.error(`Outline MCP Server running on HTTP at http://${config.httpHost}:${config.httpPort}${config.httpPath}`);
  return httpServer;
}

export async function handleHttpTransportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  httpPath: string,
  transport: StreamableHTTPServerTransport
) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (requestUrl.pathname !== httpPath) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  await transport.handleRequest(req, res);
}

function getRequiredEnvFrom(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBooleanEnv(value: string | undefined) {
  return value?.toLowerCase() === 'true';
}

function parseTransportEnv(value: string | undefined): RuntimeConfig['transport'] {
  const transport = value ?? 'stdio';

  if (transport === 'stdio' || transport === 'http') {
    return transport;
  }

  throw new Error('MCP_TRANSPORT must be either stdio or http');
}

function parseHttpPathEnv(value: string | undefined) {
  if (!value) {
    return '/mcp';
  }

  if (!value.startsWith('/')) {
    throw new Error('MCP_HTTP_PATH must start with /');
  }

  return value;
}

interface IntegerEnvOptions {
  minimum: number;
}

function parseOptionalIntegerEnv(value: string | undefined, name: string, options: IntegerEnvOptions) {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < options.minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${options.minimum}`);
  }

  return parsed;
}

const isCliEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isCliEntryPoint) {
  runServerFromEnv().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
