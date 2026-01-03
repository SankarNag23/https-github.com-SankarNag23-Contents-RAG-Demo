
import React, { useState, useRef, useCallback } from 'react';
import { 
  AppMode, 
  RagStep, 
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
  Clock
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
  
  // SQL State
  const [sqlResult, setSqlResult] = useState<{ sql: string; explanation: string; results: any[] } | null>(null);

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
      
      // Better matching logic
      keywords.forEach(kw => {
        if (text.includes(kw)) score += 1.0;
      });
      
      // Bias towards "rule" if the query asks for one
      if (q.includes('rule') && text.includes('rule')) score += 0.5;
      
      // Random jitter to simulate vector distance variation
      score += (Math.random() * 0.1);
      
      return { ...c, score };
    });

    const sorted = scored.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // Ensure we always return at least the top 3 most relevant chunks to prevent "I'm sorry"
    return sorted.slice(0, 5);
  }, []);

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  /**
   * Internal transition handler with increased delays for clarity
   */
  const transitionTo = async (targetStep: RagStep) => {
    setIsProcessing(true);
    try {
      if (targetStep === RagStep.UPLOADING) {
        setRagStep(RagStep.UPLOADING);
        await delay(1000); // Slower for visibility
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
        // Animate chunks processing for visual feedback
        setChunks(prev => prev.map(c => ({ ...c, state: 'processed' as const })));
        await delay(1200);
      }
      else if (targetStep === RagStep.STORING) {
        setRagStep(RagStep.STORING);
        await delay(1500); // The critical "storing" step needs to be visible
      }
      else if (targetStep === RagStep.RETRIEVING) {
        setRagStep(RagStep.RETRIEVING);
        const activeQuery = query.trim() || "Provide a summary of the main points in this document.";
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
        const activeQuery = query.trim() || "Provide a summary of the main points in this document.";
        // Clear old answer to show "Synthesizing"
        setAnswer("");
        const response = await gemini.askWithContext(activeQuery, retrievedChunks);
        setAnswer(response);
        await delay(800);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Main Pipeline orchestrator
   * Fixed "stuck" by adding extra yields (delays) and robust state tracking
   */
  const handleStep = async (auto: boolean = false) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsAutoMode(auto);

    try {
      let current = ragStep;
      let keepGoing = true;

      // Reset if we completed a full cycle previously
      if (current === RagStep.GENERATING) {
        setRagStep(RagStep.IDLE);
        current = RagStep.IDLE;
        await delay(100);
      }

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

        // Perform the state transition
        await transitionTo(next);
        current = next;

        // Force yield to main thread to ensure UI updates
        await delay(200);

        // Break if manual mode
        if (!auto) {
          keepGoing = false;
        }
        
        // Break if we finished generation
        if (current === RagStep.GENERATING) {
          keepGoing = false;
          setIsAutoMode(false);
        }
      }
    } catch (err) {
      console.error("Pipeline interrupted:", err);
    } finally {
      processingRef.current = false;
      setIsAutoMode(false);
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setRagStep(RagStep.IDLE);
    setSqlStep(SqlStep.IDLE);
    setChunks([]);
    setRetrievedChunks([]);
    setAnswer('');
    setSqlResult(null);
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
    setQuery('Explain Rule 4.');
  };

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetAll();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleSqlVisualizer = async () => {
    if (!query) return;
    setIsProcessing(true);
    setSqlStep(SqlStep.PARSING);
    const res = await gemini.textToSql(query, JSON.stringify(MOCK_DB_SCHEMA));
    setSqlStep(SqlStep.GENERATING_SQL);
    const results = await gemini.simulateDatabaseQuery(res.sql);
    setSqlResult({ ...res, results });
    setSqlStep(SqlStep.ANSWERING);
    setIsProcessing(false);
  };

  const getChunkStyle = (c: typeof chunks[0]) => {
    if (c.state === 'retrieved') {
      const idx = retrievedChunks.findIndex(rc => rc.id === c.id);
      if (idx === 0) return 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 z-10 scale-[1.02] shadow-lg shadow-amber-100';
      return 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 z-10';
    }
    if (c.state === 'processed') return 'border-slate-200 bg-white opacity-95 shadow-sm';
    return 'border-slate-100 bg-slate-50 opacity-40 grayscale blur-[0.5px]';
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
            <FileText className="w-4 h-4" /> Pipeline Visualizer
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
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Pipeline Control</h3>
                <button onClick={resetAll} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleStep(true)}
                  disabled={isProcessing}
                  className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl active:scale-[0.98]"
                >
                  {isProcessing && isAutoMode ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span className="tracking-widest uppercase text-[10px]">Run Full Auto</span>
                </button>

                <button 
                  onClick={() => handleStep(false)}
                  disabled={isProcessing}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all border border-indigo-200 active:scale-[0.98]"
                >
                  {isProcessing && !isAutoMode ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronLast className="w-4 h-4" />}
                  <span className="tracking-widest uppercase text-[10px]">Next Phase</span>
                </button>
              </div>
              
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">Visualization speed slowed for clarity</span>
              </div>
            </section>

            {mode === AppMode.DOCUMENT_RAG && (
              <section className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">1. Data Ingestion</h3>
                    {!fileName && (
                      <button onClick={useSampleData} className="text-[10px] text-indigo-600 font-black hover:bg-indigo-50 px-2 py-1 rounded transition-colors border border-indigo-100 uppercase">Load Demo</button>
                    )}
                  </div>
                  
                  {fileName ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[1.5rem] flex items-center gap-4 animate-in slide-in-from-top-2 shadow-sm">
                      <div className="bg-emerald-500 p-3 rounded-xl text-white shadow-lg">
                        <FileCode className="w-6 h-6" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Active Context</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{fileName}</p>
                      </div>
                      <button onClick={resetAll} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="group block w-full border-2 border-dashed border-slate-200 rounded-[1.5rem] p-10 transition-all duration-300 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30">
                      <input type="file" className="hidden" onChange={onFileUpload} accept=".txt,.md,.pdf" />
                      <FileUp className="w-10 h-10 text-slate-200 mx-auto mb-3 group-hover:text-indigo-400 transition-all" />
                      <span className="text-xs font-bold text-slate-400 block leading-relaxed">Select Document</span>
                    </label>
                  )}
                </div>

                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">2. Interaction</h3>
                  <div className="space-y-4">
                    <div className="relative">
                      <textarea 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask anything about the context..."
                        className={`w-full h-32 p-5 bg-slate-50 border rounded-[1.5rem] text-sm font-semibold transition-all outline-none resize-none shadow-inner ${ragStep === RagStep.STORING && !query ? 'border-amber-400 ring-4 ring-amber-50' : 'border-slate-200 focus:border-indigo-400 focus:ring-8 focus:ring-indigo-50'}`}
                      />
                      <Search className="absolute bottom-5 right-5 text-slate-300 w-4 h-4" />
                    </div>
                    {ragStep === RagStep.STORING && !query && (
                      <div className="flex items-start gap-2 text-[10px] text-amber-600 font-bold bg-amber-50 p-3 rounded-xl border border-amber-100">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        Index complete. Type a question to proceed to Retrieval.
                      </div>
                    )}
                    <button 
                      onClick={() => handleStep(true)}
                      disabled={isProcessing || ragStep === RagStep.IDLE}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 text-[11px] uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                    >
                      <SendHorizontal className="w-4 h-4" />
                      Inference
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#F9FAFF] overflow-hidden">
          <div className="p-10 flex-1 overflow-y-auto space-y-10 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3 bg-white/80 p-5 rounded-[2.5rem] shadow-sm border border-slate-200/50 overflow-x-auto no-scrollbar backdrop-blur-md">
              {(() => {
                const allSteps = (mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep)) as string[];
                const currentStep = (mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep) as string;
                const idleStep = (mode === AppMode.DOCUMENT_RAG ? RagStep.IDLE : SqlStep.IDLE) as string;
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
                {mode === AppMode.DOCUMENT_RAG && (
                  <div className="h-full flex flex-col">
                    {ragStep === RagStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in">
                        <div className="w-28 h-28 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border border-slate-100 shadow-inner">
                          {fileName ? <CheckCircle2 className="w-12 h-12 text-emerald-500" /> : <Layers className="w-12 h-12 text-slate-200" />}
                        </div>
                        <div className="space-y-4">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                            {fileName ? `${fileName} Ready` : 'Educational RAG Workflow'}
                          </h2>
                          <p className="text-slate-400 max-w-sm mx-auto font-medium text-lg leading-relaxed">
                            {fileName ? 'Document loaded. Use "Run Full Auto" to watch the entire process, or "Next Phase" to go step-by-step.' : 'Start by uploading a document to explore how modern LLMs use context window retrieval.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {ragStep !== RagStep.IDLE && (
                      <div className="flex flex-col h-full space-y-10">
                        <div>
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                              {ragStep === RagStep.RETRIEVING || ragStep === RagStep.GENERATING ? <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" /> : <Box className="w-5 h-5 text-indigo-300" />}
                              Vector Storage Index: <span className="text-indigo-600 font-black">{fileName || 'Processing...'}</span>
                            </h3>
                            <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full border border-slate-100">{chunks.length} Semantic Chunks</span>
                          </div>
                          
                          <div className="max-h-[350px] overflow-y-auto p-5 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 shadow-inner no-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                              {chunks.slice(0, 60).map((c) => (
                                <div 
                                  key={c.id} 
                                  className={`p-5 rounded-[1.5rem] border-2 text-[10.5px] leading-relaxed h-32 relative overflow-hidden transition-all duration-500 ${getChunkStyle(c)} ${answer.includes(`[Chunk #${c.id}]`) ? 'ring-4 ring-indigo-400/20 scale-[1.01]' : ''}`}
                                >
                                  <div className="flex items-center justify-between mb-2.5">
                                    <div className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase ${c.state === 'retrieved' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>CHUNK {c.id}</div>
                                    {answer.includes(`[Chunk #${c.id}]`) && <Quote className="w-3.5 h-3.5 text-indigo-600" />}
                                  </div>
                                  <span className={`font-semibold line-clamp-3 transition-colors ${c.state === 'retrieved' ? 'text-slate-900' : 'text-slate-500'}`}>{c.text}</span>
                                  <div className="absolute bottom-3 left-5 right-5 text-[8.5px] font-black text-slate-300 uppercase truncate">
                                    {c.state === 'pending' ? 'Unprocessed' : c.state === 'processed' ? 'Vector Ready' : 'Semantic Hit'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 bg-gradient-to-b from-slate-50/50 to-white rounded-[2.5rem] border border-slate-100 p-8 relative overflow-hidden shadow-inner">
                          {ragStep === RagStep.STORING && (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in zoom-in-95">
                              <div className="bg-emerald-50 text-emerald-600 p-5 rounded-full border border-emerald-100 shadow-sm">
                                <CheckCircle2 className="w-12 h-12" />
                              </div>
                              <h4 className="text-2xl font-black text-slate-800 tracking-tight">Knowledge Indexed</h4>
                              <p className="text-slate-500 text-sm max-w-sm font-medium leading-relaxed">The document has been fully vectorized and stored in the index. The system can now perform similarity search based on your question.</p>
                              {!query && (
                                <div className="pt-4 flex items-center gap-3 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 animate-pulse">
                                  <Info className="w-4 h-4" />
                                  <span className="text-[11px] font-black uppercase tracking-widest">Input a query to begin inference</span>
                                </div>
                              )}
                            </div>
                          )}

                          {ragStep === RagStep.RETRIEVING && (
                             <div className="space-y-8 max-w-2xl mx-auto animate-in slide-in-from-bottom-6">
                                <div className="flex items-center gap-5 p-6 bg-white rounded-[2.5rem] border border-slate-200 shadow-xl">
                                  <div className="bg-slate-900 p-4 rounded-2xl text-white"><Search className="w-6 h-6" /></div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Retrieval Stage</p>
                                    <p className="text-xl font-bold text-slate-800 tracking-tight italic line-clamp-1">"{query || 'Summarization request'}"</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-5">
                                  {retrievedChunks.slice(0, 3).map((rc, i) => (
                                    <div key={i} className={`p-5 rounded-[1.5rem] border-2 font-bold transition-all bg-white border-slate-200 shadow-sm`}>
                                      <div className="flex justify-between items-center mb-3 text-[10px] uppercase tracking-widest">
                                        <span>Relevance</span>
                                        <span className="font-black text-indigo-600">{(rc.score || 0).toFixed(2)}</span>
                                      </div>
                                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full bg-indigo-500 transition-all duration-500`} style={{width: `${Math.min(100, (rc.score || 0) * 100)}%`}} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                             </div>
                          )}

                          {ragStep === RagStep.GENERATING && (
                            <div className="flex flex-col h-full animate-in fade-in">
                              <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4 p-4 bg-white rounded-3xl border border-slate-200/50 shadow-sm">
                                  <div className="bg-indigo-600 p-2.5 rounded-xl text-white"><Cpu className="w-5 h-5" /></div>
                                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Grounded Synthesis</span>
                                </div>

                                <button 
                                  onClick={() => setShowPrompt(!showPrompt)}
                                  className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${showPrompt ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                                >
                                  {showPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  {showPrompt ? 'Hide Debug' : 'View Injected Prompt'}
                                </button>
                              </div>

                              <div className="flex-1 relative">
                                {showPrompt ? (
                                  <div className="absolute inset-0 bg-slate-900 rounded-[2.5rem] p-10 font-mono text-xs text-indigo-300 overflow-y-auto leading-relaxed border-4 border-indigo-900 shadow-2xl">
                                    <div className="mb-6 pb-6 border-b border-slate-800 text-slate-500 uppercase tracking-widest font-black text-[9px]">Instruction Set + Context Fragments</div>
                                    {retrievedChunks.map(rc => `[Fragment #${rc.id}]: ${rc.text}`).join('\n\n')}
                                    <div className="mt-6 pt-6 border-t border-slate-800">
                                      <span className="text-emerald-400">Question:</span> {query || "Default summary request."}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200/40 shadow-inner h-full overflow-y-auto">
                                    <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-bold text-xl tracking-tight">
                                      {answer || "Synthesizing answer from retrieved fragments..."}
                                    </div>
                                    {answer && (
                                      <div className="mt-8 pt-8 border-t border-slate-100 flex items-center gap-3">
                                        <ShieldCheck className="w-6 h-6 text-emerald-500" />
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Answer grounded and cited from source context.</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mode === AppMode.TEXT_TO_SQL && (
                  <div className="h-full flex flex-col animate-in fade-in">
                    {sqlStep === SqlStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                        <div className="p-8 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner">
                          <DatabaseZap className="w-20 h-20 text-slate-300" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">SQL Interface Visualizer</h2>
                        <button 
                          onClick={handleSqlVisualizer}
                          className="bg-indigo-600 text-white font-black py-4 px-10 rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-95"
                        >
                          Convert to SQL
                        </button>
                      </div>
                    )}
                    
                    {(sqlStep !== SqlStep.IDLE) && (
                      <div className="space-y-8 h-full flex flex-col">
                        <div className="bg-slate-900 rounded-[2.5rem] p-10 font-mono text-base text-indigo-400 border border-slate-800 shadow-2xl">
                          <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-8 text-[11px] text-slate-600 uppercase font-black">
                            <Terminal className="w-6 h-6" /> SQL Terminal Output
                          </div>
                          <div className="min-h-[50px] text-xl font-black">
                            {sqlResult?.sql || "Generating semantic SQL plan..."}
                          </div>
                        </div>

                        {sqlResult?.results && (
                          <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-500 font-black">
                                <tr>
                                  {Object.keys(sqlResult.results[0] || {}).map(k => (
                                    <th key={k} className="px-8 py-5 uppercase tracking-widest text-[10px] border-b border-slate-100">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {sqlResult.results.map((row, i) => (
                                  <tr key={i} className="hover:bg-indigo-50/10 transition-colors">
                                    {Object.values(row).map((v: any, j) => (
                                      <td key={j} className="px-8 py-5 text-slate-700 font-bold font-mono">{String(v)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-[#FAFBFD] border-t border-slate-100 px-10 py-8 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-xl text-slate-400 border border-slate-100 shadow-sm"><Code2 className="w-4 h-4" /></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logic Flow: {ragStep}</span>
                  </div>
                  {isProcessing && <div className="text-[9px] font-black text-indigo-500 uppercase animate-pulse">Running Task...</div>}
                </div>
                <pre className="code-font text-[10.5px] bg-white p-6 rounded-2xl border border-slate-200/50 overflow-x-auto text-slate-500 leading-relaxed mt-4 max-h-40 shadow-inner">
                  {mode === AppMode.DOCUMENT_RAG ? (
                    ragStep === RagStep.CHUNKING ? CODE_SNIPPETS.CHUNKING :
                    ragStep === RagStep.EMBEDDING ? CODE_SNIPPETS.EMBEDDING :
                    ragStep === RagStep.RETRIEVING || ragStep === RagStep.STORING ? CODE_SNIPPETS.RETRIEVAL :
                    ragStep === RagStep.GENERATING ? "// Final Inference Complete\n// Citations generated for each sentence." :
                    "// Core pipeline ready."
                  ) : (
                    CODE_SNIPPETS.SQL_GEN
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t px-8 py-4 flex items-center justify-between text-[10px] text-slate-400 font-black uppercase tracking-widest shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-slate-200'}`} />
            PROCESSOR: {mode}
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2.5 text-indigo-600">
             CURRENT PHASE: <span className="bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">{mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-slate-300">Grounding Kernel</span>
          <span className="text-indigo-500 font-black">V6.2-EXPLAINABLE</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
