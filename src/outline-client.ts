import axios, { AxiosError, AxiosInstance } from 'axios';

export type Document = unknown;
export type Collection = unknown;

export interface OutlineConfig {
  apiKey: string;
  baseUrl: string;
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

  constructor(config: OutlineConfig) {
    this.api = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getDocument(id: string): Promise<Document> {
    return this.postFirst(['/api/documents.info', '/api/documents/info', '/api/document/info'], { id });
  }

  async searchDocuments(query: string, limit = 25): Promise<Document> {
    return this.postFirst(['/api/documents.search', '/api/documents/search', '/api/document/search'], {
      query,
      limit,
    });
  }

  async listDocuments(collectionId?: string, limit = 25): Promise<Document> {
    const payload: JsonPayload = { limit };

    if (collectionId) {
      payload.collectionId = collectionId;
    }

    return this.postFirst(['/api/documents.list', '/api/documents/list', '/api/documents', '/api/document/list'], payload);
  }

  async createDocument(data: CreateDocumentInput): Promise<Document> {
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

  async updateDocument(id: string, data: UpdateDocumentInput): Promise<Document> {
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

  async getCollections(): Promise<Collection> {
    return this.postFirst(['/api/collections.list', '/api/collections/list', '/api/collections', '/api/collection/list'], {});
  }

  async getCollection(id: string): Promise<Collection> {
    return this.postFirst(['/api/collections.info', '/api/collections/info', '/api/collection/info'], { id });
  }

  private async postFirst(endpoints: string[], payload: JsonPayload): Promise<unknown> {
    for (const [index, endpoint] of endpoints.entries()) {
      try {
        const response = await this.api.post(endpoint, payload);
        return this.extractData(response.data);
      } catch (error) {
        if (this.shouldTryNextEndpoint(error, endpoints, index)) {
          continue;
        }

        throw this.toReadableError(error);
      }
    }

    throw new Error('No valid Outline API endpoint found');
  }

  private extractData(responseData: unknown): unknown {
    if (this.isObject(responseData) && 'data' in responseData) {
      return responseData.data;
    }

    return responseData;
  }

  private shouldTryNextEndpoint(error: unknown, endpoints: string[], currentIndex: number): boolean {
    return error instanceof AxiosError && error.response?.status === 404 && currentIndex < endpoints.length - 1;
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
