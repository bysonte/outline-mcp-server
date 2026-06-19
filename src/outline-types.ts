export interface OutlineEntity {
  id: string;
  [key: string]: unknown;
}

export interface OutlineDocument extends OutlineEntity {
  title?: string;
  text?: string;
  url?: string;
  collectionId?: string;
  parentDocumentId?: string | null;
}

export interface OutlineCollection extends OutlineEntity {
  name?: string;
  description?: string | null;
}

export interface OutlineSearchResult {
  document?: OutlineDocument;
  context?: string;
  ranking?: number;
  [key: string]: unknown;
}

export interface OutlineListResponse<T> {
  data?: T[];
  pagination?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OutlineApiEnvelope<T> {
  data?: T;
  [key: string]: unknown;
}
