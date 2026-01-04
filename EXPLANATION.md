# Technical Deep Dive: RAG & SQL Explorer

This application is an educational sandbox designed to visualize the internal "black box" of Retrieval-Augmented Generation (RAG) and Text-to-SQL workflows.

## 🏗️ How the Code is Written (Architecture)

### 1. The State Machine
The core of the application is built around two deterministic state machines defined in `types.ts`:
- **`RagStep`**: `IDLE -> UPLOADING -> CHUNKING -> EMBEDDING -> STORING -> RETRIEVING -> GENERATING`
- **`SqlStep`**: `IDLE -> PARSING -> GENERATING_SQL -> EXECUTING -> ANSWERING`

By treating the pipeline as a series of explicit states, the UI can precisely reflect which part of the "brain" is active at any moment.

### 2. Robust Pipeline Orchestration
The "Run Full Auto" feature uses an asynchronous loop inside `handleStep`. 
- **Mutex Pattern**: We use a `processingRef` (`useRef(false)`) to act as a "lock." This prevents the user from accidentally double-triggering the pipeline while it is already running, which would cause race conditions and UI flickering.
- **Yielding to Main Thread**: Between transitions, we use a `delay()` function. This isn't just for animation—it allows the browser to process UI renders between heavy asynchronous tasks, preventing the "Page Unresponsive" error.

### 3. Service Layer (`geminiService.ts`)
The application interacts with the **Gemini 3 Flash & Pro** models via the `@google/genai` SDK.
- **Context Injection**: The `askWithContext` method manually formats retrieved chunks into a clear, numbered prompt.
- **Strict Grounding**: The system prompt is engineered to enforce citations. It tells the model: *"You MUST cite the Chunk ID (e.g., [Chunk #1])."*

---

## 🚀 How it Works (The Pipeline)

### 1. Data Ingestion (Chunking & Embedding)
When a document is uploaded, the code doesn't send the whole thing to the AI at once.
- **Chunking**: It splits the text into small pieces (~250 characters). This is done locally to show users how "sliding windows" work.
- **Simulated Embedding**: In a real app, these are sent to an embedding model. Here, we mark them as "Processed" to visualize that they now have a mathematical representation.

### 2. The Vector Store (Storing)
The **"Storing"** step represents the data being saved into a Vector Database (like Pinecone or Chroma). 
- **Fix for "Stuck at Storing"**: We implemented a fallback query. If the user hasn't typed a question yet, the auto-pipeline injects a "Summarize" query so the visual flow can continue to the final generation phase without waiting for human input.

### 3. Semantic Retrieval
When you ask a question, the app performs a **Keyword + Semantic similarity search** in the frontend. It calculates a "Relevance Score" for every chunk. The top 5 highest-scoring chunks are "retrieved" and highlighted in indigo.

### 4. Grounded Generation (The Answer)
Finally, the question + the 5 retrieved chunks are sent to Gemini.
- **Fix for "Information not available"**: We updated the `GeminiService` instructions to be more "intelligent." Instead of a hard "No," the model is encouraged to provide the best possible answer using the partial fragments provided, while still maintaining high factual integrity through citations.

---

## 🔧 Technical Implementation Details
- **Styling**: Tailwind CSS with custom animations (e.g., `animate-in fade-in`).
- **Icons**: Lucide-React for clear visual metaphors (Zap for active, Shield for grounded).
- **Mocking**: The SQL engine uses Gemini to *generate* its own mock data rows, making the visualization feel dynamic and real without needing a backend server.
