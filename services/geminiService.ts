
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

export class GeminiService {
  private getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async askWithContext(query: string, chunks: {id: string, text: string}[]): Promise<string> {
    const ai = this.getClient();
    
    // Formatting context with IDs for citation
    const context = chunks.map(c => `[Chunk #${c.id}]\n${c.text}`).join('\n\n---\n\n');
    
    const prompt = `SYSTEM: You are a helpful RAG (Retrieval-Augmented Generation) assistant. 
Your task is to answer the user's question using the provided document context below.

GROUNDING RULES:
1. Use the provided context to answer. If the context is partially relevant, provide the best possible answer from it.
2. If the answer is absolutely not in the context, politely state that the information isn't available in the document.
3. You MUST cite the Chunk ID (e.g., [Chunk #1]) for every piece of information used. Put the citation at the end of the sentence.
4. Keep the tone professional and concise.

CONTEXT:
${context}

USER QUESTION: 
${query}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    return response.text || "I was unable to synthesize a response from the document.";
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
