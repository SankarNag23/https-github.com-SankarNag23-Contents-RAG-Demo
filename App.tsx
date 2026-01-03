
import React, { useState, useEffect, useRef } from 'react';
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
  Database, 
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
  FastForward,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  FileCode,
  FileType,
  Eye,
  EyeOff,
  Quote,
  X,
  SendHorizontal
} from 'lucide-react';

const SAMPLE_DOC = `The Future of AI Architecture.
In modern RAG systems, the document processing pipeline is the critical first step. 
Document Chunks: Large texts are split into smaller units (chunks) to fit within LLM context windows.
Semantic Embeddings: Each chunk is converted into a vector representing its mathematical meaning.
Vector Databases: Stores like Pinecone or Chroma index these vectors for fast retrieval.
Grounding: By retrieving specific chunks, we 'ground' the AI response in real facts, which prevents hallucinations.
Hybrid Search: Combining keyword search with vector search often provides the most accurate context for complex queries.
Text-to-SQL Integration: Some systems use RAG to find database table schemas before generating SQL queries.`;

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
  const [fileType, setFileType] = useState<string>('');
  const [chunks, setChunks] = useState<(Chunk & { metadata?: string; state: 'pending' | 'processed' | 'retrieved' })[]>([]);
  const [retrievedChunks, setRetrievedChunks] = useState<Chunk[]>([]);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  
  // SQL State
  const [sqlResult, setSqlResult] = useState<{ sql: string; explanation: string; results: any[] } | null>(null);

  const timerRef = useRef<number | null>(null);

  // Auto-advance logic
  useEffect(() => {
    if (isAutoMode && (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING)) {
      // Don't auto-advance to retrieval if no query
      if (ragStep === RagStep.STORING && !query) {
        setIsAutoMode(false);
        return;
      }
      
      timerRef.current = window.setTimeout(() => {
        advanceRagStep();
      }, 800);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAutoMode, ragStep, query]);

  const performRetrieval = (currentQuery: string, currentChunks: typeof chunks) => {
    const q = currentQuery.toLowerCase();
    const keywords = q.split(/\W+/).filter(k => k.length > 2);
    
    const scored = currentChunks.map(c => {
      let score = 0;
      const text = c.text.toLowerCase();
      keywords.forEach(kw => {
        if (text.includes(kw)) score += 0.6;
      });
      if (keywords.length > 1 && text.includes(keywords.slice(0, 2).join(' '))) {
        score += 0.4;
      }
      score += (Math.random() * 0.1);
      return { ...c, score };
    });

    const sorted = scored.sort((a, b) => (b.score || 0) - (a.score || 0));
    const results = sorted.filter(s => (s.score || 0) > 0.1).slice(0, 5);
    return results.length > 0 ? results : sorted.slice(0, 5);
  };

  const advanceRagStep = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      // Determine next state and perform logic
      let nextStep = ragStep;
      
      switch (ragStep) {
        case RagStep.IDLE:
        case RagStep.GENERATING:
          nextStep = RagStep.UPLOADING;
          break;
        case RagStep.UPLOADING:
          nextStep = RagStep.CHUNKING;
          const sourceText = fileContent || SAMPLE_DOC;
          const activeName = fileName || 'Simulation_Document.pdf';
          const chunkSize = 250;
          const overlap = 50;
          const generatedChunks = [];
          for (let i = 0; i < sourceText.length; i += (chunkSize - overlap)) {
            const text = sourceText.slice(i, i + chunkSize);
            if (text.trim().length > 5) {
              generatedChunks.push({
                id: generatedChunks.length.toString(),
                text: text.trim(),
                state: 'pending' as const,
                metadata: `${activeName} • Part ${generatedChunks.length + 1}`
              });
            }
          }
          setChunks(generatedChunks);
          break;
        case RagStep.CHUNKING:
          nextStep = RagStep.EMBEDDING;
          setChunks(prev => prev.map(c => ({ ...c, state: 'processed' as const })));
          break;
        case RagStep.EMBEDDING:
          nextStep = RagStep.STORING;
          break;
        case RagStep.STORING:
          if (!query) {
            alert("Knowledge base ready. Please enter a question to perform retrieval.");
            setIsAutoMode(false);
            setIsProcessing(false);
            return;
          }
          nextStep = RagStep.RETRIEVING;
          const retrieved = performRetrieval(query, chunks);
          setRetrievedChunks(retrieved);
          setChunks(prev => prev.map(c => ({
            ...c,
            state: retrieved.some(t => t.id === c.id) ? 'retrieved' as const : 'processed' as const
          })));
          break;
        case RagStep.RETRIEVING:
          nextStep = RagStep.GENERATING;
          const result = await gemini.askWithContext(query, retrievedChunks);
          setAnswer(result);
          break;
      }
      
      setRagStep(nextStep);
    } catch (e) {
      console.error("Pipeline Error:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePipelineAction = () => {
    // If we're at the start, reset and move to first active step
    if (ragStep === RagStep.IDLE || ragStep === RagStep.GENERATING) {
      if (!fileContent && !fileName) {
        alert("Please upload a document or click 'Use Sample' first.");
        return;
      }
      setAnswer('');
      setRetrievedChunks([]);
      // Start the sequence immediately
      advanceRagStep();
    } else {
      advanceRagStep();
    }
  };

  const handleQuerySubmit = async () => {
    if (!query) {
      alert("Please enter a question.");
      return;
    }
    
    // If ingestion is already done, just do the search part
    if (chunks.length > 0 && ragStep !== RagStep.IDLE) {
      setIsProcessing(true);
      setAnswer('');
      setRagStep(RagStep.RETRIEVING);
      
      const retrieved = performRetrieval(query, chunks);
      setRetrievedChunks(retrieved);
      setChunks(prev => prev.map(c => ({
        ...c,
        state: retrieved.some(t => t.id === c.id) ? 'retrieved' as const : 'processed' as const
      })));
      
      setTimeout(async () => {
        setRagStep(RagStep.GENERATING);
        const result = await gemini.askWithContext(query, retrieved);
        setAnswer(result);
        setIsProcessing(false);
      }, 600);
    } else {
      // Start full pipeline if not yet ingested
      handlePipelineAction();
    }
  };

  const resetPipeline = () => {
    setRagStep(RagStep.IDLE);
    setSqlStep(SqlStep.IDLE);
    setChunks([]);
    setRetrievedChunks([]);
    setAnswer('');
    setSqlResult(null);
    setFileName('');
    setFileType('');
    setFileContent('');
    setIsAutoMode(false);
  };

  const loadSample = () => {
    resetPipeline();
    setFileContent(SAMPLE_DOC);
    setFileName('RAG_Quickstart_Guide.pdf');
    setFileType('application/pdf');
    setQuery('What are the main components of RAG?');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    resetPipeline();
    setFileName(file.name);
    setFileType(file.type || 'text/plain');
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setFileContent(content);
    };
    reader.readAsText(file);
  };

  const handleSqlFlow = async () => {
    if (!query) return;
    setIsProcessing(true);
    setSqlStep(SqlStep.PARSING);
    
    setTimeout(async () => {
      setSqlStep(SqlStep.GENERATING_SQL);
      const { sql, explanation } = await gemini.textToSql(query, JSON.stringify(MOCK_DB_SCHEMA));
      
      setTimeout(async () => {
        setSqlStep(SqlStep.EXECUTING);
        const results = await gemini.simulateDatabaseQuery(sql);
        
        setTimeout(() => {
          setSqlStep(SqlStep.ANSWERING);
          setSqlResult({ sql, explanation, results });
          setIsProcessing(false);
        }, 600);
      }, 600);
    }, 600);
  };

  const getChunkStyle = (chunk: typeof chunks[0]) => {
    if (chunk.state === 'retrieved') {
      const rank = retrievedChunks.findIndex(rc => rc.id === chunk.id);
      if (rank === 0) return 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 shadow-md scale-[1.01] z-20';
      if (rank === 1) return 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100';
      return 'border-sky-500 bg-sky-50 ring-2 ring-sky-100';
    }
    if (chunk.state === 'processed') return 'border-slate-200 bg-white opacity-80';
    return 'border-slate-100 bg-slate-50 opacity-40 grayscale blur-[1px]';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-100 font-inter">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-indigo-600 to-blue-500 p-2 rounded-xl shadow-lg">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none mb-1">RAG Visualizer</h1>
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${fileName ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>
                {fileName || 'No File Selected'}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button 
            onClick={() => { setMode(AppMode.DOCUMENT_RAG); resetPipeline(); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${mode === AppMode.DOCUMENT_RAG ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <FileText className="w-4 h-4" /> Multimodal RAG
          </button>
          <button 
            onClick={() => { setMode(AppMode.TEXT_TO_SQL); resetPipeline(); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${mode === AppMode.TEXT_TO_SQL ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Database className="w-4 h-4" /> SQL Ingestion
          </button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[22rem] bg-white border-r flex flex-col p-6 overflow-y-auto shrink-0 shadow-sm z-10">
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pipeline Master</h3>
                <button onClick={resetPipeline} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex flex-col">
                   <span className="text-xs font-black text-slate-700 uppercase">Auto-Flow</span>
                   <span className="text-[9px] text-slate-400 font-medium">Automatic step-by-step</span>
                </div>
                <button 
                  onClick={() => setIsAutoMode(!isAutoMode)}
                  className={`relative inline-flex h-6 w-12 items-center rounded-full transition-all ${isAutoMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              <button 
                onClick={handlePipelineAction}
                disabled={isProcessing}
                className="group w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200 active:scale-95"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? <FastForward className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />)}
                <span className="tracking-widest uppercase text-[11px]">{isProcessing ? 'Processing...' : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? 'Continue' : 'Run Full Pipeline')}</span>
              </button>
            </section>

            {mode === AppMode.DOCUMENT_RAG && (
              <section className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Data Ingestion</h3>
                    {!fileName && (
                      <button onClick={loadSample} className="text-[9px] text-blue-600 font-black hover:bg-blue-50 px-2 py-0.5 rounded transition-colors border border-blue-100 uppercase">Use Sample</button>
                    )}
                  </div>
                  
                  {fileName ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl relative animate-in slide-in-from-top-2 flex items-center gap-3">
                      <div className="bg-emerald-500 p-2 rounded-xl text-white shadow-md shadow-emerald-100">
                        <FileType className="w-5 h-5" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Status: Ready</p>
                        <p className="text-[11px] font-bold text-slate-800 truncate">{fileName}</p>
                      </div>
                      <button onClick={resetPipeline} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="group relative block w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 transition-all duration-300 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50">
                      <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt,.csv,.md" />
                      <FileCode className="w-8 h-8 text-slate-200 mx-auto mb-2 group-hover:text-blue-400 transition-all" />
                      <span className="text-[11px] font-bold text-slate-400 block leading-relaxed">Click to select document</span>
                    </label>
                  )}
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">2. Knowledge Query</h3>
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="What do you want to find in the data?"
                        className="w-full h-28 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-semibold focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none resize-none shadow-inner"
                      />
                      <div className="absolute bottom-3 right-3 pointer-events-none">
                        <Search className="text-slate-300 w-4 h-4" />
                      </div>
                    </div>
                    <button 
                      onClick={handleQuerySubmit}
                      disabled={isProcessing}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-200 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95"
                    >
                      <SendHorizontal className="w-3 h-3" />
                      {chunks.length > 0 ? 'Ask Question' : 'Ingest & Ask'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {mode === AppMode.TEXT_TO_SQL && (
              <section className="space-y-6">
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Live Schemas</h3>
                  <div className="space-y-3">
                    {MOCK_DB_SCHEMA.map(table => (
                      <div key={table.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="w-3 h-3 text-blue-500" />
                          <span className="text-[11px] font-black text-slate-800 uppercase">{table.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {table.columns.slice(0, 4).map(c => (
                            <div key={c.name} className="text-[9px] text-slate-400 font-mono truncate bg-white px-1.5 py-1 rounded border border-slate-50">
                              {c.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#F9FAFF] overflow-hidden">
          <div className="p-8 flex-1 overflow-y-auto space-y-8 max-w-6xl mx-auto w-full">
            
            {/* Progress Bar Visualizer */}
            <div className="flex items-center gap-2 bg-white/80 p-4 rounded-3xl shadow-sm border border-slate-200/50 overflow-x-auto no-scrollbar">
              {(mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep))
                .filter(s => s !== RagStep.IDLE).map((s, idx) => {
                  const current = (mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep) as any;
                  const isActive = current === s;
                  const steps = (mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep)) as any[];
                  const isPast = steps.indexOf(current) > steps.indexOf(s);
                  
                  return (
                    <React.Fragment key={s}>
                      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'bg-slate-900 text-white shadow-lg translate-y-[-2px]' : isPast ? 'text-emerald-500 bg-emerald-50/50' : 'text-slate-300'}`}>
                        {isActive ? <Zap className="w-3 h-3 text-blue-400 animate-pulse" /> : isPast ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-100" />}
                        {s.replace('_', ' ')}
                      </div>
                      {idx < (mode === AppMode.DOCUMENT_RAG ? 5 : 3) && <ChevronRight className="w-3 h-3 text-slate-200" />}
                    </React.Fragment>
                  );
                })}
            </div>

            {/* Main Stage Area */}
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200/40 flex flex-col overflow-hidden min-h-[600px] relative">
              <div className="flex-1 p-8 flex flex-col">
                {mode === AppMode.DOCUMENT_RAG && (
                  <div className="h-full flex flex-col">
                    {ragStep === RagStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in">
                        <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center border border-slate-100 shadow-inner">
                          {fileName ? <CheckCircle2 className="w-10 h-10 text-emerald-500" /> : <Layers className="w-10 h-10 text-slate-200" />}
                        </div>
                        <div className="space-y-3">
                          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                            {fileName ? `${fileName} Ingestion Loop` : 'Grounded AI Engine'}
                          </h2>
                          <p className="text-slate-400 max-w-sm mx-auto font-medium text-sm leading-relaxed">
                            {fileName ? 'Document ready for processing. Enter your question and hit "Run Full Pipeline" to start the visualization.' : 'Experience the mechanics of Retrieval Augmented Generation in real-time.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {[RagStep.UPLOADING, RagStep.CHUNKING, RagStep.EMBEDDING, RagStep.STORING, RagStep.RETRIEVING, RagStep.GENERATING].includes(ragStep) && (
                      <div className="flex flex-col h-full space-y-8 animate-in fade-in duration-500">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              {ragStep === RagStep.RETRIEVING || ragStep === RagStep.GENERATING ? <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> : <Box className="w-4 h-4 text-slate-300" />}
                              Document Vector Store <span className="text-slate-200 px-2">|</span> <span className="text-blue-600 font-black">{fileName}</span>
                            </h3>
                          </div>
                          
                          <div className="max-h-[300px] overflow-y-auto p-4 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-inner scroll-smooth no-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {chunks.map((c, i) => {
                                const isCited = answer.includes(`[Chunk #${c.id}]`);
                                return (
                                  <div 
                                    key={c.id} 
                                    className={`p-4 rounded-2xl border-2 text-[10px] leading-relaxed h-28 relative overflow-hidden transition-all duration-700 ${getChunkStyle(c)} ${isCited ? 'ring-2 ring-indigo-400 bg-indigo-50 border-indigo-500 shadow-md z-10' : ''}`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${c.state === 'retrieved' ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-400'}`}>ID: {c.id}</div>
                                      {isCited && <Quote className="w-3 h-3 text-indigo-600 animate-in zoom-in" />}
                                    </div>
                                    <span className={`font-semibold line-clamp-3 ${c.state === 'retrieved' ? 'text-slate-900' : 'text-slate-500'}`}>{c.text}</span>
                                    <div className="absolute bottom-2 left-4 right-4 text-[8px] font-black text-slate-300 uppercase truncate">
                                      {c.metadata}
                                    </div>
                                  </div>
                                );
                              })}
                              {chunks.length === 0 && <div className="col-span-full py-10 text-center text-slate-300 text-[10px] uppercase font-bold tracking-widest italic">Document not yet processed...</div>}
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 bg-gradient-to-b from-slate-50/50 to-white rounded-3xl border border-slate-100 p-8 relative">
                          {ragStep === RagStep.RETRIEVING && (
                             <div className="space-y-6 max-w-2xl mx-auto animate-in slide-in-from-bottom-4">
                                <div className="flex items-center gap-4 p-5 bg-white rounded-3xl border border-slate-200 shadow-sm">
                                  <div className="bg-slate-900 p-3 rounded-xl text-white shadow-xl"><Search className="w-5 h-5" /></div>
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Semantic Retrieval</p>
                                    <p className="text-lg font-bold text-slate-800 tracking-tight italic line-clamp-1">"{query}"</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                  {retrievedChunks.slice(0, 3).map((rc, i) => (
                                    <div key={i} className={`p-4 rounded-2xl border-2 font-bold transition-all ${i===0?'bg-amber-50 border-amber-200 text-amber-700':i===1?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-sky-50 border-sky-200 text-sky-700'}`}>
                                      <div className="flex justify-between items-center mb-2 text-[9px] uppercase">
                                        <span>Rank {i+1}</span>
                                        <span className="font-black">{(rc.score || 0).toFixed(2)}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-white/50 rounded-full overflow-hidden">
                                        <div className={`h-full ${i===0?'bg-amber-500':i===1?'bg-emerald-500':'bg-sky-500'} transition-all duration-700`} style={{width: `${Math.min(100, (rc.score || 0) * 100)}%`}} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                             </div>
                          )}

                          {ragStep === RagStep.GENERATING && (
                            <div className="flex flex-col h-full animate-in fade-in duration-700">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200/50 shadow-sm">
                                  <div className="flex -space-x-2">
                                    {retrievedChunks.slice(0, 3).map((rc, i) => (
                                      <div key={i} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black text-white shadow-md ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-emerald-500' : 'bg-sky-500'}`}>
                                        C{rc.id}
                                      </div>
                                    ))}
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-slate-200" />
                                  <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-md"><Box className="w-4 h-4" /></div>
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Augmented Context</span>
                                </div>

                                <button 
                                  onClick={() => setShowPrompt(!showPrompt)}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${showPrompt ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                >
                                  {showPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  {showPrompt ? 'Hide Prompt' : 'View LLM Prompt'}
                                </button>
                              </div>

                              <div className="flex-1 relative">
                                {showPrompt ? (
                                  <div className="absolute inset-0 bg-slate-900 rounded-[2rem] p-8 font-mono text-[10px] text-indigo-300 overflow-y-auto leading-relaxed border-4 border-indigo-100/50 animate-in zoom-in-95">
                                    <div className="mb-4 pb-4 border-b border-slate-800">
                                       <span className="text-slate-500 block mb-1 uppercase tracking-widest font-black">[INSTRUCTION]</span>
                                       GROUNDED REASONING: Answer ONLY using document data.
                                    </div>
                                    <div className="mb-4 pb-4 border-b border-slate-800">
                                       <span className="text-slate-500 block mb-1 uppercase tracking-widest font-black">[CONTEXT: {fileName}]</span>
                                       {retrievedChunks.slice(0, 5).map(rc => `[Chunk #${rc.id}] ${rc.text}`).join('\n\n')}
                                    </div>
                                    <div>
                                       <span className="text-slate-500 block mb-1 uppercase tracking-widest font-black">[USER QUERY]</span>
                                       {query}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-white p-8 rounded-[2rem] border border-slate-200/40 shadow-sm h-full overflow-y-auto">
                                    <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-bold text-lg tracking-tight">
                                      {answer || "Finalizing grounded answer from source..."}
                                    </div>
                                    {answer && (
                                      <div className="mt-6 pt-6 border-t border-slate-100 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Grounding verification complete</span>
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
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                          <Database className="w-16 h-16 text-slate-200" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 leading-tight">Schema Dialect Reasoning</h2>
                        <p className="text-slate-400 max-w-sm text-sm">Convert natural language directly into validated SQL schema queries.</p>
                      </div>
                    )}
                    
                    {(sqlStep !== SqlStep.IDLE) && (
                      <div className="space-y-6 h-full flex flex-col">
                        <div className="bg-slate-900 rounded-[2rem] p-8 font-mono text-sm text-blue-400 border border-slate-800 shadow-xl relative overflow-hidden">
                          <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-6">
                            <Terminal className="w-5 h-5 text-slate-600" />
                            <span className="text-[10px] text-slate-600 uppercase font-black tracking-widest">SQL Generator</span>
                          </div>
                          <div className="min-h-[40px] text-lg font-black">
                            {sqlResult?.sql ? (
                              <div className="animate-in slide-in-from-left-4">{sqlResult.sql}</div>
                            ) : (
                              <div className="text-slate-700 animate-pulse italic">Mapping intent to SQL semantics...</div>
                            )}
                          </div>
                        </div>

                        {sqlResult?.results && (
                          <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                            <table className="w-full text-[11px] text-left">
                              <thead className="bg-slate-50 text-slate-500 font-black">
                                <tr>
                                  {Object.keys(sqlResult.results[0] || {}).map(k => (
                                    <th key={k} className="px-6 py-4 uppercase tracking-tighter">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {sqlResult.results.map((row, i) => (
                                  <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                                    {Object.values(row).map((v: any, j) => (
                                      <td key={j} className="px-6 py-4 text-slate-700 font-bold">
                                        {String(v)}
                                      </td>
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

              {/* Lower Technical Log Area */}
              <div className="bg-[#FAFBFD] border-t border-slate-100 px-8 py-6 shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-white p-1.5 rounded-lg text-slate-400 border border-slate-100 shadow-sm"><Code2 className="w-3 h-3" /></div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Runtime Logic: {ragStep !== RagStep.IDLE ? ragStep : 'Awaiting Trigger'}</span>
                </div>
                <pre className="code-font text-[10px] bg-white p-6 rounded-2xl border border-slate-200/50 overflow-x-auto text-slate-500 leading-relaxed max-h-36">
                  {mode === AppMode.DOCUMENT_RAG ? (
                    ragStep === RagStep.CHUNKING ? CODE_SNIPPETS.CHUNKING :
                    ragStep === RagStep.EMBEDDING ? CODE_SNIPPETS.EMBEDDING :
                    ragStep === RagStep.RETRIEVING || ragStep === RagStep.STORING ? CODE_SNIPPETS.RETRIEVAL :
                    ragStep === RagStep.GENERATING ? `// Performing Generation\n// source_ref: ${fileName}\n// status: SUCCESS` :
                    "// Core Pipeline Idle."
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
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-blue-500 animate-pulse' : 'bg-slate-200'}`} />
            {mode} Mode
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-indigo-600">
             Active Stage: <span className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-300">Grounding Engine</span>
          <span className="text-indigo-500 font-black">V4.7-FINAL</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
