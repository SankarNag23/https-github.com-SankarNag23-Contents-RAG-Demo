
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

export class GeminiService {
  // Use process.env.API_KEY directly as per guidelines
  private getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async askWithContext(query: string, chunks: string[]): Promise<string> {
    const ai = this.getClient();
    const context = chunks.join('\n\n');
    const prompt = `Use the following context to answer the query. If the answer isn't in the context, say you don't know.\n\nContext:\n${context}\n\nQuery: ${query}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    // .text is a property, not a method
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
