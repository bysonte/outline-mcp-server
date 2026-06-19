#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { OutlineClient } from './outline-client.js';

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

  constructor(outlineClient: OutlineClient) {
    this.outlineClient = outlineClient;
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Outline MCP Server running on stdio');
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const outlineClient = new OutlineClient({
  apiKey: getRequiredEnv('OUTLINE_API_KEY'),
  baseUrl: getRequiredEnv('OUTLINE_BASE_URL'),
});

const server = new OutlineMCPServer(outlineClient);
server.run().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
