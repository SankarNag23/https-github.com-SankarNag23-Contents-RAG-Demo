
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

export class GeminiService {
  private getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async askWithContext(query: string, chunks: {id: string, text: string}[]): Promise<string> {
    const ai = this.getClient();
    
    // Formatting context with IDs for citation
    const context = chunks.map(c => `[Chunk #${c.id}]\n${c.text}`).join('\n\n---\n\n');
    
    const prompt = `SYSTEM: You are a strict RAG (Retrieval-Augmented Generation) assistant. 
Your task is to answer the user's question using ONLY the provided document context below. 

GROUNDING RULES:
1. If the answer is not contained within the provided context, say: "I'm sorry, but this information is not available in the uploaded document."
2. Do NOT use outside knowledge.
3. You MUST cite the Chunk ID (e.g., [Chunk #1]) at the end of every sentence or paragraph where you use information from that specific chunk.

CONTEXT:
${context}

USER QUESTION: 
${query}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    return response.text || "No response generated.";
  }

  async textToSql(query: string, schema: string): Promise<{ sql: string, explanation: string }> {
    const ai = this.getClient();
    const prompt = `Translate the user's natural language question into a standard SQL query based on the provided database schema. 
    Return the response in JSON format with 'sql' and 'explanation' fields.
    
    Schema:
    ${schema}
    
    User Question: ${query}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sql: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ['sql', 'explanation']
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      return { sql: 'SELECT * FROM table;', explanation: 'Failed to parse SQL response.' };
    }
  }

  async simulateDatabaseQuery(sql: string): Promise<any[]> {
    const ai = this.getClient();
    const prompt = `Act as a database engine. Given the SQL query: "${sql}", generate 5 rows of realistic mock data in JSON array format. Use the column names implied by the query.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    try {
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return [];
    }
  }
}

export const gemini = new GeminiService();
