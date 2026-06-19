import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, get } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutlineClient } from './outline-client.js';
import {
  buildServerFromEnv,
  createOutlineMcpServer,
  getRequiredEnv,
  handleHttpTransportRequest,
  parseRuntimeConfig,
  startHttpServer,
  runServerFromEnv,
} from './index.js';

function createFakeClient(overrides: Partial<Record<keyof OutlineClient, unknown>> = {}) {
  return {
    getDocument: vi.fn().mockResolvedValue({ id: 'doc-1', title: 'Document' }),
    searchDocuments: vi.fn().mockResolvedValue({ data: [{ document: { id: 'doc-1', title: 'Document' } }] }),
    listDocuments: vi.fn().mockResolvedValue({ data: [{ id: 'doc-1', title: 'Document' }] }),
    createDocument: vi.fn().mockResolvedValue({ id: 'doc-2', title: 'Created' }),
    updateDocument: vi.fn().mockResolvedValue({ id: 'doc-1', title: 'Updated' }),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    getCollections: vi.fn().mockResolvedValue({ data: [{ id: 'col-1', name: 'Collection' }] }),
    getCollection: vi.fn().mockResolvedValue({ id: 'col-1', name: 'Collection' }),
    ...overrides,
  } as unknown as OutlineClient;
}

async function connectTestClient(outlineClient: OutlineClient, options?: { readOnly?: boolean }) {
  const server = createOutlineMcpServer(outlineClient, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client, server };
}

describe('MCP server integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists read and write tools by default without real Outline credentials', async () => {
    const { client, server } = await connectTestClient(createFakeClient());

    try {
      const toolNames = (await client.listTools()).tools.map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          'outline_get_document',
          'outline_search_documents',
          'outline_list_documents',
          'outline_list_collections',
          'outline_get_collection',
          'outline_create_document',
          'outline_update_document',
          'outline_delete_document',
        ])
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('hides write tools in read-only mode while keeping read tools', async () => {
    const { client, server } = await connectTestClient(createFakeClient(), { readOnly: true });

    try {
      const toolNames = (await client.listTools()).tools.map((tool) => tool.name);

      expect(toolNames).toEqual(expect.arrayContaining(['outline_get_document', 'outline_search_documents', 'outline_list_documents']));
      expect(toolNames).not.toEqual(expect.arrayContaining(['outline_create_document', 'outline_update_document', 'outline_delete_document']));
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns text content with serialized JSON for a successful read tool call', async () => {
    const { client, server } = await connectTestClient(createFakeClient());

    try {
      const result = await client.callTool({ name: 'outline_get_document', arguments: { id: 'doc-1' } });

      expect(result.content).toEqual([
        {
          type: 'text',
          text: JSON.stringify({ id: 'doc-1', title: 'Document' }, null, 2),
        },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('calls each read tool through the MCP path', async () => {
    const fakeClient = createFakeClient();
    const { client, server } = await connectTestClient(fakeClient);

    try {
      await client.callTool({ name: 'outline_search_documents', arguments: { query: 'design', limit: 7 } });
      await client.callTool({ name: 'outline_list_documents', arguments: { collectionId: 'col-1', limit: 3 } });
      await client.callTool({ name: 'outline_list_collections', arguments: {} });
      await client.callTool({ name: 'outline_get_collection', arguments: { id: 'col-1' } });

      expect(fakeClient.searchDocuments).toHaveBeenCalledWith('design', 7);
      expect(fakeClient.listDocuments).toHaveBeenCalledWith('col-1', 3);
      expect(fakeClient.getCollections).toHaveBeenCalledWith();
      expect(fakeClient.getCollection).toHaveBeenCalledWith('col-1');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('calls write tools through the MCP path when read-only mode is disabled', async () => {
    const fakeClient = createFakeClient();
    const { client, server } = await connectTestClient(fakeClient);

    try {
      const createResult = await client.callTool({
        name: 'outline_create_document',
        arguments: { title: 'New', text: 'Body', collectionId: 'col-1', parentDocumentId: 'parent-1', publish: true },
      });
      await client.callTool({ name: 'outline_update_document', arguments: { id: 'doc-1', title: 'Updated', text: 'Next', publish: false } });
      const deleteResult = await client.callTool({ name: 'outline_delete_document', arguments: { id: 'doc-1' } });

      expect(fakeClient.createDocument).toHaveBeenCalledWith({
        title: 'New',
        text: 'Body',
        collectionId: 'col-1',
        parentDocumentId: 'parent-1',
        publish: true,
      });
      expect(fakeClient.updateDocument).toHaveBeenCalledWith('doc-1', { title: 'Updated', text: 'Next', publish: false });
      expect(fakeClient.deleteDocument).toHaveBeenCalledWith('doc-1');
      expect(createResult.content?.[0]).toEqual({ type: 'text', text: JSON.stringify({ id: 'doc-2', title: 'Created' }, null, 2) });
      expect(deleteResult.content?.[0]).toEqual({ type: 'text', text: 'Document doc-1 deleted successfully' });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns MCP error content when a tool handler throws', async () => {
    const { client, server } = await connectTestClient(
      createFakeClient({ getDocument: vi.fn().mockRejectedValue(new Error('Outline unavailable')) })
    );

    try {
      const result = await client.callTool({ name: 'outline_get_document', arguments: { id: 'doc-1' } });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'Error: Outline unavailable' }]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns a generic MCP error for non-Error thrown values', async () => {
    const { client, server } = await connectTestClient(createFakeClient({ getDocument: vi.fn().mockRejectedValue('outline failed') }));

    try {
      const result = await client.callTool({ name: 'outline_get_document', arguments: { id: 'doc-1' } });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'Error: Unknown error' }]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe('runtime config parsing', () => {
  afterEach(() => {
    delete process.env.TEST_OUTLINE_REQUIRED;
  });

  it('parses read-only mode and Outline client numeric options', () => {
    expect(
      parseRuntimeConfig({
        OUTLINE_API_KEY: 'test-key',
        OUTLINE_BASE_URL: 'https://outline.example',
        OUTLINE_READ_ONLY: 'true',
        MCP_TRANSPORT: 'http',
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_PORT: '3001',
        MCP_HTTP_PATH: '/outline-mcp',
        OUTLINE_MAX_RETRIES: '0',
        OUTLINE_RETRY_BASE_DELAY_MS: '25',
        OUTLINE_HTTP_TIMEOUT_MS: '1000',
      })
    ).toEqual({
      apiKey: 'test-key',
      baseUrl: 'https://outline.example',
      readOnly: true,
      transport: 'http',
      httpHost: '0.0.0.0',
      httpPort: 3001,
      httpPath: '/outline-mcp',
      maxRetries: 0,
      retryBaseDelayMs: 25,
      timeoutMs: 1000,
    });
  });

  it('defaults to stdio transport, loopback host, port 3000, /mcp path, and read-only false', () => {
    expect(parseRuntimeConfig({ OUTLINE_API_KEY: 'test-key', OUTLINE_BASE_URL: 'https://outline.example' })).toMatchObject({
      readOnly: false,
      transport: 'stdio',
      httpHost: '127.0.0.1',
      httpPort: 3000,
      httpPath: '/mcp',
    });
  });

  it('fails clearly for invalid HTTP transport configuration', () => {
    expect(() =>
      parseRuntimeConfig({
        OUTLINE_API_KEY: 'test-key',
        OUTLINE_BASE_URL: 'https://outline.example',
        MCP_TRANSPORT: 'sse',
      })
    ).toThrow('MCP_TRANSPORT must be either stdio or http');

    expect(() =>
      parseRuntimeConfig({
        OUTLINE_API_KEY: 'test-key',
        OUTLINE_BASE_URL: 'https://outline.example',
        MCP_HTTP_PATH: 'mcp',
      })
    ).toThrow('MCP_HTTP_PATH must start with /');
  });

  it('fails clearly for invalid numeric configuration', () => {
    expect(() =>
      parseRuntimeConfig({
        OUTLINE_API_KEY: 'test-key',
        OUTLINE_BASE_URL: 'https://outline.example',
        OUTLINE_HTTP_TIMEOUT_MS: '0',
      })
    ).toThrow('OUTLINE_HTTP_TIMEOUT_MS must be an integer greater than or equal to 1');
  });

  it('fails clearly when required Outline environment variables are missing', () => {
    expect(() => parseRuntimeConfig({ OUTLINE_API_KEY: 'test-key' })).toThrow('Missing required environment variable: OUTLINE_BASE_URL');
  });

  it('reads required environment variables from process.env', () => {
    process.env.TEST_OUTLINE_REQUIRED = 'present';

    expect(getRequiredEnv('TEST_OUTLINE_REQUIRED')).toBe('present');
    expect(() => getRequiredEnv('TEST_OUTLINE_MISSING')).toThrow('Missing required environment variable: TEST_OUTLINE_MISSING');
  });

  it('builds a server from environment without starting transports or calling Outline', () => {
    const server = buildServerFromEnv({
      OUTLINE_API_KEY: 'test-key',
      OUTLINE_BASE_URL: 'https://outline.example',
      OUTLINE_READ_ONLY: 'true',
    });

    expect(server).toHaveProperty('run');
  });
});

describe('HTTP transport bootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes only the configured HTTP path to Streamable HTTP transport', async () => {
    const transport = { handleRequest: vi.fn().mockResolvedValue(undefined) } as unknown as StreamableHTTPServerTransport;
    const notFound = createMockResponse();

    await handleHttpTransportRequest(createMockRequest('/wrong'), notFound, '/mcp', transport);

    expect(transport.handleRequest).not.toHaveBeenCalled();
    expect(notFound.writeHead).toHaveBeenCalledWith(404, { 'content-type': 'text/plain' });
    expect(notFound.end).toHaveBeenCalledWith('Not found');

    const ok = createMockResponse();
    const req = createMockRequest('/mcp?session=none');

    await handleHttpTransportRequest(req, ok, '/mcp', transport);

    expect(transport.handleRequest).toHaveBeenCalledWith(req, ok);
  });

  it('handles HTTP requests without url or host as not found', async () => {
    const transport = { handleRequest: vi.fn().mockResolvedValue(undefined) } as unknown as StreamableHTTPServerTransport;
    const notFound = createMockResponse();

    await handleHttpTransportRequest({ headers: {} } as IncomingMessage, notFound, '/mcp', transport);

    expect(transport.handleRequest).not.toHaveBeenCalled();
    expect(notFound.writeHead).toHaveBeenCalledWith(404, { 'content-type': 'text/plain' });
  });

  it('starts Streamable HTTP on a local ephemeral port without Outline network calls', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mcpServer = createOutlineMcpServer(createFakeClient());
    const httpServer = await startHttpServer(mcpServer, { httpHost: '127.0.0.1', httpPort: 0, httpPath: '/mcp' });

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });

    expect(consoleError).toHaveBeenCalledWith('Outline MCP Server running on HTTP at http://127.0.0.1:0/mcp');
  });

  it('starts HTTP transport from environment and serves only the configured path', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const port = await getAvailablePort();
    const httpServer = await runServerFromEnv({
      OUTLINE_API_KEY: 'test-key',
      OUTLINE_BASE_URL: 'https://outline.example',
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: String(port),
      MCP_HTTP_PATH: '/custom-mcp',
    });

    try {
      expect(httpServer).toBeDefined();
      expect(await getText(`http://127.0.0.1:${port}/wrong`)).toEqual({ statusCode: 404, body: 'Not found' });
      expect(consoleError).toHaveBeenCalledWith(`Outline MCP Server running on HTTP at http://127.0.0.1:${port}/custom-mcp`);
    } finally {
      await closeHttpServer(httpServer);
    }
  });
});

function createMockRequest(url: string) {
  return { url, headers: { host: '127.0.0.1' } } as IncomingMessage;
}

function createMockResponse() {
  return {
    headersSent: false,
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse & { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

async function getAvailablePort() {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await closeHttpServer(server);

  if (typeof address !== 'object' || address === null) {
    throw new Error('Could not allocate a local test port');
  }

  return address.port;
}

async function closeHttpServer(server: Awaited<ReturnType<typeof runServerFromEnv>> | ReturnType<typeof createServer>) {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getText(url: string) {
  return new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
    get(url, (response) => {
      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode, body });
      });
    }).on('error', reject);
  });
}
