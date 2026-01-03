
import React from 'react';
import { TableSchema } from './types';

export const MOCK_DB_SCHEMA: TableSchema[] = [
  {
    name: 'corporate_reports',
    columns: [
      { name: 'report_id', type: 'UUID', description: 'Primary Key' },
      { name: 'year', type: 'INT', description: 'Fiscal Year' },
      { name: 'revenue', type: 'DECIMAL', description: 'Total Revenue' },
      { name: 'net_income', type: 'DECIMAL', description: 'Profit after taxes' },
      { name: 'region', type: 'STRING', description: 'Global region' }
    ]
  },
  {
    name: 'document_metadata',
    columns: [
      { name: 'doc_id', type: 'UUID', description: 'Link to RAG store' },
      { name: 'author', type: 'STRING', description: 'Content creator' },
      { name: 'last_updated', type: 'TIMESTAMP', description: 'Version control' }
    ]
  }
];

export const CODE_SNIPPETS = {
  CHUNKING: `from langchain.text_splitter import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=64,
    separators=["\\n\\n", "\\n", " ", ""]
)
chunks = text_splitter.split_text(raw_document)`,

  EMBEDDING: `from langchain_google_genai import GoogleGenerativeAIEmbeddings

embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")
vector_dims = 768  # Dimensionality of the vector space
vector_data = embeddings.embed_documents(chunks)`,

  RETRIEVAL: `from langchain_community.vectorstores import FAISS

# Initialize Vector Index
db = FAISS.from_documents(chunks, embeddings)

# Perform Semantic Similarity Search
retrieved_docs = db.similarity_search_with_relevance_scores(
    query, 
    k=3, 
    score_threshold=0.8
)`,

  SQL_GEN: `from langchain.chains import create_sql_query_chain

# System leverages RAG-retrieved Schema context to generate SQL
chain = create_sql_query_chain(llm, db)
sql_query = chain.invoke({"question": user_query})
# Executes: SELECT SUM(revenue) FROM sales WHERE region = 'West'`
};
