
# Technical Deep Dive: RAG & SQL Explorer

## 🏗️ How the Code is Written (Architecture)

### 1. State Machine Orchestration
The app handles three distinct workflows:
- **Standard Pipeline**: A linear flow from ingestion to generation.
- **Agentic Loop**: A ReAct-style flow where an AI "reasons" before acting. Steps include `ANALYZING`, `PLANNING`, `TOOL_EXECUTION` (calling RAG), and `REASONING`.
- **Text-to-SQL**: A semantic mapping flow for structured databases.

### 2. Agentic Reasoning Visualization
The **Agentic RAG** tab introduces a **Thought Trace**. This simulates how an LLM agent uses "inner monologue" to handle complex queries. 
- **Tool Selection**: Unlike standard RAG where search is automatic, an Agent *decides* to invoke the search tool based on the user's prompt.
- **Grounding & Reflection**: The reasoning phase visualizes the agent checking its own tool output for factual correctness before answering.

## 🚀 How it Works (The Agentic Pipeline)

### 1. The Reasoning Loop
1. **Analyze**: The agent breaks down the query (e.g., "Compare X and Y").
2. **Plan**: It identifies that it lacks the data and creates a tool-call plan.
3. **Tool Execution**: It invokes the `doc_search` tool (our RAG retrieval engine).
4. **Observation**: It receives the chunks and highlights them in the UI.
5. **Synthesis**: It merges its own reasoning with the retrieved data for a multi-faceted answer.

---

## 🔧 Technical Implementation Details
- **Logic**: Built with React `useState` and `useRef` for thread-safe state transitions.
- **AI**: Powered by **Gemini 3 Flash & Pro** for high-quality grounded responses.
- **Citations**: Enforced through strict system prompting in the `GeminiService`.
