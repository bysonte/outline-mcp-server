import axios, { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlineClient } from './outline-client.js';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
  AxiosError: class MockAxiosError extends Error {
    code?: string;
    response?: { status: number; statusText?: string };

    constructor(message: string, code?: string, _config?: unknown, _request?: unknown, response?: { status: number; statusText?: string }) {
      super(message);
      this.name = 'AxiosError';
      this.code = code;
      this.response = response;
    }
  },
}));

const mockedAxios = vi.mocked(axios);

function createPostMock() {
  const post = vi.fn();
  mockedAxios.create.mockReturnValue({ post } as never);
  return post;
}

function outlineError(status?: number, code?: string) {
  return new AxiosError('Outline failed', code, undefined, undefined, status ? ({ status, statusText: `Status ${status}` } as never) : undefined);
}

describe('OutlineClient', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('configures axios with baseURL, authorization header, content type, and optional timeout', () => {
    createPostMock();

    new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', timeoutMs: 1500 });

    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://outline.example',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
      timeout: 1500,
    });
  });

  it('omits timeout when it is not configured or not positive', () => {
    createPostMock();

    new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', timeoutMs: 0 });

    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://outline.example',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('normalizes Outline response envelopes', async () => {
    const post = createPostMock();
    post.mockResolvedValueOnce({ data: { data: { id: 'doc-1', title: 'Document' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example' });

    await expect(client.getDocument('doc-1')).resolves.toEqual({ id: 'doc-1', title: 'Document' });
    expect(post).toHaveBeenCalledWith('/api/documents.info', { id: 'doc-1' });
  });

  it('passes through responses without an Outline data envelope', async () => {
    const post = createPostMock();
    post.mockResolvedValueOnce({ data: { id: 'collection-1', name: 'Engineering' } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example' });

    await expect(client.getCollection('collection-1')).resolves.toEqual({ id: 'collection-1', name: 'Engineering' });
  });

  it('sends expected create, update, and delete document payloads', async () => {
    const post = createPostMock();
    post.mockResolvedValue({ data: { data: { id: 'doc-1' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example' });

    await client.createDocument({ title: 'New', text: 'Body', collectionId: 'col-1', parentDocumentId: 'parent-1', publish: true });
    await client.updateDocument('doc-1', { title: 'Updated', text: 'Next', publish: false });
    await client.deleteDocument('doc-1');

    expect(post).toHaveBeenNthCalledWith(1, '/api/documents.create', {
      title: 'New',
      text: 'Body',
      publish: true,
      collectionId: 'col-1',
      parentDocumentId: 'parent-1',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/api/documents.update', {
      id: 'doc-1',
      title: 'Updated',
      text: 'Next',
      publish: false,
    });
    expect(post).toHaveBeenNthCalledWith(3, '/api/documents.delete', { id: 'doc-1' });
  });

  it('sends expected search, list documents, and collection payloads', async () => {
    const post = createPostMock();
    post.mockResolvedValue({ data: { data: { data: [] } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example' });

    await client.searchDocuments('design', 10);
    await client.listDocuments('col-1', 15);
    await client.listDocuments(undefined, 5);
    await client.getCollections();
    await client.getCollection('col-1');

    expect(post).toHaveBeenNthCalledWith(1, '/api/documents.search', { query: 'design', limit: 10 });
    expect(post).toHaveBeenNthCalledWith(2, '/api/documents.list', { limit: 15, collectionId: 'col-1' });
    expect(post).toHaveBeenNthCalledWith(3, '/api/documents.list', { limit: 5 });
    expect(post).toHaveBeenNthCalledWith(4, '/api/collections.list', {});
    expect(post).toHaveBeenNthCalledWith(5, '/api/collections.info', { id: 'col-1' });
  });

  it('falls back to the next endpoint after a primary 404', async () => {
    const post = createPostMock();
    post.mockRejectedValueOnce(outlineError(404)).mockResolvedValueOnce({ data: { data: { id: 'doc-1' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 0 });

    await expect(client.getDocument('doc-1')).resolves.toEqual({ id: 'doc-1' });
    expect(post).toHaveBeenNthCalledWith(1, '/api/documents.info', { id: 'doc-1' });
    expect(post).toHaveBeenNthCalledWith(2, '/api/documents/info', { id: 'doc-1' });
  });

  it.each([400, 401, 403])('does not retry permanent %s errors', async (status) => {
    const post = createPostMock();
    post.mockRejectedValueOnce(outlineError(status));
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 2, retryBaseDelayMs: 0 });

    await expect(client.getDocument('doc-1')).rejects.toThrow(`Outline API request failed with ${status} Status ${status}`);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reports a clear error when no fallback endpoint succeeds', async () => {
    const post = createPostMock();
    post.mockRejectedValue(outlineError(404));
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 0 });

    await expect(client.getDocument('missing')).rejects.toThrow('Outline API request failed with 404 Status 404');
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('reports when no endpoint candidate succeeds', async () => {
    const post = createPostMock();
    post.mockRejectedValue(outlineError(404));
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 0 });

    await expect(client.getCollections()).rejects.toThrow('Outline API request failed with 404 Status 404');
    expect(post).toHaveBeenCalledTimes(4);
  });

  it.each([429, 500, 502, 503, 504])('retries temporary HTTP %s errors', async (status) => {
    const post = createPostMock();
    post.mockRejectedValueOnce(outlineError(status)).mockResolvedValueOnce({ data: { data: { id: 'doc-1' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 1, retryBaseDelayMs: 0 });

    await expect(client.getDocument('doc-1')).resolves.toEqual({ id: 'doc-1' });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'])('retries temporary network error %s', async (code) => {
    const post = createPostMock();
    post.mockRejectedValueOnce(outlineError(undefined, code)).mockResolvedValueOnce({ data: { data: { id: 'doc-1' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 1, retryBaseDelayMs: 0 });

    await expect(client.getDocument('doc-1')).resolves.toEqual({ id: 'doc-1' });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('fails clearly after exhausting retries', async () => {
    const post = createPostMock();
    post.mockRejectedValue(outlineError(503));
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 2, retryBaseDelayMs: 0 });

    await expect(client.getDocument('doc-1')).rejects.toThrow('Outline API request failed with 503 Status 503');
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('waits between retries when retry delay is configured', async () => {
    vi.useFakeTimers();
    const post = createPostMock();
    post.mockRejectedValueOnce(outlineError(503)).mockResolvedValueOnce({ data: { data: { id: 'doc-1' } } });
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 1, retryBaseDelayMs: 10 });

    const result = client.getDocument('doc-1');
    await vi.advanceTimersByTimeAsync(10);

    await expect(result).resolves.toEqual({ id: 'doc-1' });
    expect(post).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('passes through non-Axios errors and unknown errors readably', async () => {
    const post = createPostMock();
    post.mockRejectedValueOnce(new Error('plain failure')).mockRejectedValueOnce('unexpected failure');
    const client = new OutlineClient({ apiKey: 'test-key', baseUrl: 'https://outline.example', maxRetries: 1, retryBaseDelayMs: 0 });

    await expect(client.getDocument('doc-1')).rejects.toThrow('plain failure');
    await expect(client.getDocument('doc-1')).rejects.toThrow('Unknown Outline API error');
  });
});
