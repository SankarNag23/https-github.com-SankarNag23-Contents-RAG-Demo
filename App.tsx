
import React, { useState, useRef, useCallback } from 'react';
import { 
  AppMode, 
  RagStep, 
  AgentStep,
  SqlStep, 
  Chunk 
} from './types';
import { 
  CODE_SNIPPETS, 
  MOCK_DB_SCHEMA 
} from './constants';
import { gemini } from './services/geminiService';
import { 
  FileText, 
  Search, 
  Box, 
  Cpu, 
  Play, 
  RefreshCw,
  Terminal,
  Layers,
  CheckCircle2,
  ChevronRight,
  Code2,
  Trash2,
  Sparkles,
  ShieldCheck,
  Zap,
  FileCode,
  Eye,
  EyeOff,
  Quote,
  X,
  SendHorizontal,
  FileUp,
  DatabaseZap,
  ChevronLast,
  Info,
  Clock,
  BrainCircuit,
  Workflow,
  Target,
  Glasses
} from 'lucide-react';

const SAMPLE_DOC = `The Future of AI Architecture Guidelines.
Rule 1: All documents must be split into chunks of 512 tokens or less to ensure context window compliance.
Rule 2: Semantic embeddings must be generated using high-dimensionality vector models (768+ dims).
Rule 3: Vector databases like Pinecone or Chroma should be used for indexing and fast metadata-filtered retrieval.
Rule 4: Grounding is mandatory. Every AI response must cite the specific source chunk to prevent hallucinations.
Rule 5: Hybrid search is recommended. Use a combination of BM25 and Vector search for the best results.
Rule 6: Privacy first. Ensure all sensitive data is redacted before chunking into the shared vector store.
Rule 7: Real-time updates. The vector index should be refreshed every 24 hours to include the latest corporate reports.`;

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DOCUMENT_RAG);
  const [ragStep, setRagStep] = useState<RagStep>(RagStep.IDLE);
  const [agentStep, setAgentStep] = useState<AgentStep>(AgentStep.IDLE);
  const [sqlStep, setSqlStep] = useState<SqlStep>(SqlStep.IDLE);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  
  // RAG State
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [chunks, setChunks] = useState<(Chunk & { metadata?: string; state: 'pending' | 'processed' | 'retrieved' })[]>([]);
  const [retrievedChunks, setRetrievedChunks] = useState<Chunk[]>([]);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [thoughts, setThoughts] = useState<string[]>([]);
  
  // SQL State
  const [sqlResult, setSqlResult] = useState<{ sql: string; explanation: string; results: any[] } | null>(null);
  const sqlResultRef = useRef<{ sql: string; explanation: string; results: any[] } | null>(null);

  const processingRef = useRef(false);

  const generateChunksLocally = (content: string, name: string) => {
    const chunkSize = 250;
    const overlap = 50;
    const generated: any[] = [];
    const safeContent = content || "";
    const step = Math.max(20, chunkSize - overlap);
    
    for (let i = 0; i < safeContent.length; i += step) {
      const text = safeContent.slice(i, i + chunkSize).trim();
      if (text.length > 5) {
        generated.push({
          id: (generated.length + 1).toString(),
          text: text,
          state: 'pending',
          metadata: `${name} • Segment ${generated.length + 1}`
        });
      }
      if (generated.length >= 100) break; 
    }
    return generated;
  };

  const performRetrieval = useCallback((currentQuery: string, currentChunks: typeof chunks) => {
    const q = currentQuery.toLowerCase();
    const keywords = q.split(/\W+/).filter(k => k.length > 2);
    const scored = currentChunks.map(c => {
      let score = 0;
      const text = c.text.toLowerCase();
      keywords.forEach(kw => { if (text.includes(kw)) score += 1.0; });
      if (q.includes('rule') && text.includes('rule')) score += 0.5;
      score += (Math.random() * 0.1);
      return { ...c, score };
    });
    const sorted = scored.sort((a, b) => (b.score || 0) - (a.score || 0));
    return sorted.slice(0, 5);
  }, []);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  /**
   * Transition logic for SQL Analyzer
   */
  const transitionSqlTo = async (targetStep: SqlStep) => {
    setIsProcessing(true);
    try {
      if (targetStep === SqlStep.PARSING) {
        setSqlStep(SqlStep.PARSING);
        setSqlResult(null);
        sqlResultRef.current = null;
        await delay(1200);
      }
      else if (targetStep === SqlStep.GENERATING_SQL) {
        setSqlStep(SqlStep.GENERATING_SQL);
        const activeQuery = query.trim() || "Show me revenue by region for 2024.";
        const res = await gemini.textToSql(activeQuery, JSON.stringify(MOCK_DB_SCHEMA));
        const newResult = { ...res, results: [] };
        sqlResultRef.current = newResult;
        setSqlResult(newResult);
        await delay(1200);
      }
      else if (targetStep === SqlStep.EXECUTING) {
        setSqlStep(SqlStep.EXECUTING);
        if (sqlResultRef.current) {
          const results = await gemini.simulateDatabaseQuery(sqlResultRef.current.sql);
          const updatedResult = { ...sqlResultRef.current, results };
          sqlResultRef.current = updatedResult;
          setSqlResult(updatedResult);
        }
        await delay(1500);
      }
      else if (targetStep === SqlStep.ANSWERING) {
        setSqlStep(SqlStep.ANSWERING);
        await delay(800);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSqlStep = async (auto: boolean = false) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsAutoMode(auto);
    try {
      let current = sqlStep;
      if (current === SqlStep.ANSWERING) {
        setSqlStep(SqlStep.IDLE);
        setSqlResult(null);
        sqlResultRef.current = null;
        current = SqlStep.IDLE;
      }
      let keepGoing = true;
      while (keepGoing) {
        let next = SqlStep.IDLE;
        switch (current) {
          case SqlStep.IDLE: next = SqlStep.PARSING; break;
          case SqlStep.PARSING: next = SqlStep.GENERATING_SQL; break;
          case SqlStep.GENERATING_SQL: next = SqlStep.EXECUTING; break;
          case SqlStep.EXECUTING: next = SqlStep.ANSWERING; break;
          default: next = SqlStep.IDLE;
        }
        await transitionSqlTo(next);
        current = next;
        await delay(200);
        if (!auto || current === SqlStep.ANSWERING) keepGoing = false;
      }
    } finally {
      processingRef.current = false;
      setIsAutoMode(false);
      setIsProcessing(false);
    }
  };

  /**
   * Transition logic for Agentic RAG
   */
  const transitionAgentTo = async (targetStep: AgentStep) => {
    setIsProcessing(true);
    try {
      if (targetStep === AgentStep.ANALYZING_TASK) {
        setAgentStep(AgentStep.ANALYZING_TASK);
        setThoughts(["Analyzing user intent...", "Detected question requiring specific document validation."]);
        await delay(1200);
      }
      else if (targetStep === AgentStep.PLANNING) {
        setAgentStep(AgentStep.PLANNING);
        setThoughts(prev => [...prev, "Plan: Invoke 'doc_search' tool to verify guidelines.", "Defining search parameters..."]);
        await delay(1200);
      }
      else if (targetStep === AgentStep.TOOL_EXECUTION) {
        setAgentStep(AgentStep.TOOL_EXECUTION);
        setThoughts(prev => [...prev, "Executing Tool: doc_search(query='Rule requirements')"]);
        const activeQuery = query.trim() || "Analyze Rule 2.";
        if (chunks.length === 0) {
           const localChunks = generateChunksLocally(fileContent || SAMPLE_DOC, fileName || 'System_Auto.pdf');
           setChunks(localChunks);
        }
        const localRetrieved = performRetrieval(activeQuery, chunks.length > 0 ? chunks : generateChunksLocally(SAMPLE_DOC, 'Auto.pdf'));
        setRetrievedChunks(localRetrieved);
        setChunks(prev => (prev.length > 0 ? prev : generateChunksLocally(SAMPLE_DOC, 'Auto.pdf')).map(c => ({
          ...c,
          state: localRetrieved.some(t => t.id === c.id) ? 'retrieved' as const : 'processed' as const
        })));
        await delay(1800);
      }
      else if (targetStep === AgentStep.REASONING) {
        setAgentStep(AgentStep.REASONING);
        setThoughts(prev => [...prev, "Comparing retrieved context with user constraints...", "Context found. Verifying grounding logic."]);
        await delay(1200);
      }
      else if (targetStep === AgentStep.SYNTHESIZING) {
        setAgentStep(AgentStep.SYNTHESIZING);
        setThoughts(prev => [...prev, "Finalizing answer with citations."]);
        const activeQuery = query.trim() || "Analyze Rule 2.";
        const response = await gemini.askWithContext(activeQuery, retrievedChunks);
        setAnswer(response);
        await delay(800);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAgentStep = async (auto: boolean = false) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsAutoMode(auto);
    try {
      let current = agentStep;
      if (current === AgentStep.SYNTHESIZING) {
        setAgentStep(AgentStep.IDLE);
        setThoughts([]);
        setAnswer('');
        current = AgentStep.IDLE;
      }
      let keepGoing = true;
      while (keepGoing) {
        let next = AgentStep.IDLE;
        switch (current) {
          case AgentStep.IDLE: next = AgentStep.ANALYZING_TASK; break;
          case AgentStep.ANALYZING_TASK: next = AgentStep.PLANNING; break;
          case AgentStep.PLANNING: next = AgentStep.TOOL_EXECUTION; break;
          case AgentStep.TOOL_EXECUTION: next = AgentStep.REASONING; break;
          case AgentStep.REASONING: next = AgentStep.SYNTHESIZING; break;
          default: next = AgentStep.IDLE;
        }
        await transitionAgentTo(next);
        current = next;
        await delay(200);
        if (!auto || current === AgentStep.SYNTHESIZING) keepGoing = false;
      }
    } finally {
      processingRef.current = false;
      setIsAutoMode(false);
      setIsProcessing(false);
    }
  };

  /**
   * Original RAG Logic
   */
  const transitionTo = async (targetStep: RagStep) => {
    setIsProcessing(true);
    try {
      if (targetStep === RagStep.UPLOADING) {
        setRagStep(RagStep.UPLOADING);
        await delay(1000);
      } 
      else if (targetStep === RagStep.CHUNKING) {
        setRagStep(RagStep.CHUNKING);
        const activeContent = fileContent || SAMPLE_DOC;
        const activeName = fileName || 'Visualizer_Demo.pdf';
        const localChunks = generateChunksLocally(activeContent, activeName);
        setChunks(localChunks);
        await delay(1200);
      }
      else if (targetStep === RagStep.EMBEDDING) {
        setRagStep(RagStep.EMBEDDING);
        setChunks(prev => prev.map(c => ({ ...c, state: 'processed' as const })));
        await delay(1200);
      }
      else if (targetStep === RagStep.STORING) {
        setRagStep(RagStep.STORING);
        await delay(1500);
      }
      else if (targetStep === RagStep.RETRIEVING) {
        setRagStep(RagStep.RETRIEVING);
        const activeQuery = query.trim() || "Summarize the key points.";
        const localRetrieved = performRetrieval(activeQuery, chunks);
        setRetrievedChunks(localRetrieved);
        setChunks(prev => prev.map(c => ({
          ...c,
          state: localRetrieved.some(t => t.id === c.id) ? 'retrieved' as const : 'processed' as const
        })));
        await delay(1500);
      }
      else if (targetStep === RagStep.GENERATING) {
        setRagStep(RagStep.GENERATING);
        const activeQuery = query.trim() || "Summarize the key points.";
        setAnswer("");
        const response = await gemini.askWithContext(activeQuery, retrievedChunks);
        setAnswer(response);
        await delay(800);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStep = async (auto: boolean = false) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsAutoMode(auto);
    try {
      let current = ragStep;
      if (current === RagStep.GENERATING) {
        setRagStep(RagStep.IDLE);
        current = RagStep.IDLE;
        await delay(100);
      }
      let keepGoing = true;
      while (keepGoing) {
        let next = RagStep.IDLE;
        switch (current) {
          case RagStep.IDLE: next = RagStep.UPLOADING; break;
          case RagStep.UPLOADING: next = RagStep.CHUNKING; break;
          case RagStep.CHUNKING: next = RagStep.EMBEDDING; break;
          case RagStep.EMBEDDING: next = RagStep.STORING; break;
          case RagStep.STORING: next = RagStep.RETRIEVING; break;
          case RagStep.RETRIEVING: next = RagStep.GENERATING; break;
          default: next = RagStep.IDLE;
        }
        await transitionTo(next);
        current = next;
        await delay(200);
        if (!auto || current === RagStep.GENERATING) keepGoing = false;
      }
    } finally {
      processingRef.current = false;
      setIsAutoMode(false);
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setRagStep(RagStep.IDLE);
    setAgentStep(AgentStep.IDLE);
    setSqlStep(SqlStep.IDLE);
    setChunks([]);
    setRetrievedChunks([]);
    setAnswer('');
    setThoughts([]);
    setSqlResult(null);
    sqlResultRef.current = null;
    setFileName('');
    setFileContent('');
    setIsAutoMode(false);
    setQuery('');
    setIsProcessing(false);
    processingRef.current = false;
  };

  const useSampleData = () => {
    resetAll();
    setFileName('AI_Architecture_Guidelines.pdf');
    setFileContent(SAMPLE_DOC);
    setQuery('Compare Rule 1 and Rule 2.');
  };

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetAll();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setFileContent(ev.target?.result as string); };
    reader.readAsText(file);
  };

  const getChunkStyle = (c: any) => {
    if (c.state === 'retrieved') return 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 z-10 shadow-lg';
    if (c.state === 'processed') return 'border-slate-200 bg-white opacity-95 shadow-sm';
    return 'border-slate-100 bg-slate-50 opacity-40 grayscale blur-[0.5px]';
  };

  const handleCommand = (auto: boolean) => {
    if (mode === AppMode.DOCUMENT_RAG) handleStep(auto);
    else if (mode === AppMode.AGENTIC_RAG) handleAgentStep(auto);
    else if (mode === AppMode.TEXT_TO_SQL) handleSqlStep(auto);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 selection:bg-indigo-100 font-inter">
      <header className="bg-white border-b px-8 py-5 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-100">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">RAG Ingestion Engine</h1>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded border ${fileName ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                {fileName || 'System Standby'}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => { setMode(AppMode.DOCUMENT_RAG); resetAll(); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${mode === AppMode.DOCUMENT_RAG ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <FileText className="w-4 h-4" /> Pipeline
          </button>
          <button 
            onClick={() => { setMode(AppMode.AGENTIC_RAG); resetAll(); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${mode === AppMode.AGENTIC_RAG ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <BrainCircuit className="w-4 h-4" /> Agentic RAG
          </button>
          <button 
            onClick={() => { setMode(AppMode.TEXT_TO_SQL); resetAll(); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${mode === AppMode.TEXT_TO_SQL ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <DatabaseZap className="w-4 h-4" /> SQL Analyzer
          </button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[24rem] bg-white border-r flex flex-col p-8 overflow-y-auto shrink-0 shadow-sm z-10">
          <div className="space-y-10">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Workflow Command</h3>
                <button onClick={resetAll} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleCommand(true)}
                  disabled={isProcessing}
                  className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl active:scale-[0.98]"
                >
                  {isProcessing && isAutoMode ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span className="tracking-widest uppercase text-[10px]">Run Loop</span>
                </button>

                <button 
                  onClick={() => handleCommand(false)}
                  disabled={isProcessing}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all border border-indigo-200 active:scale-[0.98]"
                >
                  {isProcessing && !isAutoMode ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronLast className="w-4 h-4" />}
                  <span className="tracking-widest uppercase text-[10px]">Next Phase</span>
                </button>
              </div>
            </section>

            <section className="space-y-8">
              {(mode === AppMode.DOCUMENT_RAG || mode === AppMode.AGENTIC_RAG) && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Knowledge Base</h3>
                    {!fileName && (
                      <button onClick={useSampleData} className="text-[10px] text-indigo-600 font-black hover:bg-indigo-50 px-2 py-1 rounded transition-colors border border-indigo-100 uppercase">Demo</button>
                    )}
                  </div>
                  
                  {fileName ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.5rem] flex items-center gap-4 animate-in slide-in-from-top-2 shadow-sm">
                      <div className="bg-emerald-500 p-3 rounded-xl text-white shadow-lg">
                        <FileCode className="w-6 h-6" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 truncate">{fileName}</p>
                      </div>
                    </div>
                  ) : (
                    <label className="group block w-full border-2 border-dashed border-slate-200 rounded-[1.5rem] p-10 transition-all text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30">
                      <input type="file" className="hidden" onChange={onFileUpload} />
                      <FileUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <span className="text-xs font-bold text-slate-400">Select Doc</span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Query Interface</h3>
                <div className="space-y-4">
                  <textarea 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={mode === AppMode.TEXT_TO_SQL ? "e.g. Total revenue by region..." : "Ask the AI agent..."}
                    className="w-full h-32 p-5 bg-slate-50 border rounded-[1.5rem] text-sm font-semibold border-slate-200 focus:border-indigo-400 focus:ring-8 focus:ring-indigo-50 outline-none resize-none shadow-inner"
                  />
                  {mode === AppMode.TEXT_TO_SQL && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-[10px] font-bold text-amber-600 flex gap-2">
                       <Info className="w-3.5 h-3.5 shrink-0" />
                       Schema context is automatically injected from the corporate report definition.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#F9FAFF] overflow-hidden">
          <div className="p-10 flex-1 overflow-y-auto space-y-10 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3 bg-white/80 p-5 rounded-[2.5rem] shadow-sm border border-slate-200/50 overflow-x-auto no-scrollbar backdrop-blur-md">
              {(() => {
                const allSteps = (
                  mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : 
                  mode === AppMode.AGENTIC_RAG ? Object.values(AgentStep) : 
                  Object.values(SqlStep)
                ) as string[];
                const currentStep = (
                  mode === AppMode.DOCUMENT_RAG ? ragStep : 
                  mode === AppMode.AGENTIC_RAG ? agentStep : 
                  sqlStep
                ) as string;
                const idleStep = (
                  mode === AppMode.DOCUMENT_RAG ? RagStep.IDLE : 
                  mode === AppMode.AGENTIC_RAG ? AgentStep.IDLE : 
                  SqlStep.IDLE
                ) as string;
                const visibleSteps = allSteps.filter(s => s !== idleStep);

                return visibleSteps.map((s, idx) => {
                  const isActive = currentStep === s;
                  const isPast = allSteps.indexOf(currentStep) > allSteps.indexOf(s);
                  return (
                    <React.Fragment key={s}>
                      <div className={`flex items-center gap-2.5 px-5 py-2.5 rounded-2xl whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'bg-slate-900 text-white shadow-xl' : isPast ? 'text-emerald-500 bg-emerald-50' : 'text-slate-300'}`}>
                        {isActive ? <Zap className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> : isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />}
                        {s.replace(/_/g, ' ')}
                      </div>
                      {idx < visibleSteps.length - 1 && <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />}
                    </React.Fragment>
                  );
                });
              })()}
            </div>

            <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-200/40 flex flex-col overflow-hidden min-h-[650px] relative">
              <div className="flex-1 p-10 flex flex-col">
                {mode === AppMode.AGENTIC_RAG ? (
                  <div className="h-full grid grid-cols-12 gap-10">
                    <div className="col-span-4 flex flex-col space-y-6">
                      <div className="flex items-center justify-between mb-2">
                         <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                            <Workflow className="w-5 h-5 text-indigo-600" /> Agent reasoning
                         </h3>
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 shadow-inner overflow-y-auto space-y-4">
                        {thoughts.map((thought, i) => (
                          <div key={i} className="flex gap-4 animate-in slide-in-from-left-4 fade-in duration-500">
                             <div className="mt-1"><Target className={`w-4 h-4 ${i === thoughts.length - 1 ? 'text-indigo-600' : 'text-slate-300'}`} /></div>
                             <p className={`text-xs font-bold leading-relaxed ${i === thoughts.length - 1 ? 'text-slate-900' : 'text-slate-400'}`}>{thought}</p>
                          </div>
                        ))}
                        {isProcessing && agentStep !== AgentStep.IDLE && (
                          <div className="flex gap-4 animate-pulse">
                            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                            <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">Thinking...</p>
                          </div>
                        )}
                        {thoughts.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale">
                             <BrainCircuit className="w-12 h-12 mb-4" />
                             <p className="text-[10px] font-black uppercase">Trace history empty</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-span-8 flex flex-col space-y-8">
                       <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col flex-1 relative overflow-hidden">
                          <div className="flex items-center justify-between mb-6">
                             <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-xl"><Glasses className="w-5 h-5 text-indigo-600" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Environment Observation</span>
                             </div>
                             <span className="bg-indigo-600 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase">Tool Output</span>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto pr-2 no-scrollbar">
                            {agentStep === AgentStep.IDLE && (
                               <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                                     <Play className="w-6 h-6 text-slate-300" />
                                  </div>
                                  <p className="text-sm font-bold text-slate-400">Launch agent to start retrieval loop</p>
                               </div>
                            )}

                            {agentStep !== AgentStep.IDLE && (
                              <div className="space-y-6">
                                 {retrievedChunks.length > 0 && (
                                    <div className="grid grid-cols-2 gap-4">
                                       {retrievedChunks.slice(0, 4).map(c => (
                                          <div key={c.id} className="p-4 bg-white border border-indigo-100 rounded-2xl shadow-sm text-[10px] font-bold text-slate-700 animate-in zoom-in-95">
                                             <div className="flex justify-between items-center mb-2">
                                                <span className="text-indigo-600">Fragment {c.id}</span>
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                             </div>
                                             <p className="line-clamp-2 italic opacity-60">"{c.text}"</p>
                                          </div>
                                       ))}
                                    </div>
                                 )}
                                 
                                 {answer && (
                                    <div className="p-8 bg-indigo-600 rounded-[2rem] text-white shadow-xl animate-in slide-in-from-bottom-8">
                                       <div className="flex items-center gap-3 mb-4">
                                          <Sparkles className="w-5 h-5" />
                                          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Synthesized Agent Response</span>
                                       </div>
                                       <p className="text-lg font-bold leading-relaxed tracking-tight">{answer}</p>
                                    </div>
                                 )}
                              </div>
                            )}
                          </div>
                       </div>
                    </div>
                  </div>
                ) : mode === AppMode.DOCUMENT_RAG ? (
                  <div className="h-full flex flex-col">
                    {ragStep === RagStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in">
                        <div className="w-28 h-28 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border border-slate-100 shadow-inner">
                          {fileName ? <CheckCircle2 className="w-12 h-12 text-emerald-500" /> : <Layers className="w-12 h-12 text-slate-200" />}
                        </div>
                        <div className="space-y-4">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Educational RAG Workflow</h2>
                          <p className="text-slate-400 max-w-sm mx-auto font-medium text-lg">Watch the linear pipeline from chunking to answer.</p>
                        </div>
                      </div>
                    )}

                    {ragStep !== RagStep.IDLE && (
                      <div className="flex flex-col h-full space-y-10">
                        <div>
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                              <Box className="w-5 h-5 text-indigo-300" /> Indexed Context: <span className="text-indigo-600 font-black">{fileName || 'Active'}</span>
                            </h3>
                            <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full">{chunks.length} Chunks</span>
                          </div>
                          
                          <div className="max-h-[350px] overflow-y-auto p-5 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 shadow-inner no-scrollbar">
                            <div className="grid grid-cols-3 gap-5">
                              {chunks.slice(0, 30).map((c) => (
                                <div key={c.id} className={`p-5 rounded-[1.5rem] border-2 text-[10.5px] leading-relaxed h-32 relative overflow-hidden transition-all duration-500 ${getChunkStyle(c)}`}>
                                  <div className="flex items-center justify-between mb-2.5">
                                    <div className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${c.state === 'retrieved' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>CHUNK {c.id}</div>
                                  </div>
                                  <span className={`font-semibold line-clamp-3 ${c.state === 'retrieved' ? 'text-slate-900' : 'text-slate-500'}`}>{c.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-inner overflow-y-auto">
                           {answer && <p className="text-lg font-bold text-slate-800 leading-relaxed">{answer}</p>}
                           {!answer && isProcessing && <p className="text-slate-400 animate-pulse font-black uppercase tracking-widest text-xs">Synthesizing...</p>}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col">
                    {sqlStep === SqlStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                        <div className="p-8 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner"><DatabaseZap className="w-20 h-20 text-slate-300" /></div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">SQL Interface Visualizer</h2>
                        <p className="text-slate-400 text-sm max-w-sm">Watch the process of translating natural language to schema-aware SQL queries.</p>
                      </div>
                    )}
                    {(sqlStep !== SqlStep.IDLE) && (
                      <div className="space-y-8 h-full flex flex-col">
                        <div className="bg-slate-900 rounded-[2.5rem] p-10 font-mono text-base text-indigo-400 border border-slate-800 shadow-2xl animate-in slide-in-from-top-4">
                          <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-8 text-[11px] text-slate-600 uppercase font-black">
                            <Terminal className="w-6 h-6" /> SQL Terminal Output
                          </div>
                          <div className={`min-h-[50px] text-xl font-black transition-all ${sqlStep === SqlStep.PARSING ? 'animate-pulse text-slate-700' : ''}`}>
                            {sqlResult?.sql || (sqlStep === SqlStep.PARSING ? "Parsing query against schema metadata..." : "Synthesizing SQL chain...")}
                          </div>
                          {sqlResult?.explanation && sqlStep === SqlStep.ANSWERING && (
                             <div className="mt-8 text-xs text-slate-500 font-bold leading-relaxed border-t border-slate-800 pt-8 italic">
                               💡 Explanation: {sqlResult.explanation}
                             </div>
                          )}
                        </div>
                        
                        <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col">
                          {sqlStep === SqlStep.EXECUTING && !sqlResult?.results?.length ? (
                             <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-slate-300">
                               <RefreshCw className="w-10 h-10 animate-spin" />
                               <span className="text-[10px] font-black uppercase tracking-widest">Querying Virtual Engine...</span>
                             </div>
                          ) : sqlResult?.results?.length ? (
                            <div className="overflow-auto flex-1 animate-in fade-in">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-black sticky top-0">
                                  <tr>{Object.keys(sqlResult.results[0] || {}).map(k => (<th key={k} className="px-8 py-5 uppercase tracking-widest text-[10px] border-b border-slate-100">{k}</th>))}</tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {sqlResult.results.map((row, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/10 transition-colors">
                                      {Object.values(row).map((v: any, j) => (<td key={j} className="px-8 py-5 text-slate-700 font-bold font-mono">{String(v)}</td>))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-300 text-[10px] font-black uppercase tracking-widest">
                               Database state idle
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-[#FAFBFD] border-t border-slate-100 px-10 py-8 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-xl text-slate-400 border border-slate-100 shadow-sm"><Code2 className="w-4 h-4" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logic Flow: {mode === AppMode.AGENTIC_RAG ? agentStep : mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep}</span>
                  </div>
                  {isProcessing && <div className="text-[9px] font-black text-indigo-500 uppercase animate-pulse">Running Task...</div>}
                </div>
                <pre className="code-font text-[10.5px] bg-white p-6 rounded-2xl border border-slate-200/50 overflow-x-auto text-slate-500 leading-relaxed mt-4 max-h-40 shadow-inner">
                  {mode === AppMode.AGENTIC_RAG ? CODE_SNIPPETS.AGENTIC :
                   mode === AppMode.DOCUMENT_RAG ? (
                    ragStep === RagStep.CHUNKING ? CODE_SNIPPETS.CHUNKING :
                    ragStep === RagStep.EMBEDDING ? CODE_SNIPPETS.EMBEDDING :
                    ragStep === RagStep.RETRIEVING || ragStep === RagStep.STORING ? CODE_SNIPPETS.RETRIEVAL :
                    ragStep === RagStep.GENERATING ? "// Final Inference Complete" : "// Engine idle."
                  ) : CODE_SNIPPETS.SQL_GEN}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t px-8 py-4 flex items-center justify-between text-[10px] text-slate-400 font-black uppercase tracking-widest shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`} />
            PROCESSOR: {mode}
          </div>
          <div className="flex items-center gap-2.5 text-indigo-600">
             CURRENT PHASE: <span className="bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">{
               mode === AppMode.DOCUMENT_RAG ? ragStep : 
               mode === AppMode.AGENTIC_RAG ? agentStep : 
               sqlStep
             }</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-slate-300">Grounding Kernel</span>
          <span className="text-indigo-500 font-black">V6.3-AGENTIC</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
