
export enum AppMode {
  DOCUMENT_RAG = 'DOCUMENT_RAG',
  TEXT_TO_SQL = 'TEXT_TO_SQL'
}

export enum RagStep {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  CHUNKING = 'CHUNKING',
  EMBEDDING = 'EMBEDDING',
  STORING = 'STORING',
  RETRIEVING = 'RETRIEVING',
  GENERATING = 'GENERATING'
}

export enum SqlStep {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  GENERATING_SQL = 'GENERATING_SQL',
  EXECUTING = 'EXECUTING',
  ANSWERING = 'ANSWERING'
}

export interface Chunk {
  id: string;
  text: string;
  score?: number;
}

export interface TableSchema {
  name: string;
  columns: { name: string; type: string; description: string }[];
}

export interface SqlResult {
  query: string;
  results: any[];
  explanation: string;
}
