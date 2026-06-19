import axios, { AxiosError, AxiosInstance } from 'axios';
import type { OutlineCollection, OutlineDocument, OutlineListResponse, OutlineSearchResult } from './outline-types.js';

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 100;
const TEMPORARY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const TEMPORARY_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED']);

export interface OutlineConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

interface CreateDocumentInput {
  title: string;
  text: string;
  collectionId?: string;
  parentDocumentId?: string;
  publish?: boolean;
}

interface UpdateDocumentInput {
  title?: string;
  text?: string;
  publish?: boolean;
}

type JsonPayload = Record<string, unknown>;

export class OutlineClient {
  private readonly api: AxiosInstance;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: OutlineConfig) {
    const axiosConfig = {
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(config.timeoutMs !== undefined && config.timeoutMs > 0 ? { timeout: config.timeoutMs } : {}),
    };

    this.api = axios.create(axiosConfig);
    this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.retryBaseDelayMs = Math.max(0, Math.floor(config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS));
  }

  async getDocument(id: string): Promise<OutlineDocument> {
    return this.postFirst(['/api/documents.info', '/api/documents/info', '/api/document/info'], { id });
  }

  async searchDocuments(query: string, limit = 25): Promise<OutlineListResponse<OutlineSearchResult>> {
    return this.postFirst(['/api/documents.search', '/api/documents/search', '/api/document/search'], {
      query,
      limit,
    });
  }

  async listDocuments(collectionId?: string, limit = 25): Promise<OutlineListResponse<OutlineDocument>> {
    const payload: JsonPayload = { limit };

    if (collectionId) {
      payload.collectionId = collectionId;
    }

    return this.postFirst(['/api/documents.list', '/api/documents/list', '/api/documents', '/api/document/list'], payload);
  }

  async createDocument(data: CreateDocumentInput): Promise<OutlineDocument> {
    const payload: JsonPayload = {
      title: data.title,
      text: data.text,
      publish: data.publish ?? false,
    };

    if (data.collectionId) {
      payload.collectionId = data.collectionId;
    }

    if (data.parentDocumentId) {
      payload.parentDocumentId = data.parentDocumentId;
    }

    return this.postFirst(['/api/documents.create', '/api/documents/create', '/api/documents', '/api/document/create'], payload);
  }

  async updateDocument(id: string, data: UpdateDocumentInput): Promise<OutlineDocument> {
    const payload: JsonPayload = { id };

    if (data.title !== undefined) {
      payload.title = data.title;
    }

    if (data.text !== undefined) {
      payload.text = data.text;
    }

    if (data.publish !== undefined) {
      payload.publish = data.publish;
    }

    return this.postFirst(['/api/documents.update', '/api/documents/update', '/api/document/update'], payload);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.postFirst(['/api/documents.delete', '/api/documents/delete', '/api/document/delete'], { id });
  }

  async getCollections(): Promise<OutlineListResponse<OutlineCollection>> {
    return this.postFirst(['/api/collections.list', '/api/collections/list', '/api/collections', '/api/collection/list'], {});
  }

  async getCollection(id: string): Promise<OutlineCollection> {
    return this.postFirst(['/api/collections.info', '/api/collections/info', '/api/collection/info'], { id });
  }

  private async postFirst<T>(endpoints: string[], payload: JsonPayload): Promise<T> {
    for (const [index, endpoint] of endpoints.entries()) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        try {
          const response = await this.api.post(endpoint, payload);
          return this.extractData<T>(response.data);
        } catch (error) {
          if (this.shouldTryNextEndpoint(error, endpoints, index)) {
            break;
          }

          if (attempt < this.maxRetries && this.isTemporaryError(error)) {
            await this.delay(this.retryBaseDelayMs * (attempt + 1));
            continue;
          }

          throw this.toReadableError(error);
        }
      }
    }

    throw new Error('No valid Outline API endpoint found');
  }

  private extractData<T>(responseData: unknown): T {
    if (this.isObject(responseData) && 'data' in responseData) {
      return responseData.data as T;
    }

    return responseData as T;
  }

  private shouldTryNextEndpoint(error: unknown, endpoints: string[], currentIndex: number): boolean {
    return error instanceof AxiosError && error.response?.status === 404 && currentIndex < endpoints.length - 1;
  }

  private isTemporaryError(error: unknown): boolean {
    if (!(error instanceof AxiosError)) {
      return false;
    }

    const status = error.response?.status;

    return (status !== undefined && TEMPORARY_STATUS_CODES.has(status)) || (error.code !== undefined && TEMPORARY_ERROR_CODES.has(error.code));
  }

  private async delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private toReadableError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const detail = status ? `Outline API request failed with ${status}${statusText ? ` ${statusText}` : ''}` : error.message;

      return new Error(detail);
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown Outline API error');
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
