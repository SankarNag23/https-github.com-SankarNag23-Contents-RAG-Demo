
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
  Activity, 
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
  Info,
  Sparkles,
  Link,
  ArrowRight,
  ShieldCheck,
  Zap
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
  
  // RAG State
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [chunks, setChunks] = useState<(Chunk & { metadata?: string; state: 'pending' | 'processed' | 'retrieved' })[]>([]);
  const [retrievedChunks, setRetrievedChunks] = useState<Chunk[]>([]);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  
  // SQL State
  const [sqlResult, setSqlResult] = useState<{ sql: string; explanation: string; results: any[] } | null>(null);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isAutoMode && (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING)) {
      timerRef.current = window.setTimeout(() => {
        advanceRagStep();
      }, 1500);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAutoMode, ragStep]);

  const advanceRagStep = async () => {
    setIsProcessing(true);
    switch (ragStep) {
      case RagStep.IDLE:
        setRagStep(RagStep.UPLOADING);
        break;
      case RagStep.UPLOADING:
        setRagStep(RagStep.CHUNKING);
        const rawTexts = fileContent.match(/.{1,180}/g) || [];
        // Fixed: Added explicit casting for state to match the union type "pending" | "processed" | "retrieved"
        setChunks(rawTexts.map((text, i) => ({ 
          id: i.toString(), 
          text, 
          state: 'pending' as const,
          metadata: `Page ${Math.floor(i/3) + 1} • Section ${i+1}`
        })));
        break;
      case RagStep.CHUNKING:
        setRagStep(RagStep.EMBEDDING);
        setChunks(prev => prev.map(c => ({ ...c, state: 'processed' as const })));
        break;
      case RagStep.EMBEDDING:
        setRagStep(RagStep.STORING);
        break;
      case RagStep.STORING:
        setRagStep(RagStep.RETRIEVING);
        // Simulation of semantic search with high-confidence scoring
        const keywords = query.toLowerCase().split(' ').filter(k => k.length > 2);
        const scored = chunks.map(c => {
          let score = 0;
          keywords.forEach(kw => { if (c.text.toLowerCase().includes(kw)) score += 0.3; });
          if (score > 0) score += 0.4 + (Math.random() * 0.2); // Baseline similarity
          return { ...c, score };
        }).filter(c => (c.score || 0) > 0.4).sort((a, b) => (b.score || 0) - (a.score || 0));
        
        const topK = scored.slice(0, 3);
        setRetrievedChunks(topK);
        setChunks(prev => prev.map(c => ({
          ...c,
          state: topK.some(t => t.id === c.id) ? 'retrieved' as const : 'processed' as const
        })));
        break;
      case RagStep.RETRIEVING:
        setRagStep(RagStep.GENERATING);
        const context = retrievedChunks.length > 0 ? retrievedChunks : chunks.slice(0, 2);
        const result = await gemini.askWithContext(query, context.map(c => c.text));
        setAnswer(result);
        break;
      default:
        break;
    }
    setIsProcessing(false);
  };

  const handlePipelineAction = () => {
    if (mode === AppMode.DOCUMENT_RAG) {
      if (ragStep === RagStep.IDLE || ragStep === RagStep.GENERATING) {
        if (!fileContent || !query) {
          alert("Please upload a file and enter a question.");
          return;
        }
        setAnswer('');
        setRetrievedChunks([]);
        setRagStep(RagStep.UPLOADING);
      } else {
        advanceRagStep();
      }
    } else {
      if (sqlStep === SqlStep.IDLE || sqlStep === SqlStep.ANSWERING) {
        handleSqlFlow();
      }
    }
  };

  const resetPipeline = () => {
    setRagStep(RagStep.IDLE);
    setSqlStep(SqlStep.IDLE);
    setChunks([]);
    setRetrievedChunks([]);
    setAnswer('');
    setSqlResult(null);
  };

  const loadSample = () => {
    setFileContent(SAMPLE_DOC);
    setFileName('baseline_demo.txt');
    setQuery('What are the key steps in the RAG pipeline?');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleSqlFlow = async () => {
    if (!query) {
      alert("Enter a natural language database query.");
      return;
    }
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
        }, 1000);
      }, 1000);
    }, 1000);
  };

  const getChunkStyle = (chunk: typeof chunks[0]) => {
    if (chunk.state === 'retrieved') {
      const rank = retrievedChunks.findIndex(rc => rc.id === chunk.id);
      if (rank === 0) return 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 shadow-amber-100 scale-105 z-20';
      if (rank === 1) return 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 shadow-emerald-100 scale-102 z-10';
      return 'border-sky-500 bg-sky-50 ring-2 ring-sky-200 shadow-sky-100 scale-102 z-10';
    }
    if (chunk.state === 'processed') return 'border-slate-200 bg-white opacity-90';
    return 'border-slate-100 bg-slate-50 opacity-40 grayscale';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-100">
      <header className="bg-white border-b px-8 py-5 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-200">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Contents RAG Demo</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Professional Architecture Baseline</p>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => { setMode(AppMode.DOCUMENT_RAG); resetPipeline(); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${mode === AppMode.DOCUMENT_RAG ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <FileText className="w-4 h-4" /> Pipeline RAG
          </button>
          <button 
            onClick={() => { setMode(AppMode.TEXT_TO_SQL); resetPipeline(); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${mode === AppMode.TEXT_TO_SQL ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Database className="w-4 h-4" /> Text-to-SQL
          </button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[22rem] bg-white border-r flex flex-col p-8 overflow-y-auto shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Orchestrator</h3>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Baseline Ready</span>
                </div>
              </div>
              <div className="flex items-center justify-between mb-5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-600">Auto-Step</span>
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
                className="group w-full bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? <FastForward className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />)}
                <span className="tracking-wide">{isProcessing ? 'Thinking...' : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? 'Execute Next Stage' : 'Trigger Pipeline')}</span>
              </button>
            </section>

            {mode === AppMode.DOCUMENT_RAG && (
              <section className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">1. Data Ingestion</h3>
                    <button onClick={loadSample} className="text-[10px] text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition-colors">Load Baseline Sample</button>
                  </div>
                  <label className={`group relative block w-full border-2 border-dashed rounded-3xl p-8 transition-all duration-300 text-center cursor-pointer ${fileContent ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'}`}>
                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt" />
                    {fileContent ? <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" /> : <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3 group-hover:scale-110 transition-transform" />}
                    <span className="text-xs font-bold text-slate-600 truncate block px-2">
                      {fileName || 'Drop Document Here'}
                    </span>
                  </label>
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">2. Semantic Query</h3>
                  <div className="relative">
                    <textarea 
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="e.g. How does vector search work?"
                      className="w-full h-32 p-5 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all outline-none resize-none shadow-inner"
                    />
                    <div className="absolute bottom-4 right-4 bg-white p-1.5 rounded-lg border border-slate-100 shadow-sm">
                      <Search className="text-slate-400 w-4 h-4" />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {mode === AppMode.TEXT_TO_SQL && (
              <section className="space-y-8">
                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Database Context</h3>
                  <div className="space-y-3">
                    {MOCK_DB_SCHEMA.map(table => (
                      <div key={table.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Database className="w-3 h-3" />
                          </div>
                          <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{table.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {table.columns.slice(0, 4).map(c => (
                            <div key={c.name} className="text-[9px] text-slate-500 font-mono truncate bg-white px-2 py-1 rounded border border-slate-100">
                              {c.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                   <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Input Prompt</h3>
                   <textarea 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Find reports from 2023 with revenue > 1M"
                    className="w-full h-32 p-5 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-medium focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none shadow-inner"
                  />
                </div>
              </section>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#FDFDFF] overflow-hidden">
          <div className="p-8 flex-1 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full">
            
            {/* Professional Step Progress */}
            <div className="flex items-center gap-3 bg-white/60 p-5 rounded-[2.5rem] shadow-sm border border-slate-200/60 overflow-x-auto no-scrollbar backdrop-blur-sm">
              {(mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep))
                .filter(s => s !== RagStep.IDLE).map((s, idx) => {
                  const current = mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep;
                  const isActive = current === s;
                  // Fixed: Added explicit casting to resolve the narrowing error for indexOf arguments
                  const steps = (mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep)) as (RagStep | SqlStep)[];
                  const isPast = steps.indexOf(current) > steps.indexOf(s);
                  
                  return (
                    <React.Fragment key={s}>
                      <div className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl whitespace-nowrap text-[11px] font-black uppercase tracking-widest transition-all duration-500 ${isActive ? 'bg-slate-900 text-white shadow-xl shadow-slate-200 translate-y-[-2px]' : isPast ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' : 'text-slate-300'}`}>
                        {isActive ? <Zap className="w-3.5 h-3.5 text-blue-400 animate-pulse" /> : isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />}
                        {s.replace('_', ' ')}
                      </div>
                      {idx < (mode === AppMode.DOCUMENT_RAG ? 5 : 3) && <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />}
                    </React.Fragment>
                  );
                })}
            </div>

            {/* Stage Visualizer */}
            <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)] border border-slate-200/50 flex flex-col overflow-hidden min-h-[650px] relative">
              <div className="flex-1 p-10 flex flex-col">
                {mode === AppMode.DOCUMENT_RAG && (
                  <div className="h-full flex flex-col">
                    {ragStep === RagStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                          <Layers className="w-10 h-10 text-slate-200" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-black text-slate-900 tracking-tight">RAG Baseline Explorer</h2>
                          <p className="text-slate-500 max-w-sm mx-auto font-medium mt-2 leading-relaxed">Visualize the transformation of static documents into a dynamic knowledge graph.</p>
                        </div>
                      </div>
                    )}

                    {[RagStep.CHUNKING, RagStep.EMBEDDING, RagStep.STORING, RagStep.RETRIEVING, RagStep.GENERATING].includes(ragStep) && (
                      <div className="flex flex-col h-full space-y-10">
                        <div>
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              {ragStep === RagStep.RETRIEVING || ragStep === RagStep.GENERATING ? <Sparkles className="w-4 h-4 text-amber-500 fill-amber-100" /> : <Box className="w-4 h-4 text-slate-300" />}
                              Knowledge Fragments Store
                              <span className="ml-3 font-bold text-slate-300 border-l border-slate-200 pl-3">Indexed Units: {chunks.length}</span>
                            </h3>
                            <div className="flex gap-3">
                              {['Gold', 'Emerald', 'Sky'].map((color, i) => (
                                <div key={color} className="flex items-center gap-1.5">
                                  <div className={`w-2.5 h-2.5 rounded-full ${i===0 ? 'bg-amber-500' : i===1 ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                                  <span className="text-[9px] font-black text-slate-400 uppercase">Rank {i+1}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                            {chunks.map((c, i) => (
                              <div 
                                key={c.id} 
                                className={`p-5 rounded-3xl border-2 text-[10px] leading-relaxed h-32 relative overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${getChunkStyle(c)}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${c.state === 'retrieved' ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-400'}`}>#{i}</div>
                                  {c.state === 'retrieved' && <span className="text-[9px] font-bold text-slate-900">Score: {c.score?.toFixed(2)}</span>}
                                </div>
                                <span className="font-medium">{c.text}</span>
                                <div className="absolute bottom-3 left-5 right-5 flex justify-between items-center text-[8px] font-black text-slate-300 uppercase">
                                  <span>{c.metadata}</span>
                                  {c.state === 'processed' && <div className="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex-1 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 p-8">
                          {ragStep === RagStep.EMBEDDING && (
                            <div className="flex flex-col items-center justify-center h-full space-y-6">
                              <div className="flex gap-4">
                                {[1,2,3,4].map(i => (
                                  <div key={i} className="w-14 h-14 bg-blue-600 rounded-2xl rotate-45 flex items-center justify-center animate-bounce shadow-2xl shadow-blue-200" style={{animationDelay: `${i*0.2}s`}}>
                                    <Cpu className="w-6 h-6 text-white -rotate-45" />
                                  </div>
                                ))}
                              </div>
                              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Neural Encoding Logic Active</p>
                            </div>
                          )}

                          {ragStep === RagStep.STORING && (
                            <div className="flex flex-col items-center justify-center h-full">
                              <div className="relative mb-4">
                                <Database className="w-16 h-16 text-slate-200" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <CheckCircle2 className="w-8 h-8 text-blue-500 animate-pulse" />
                                </div>
                              </div>
                              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Indexing Vectors in Global Namespace</p>
                            </div>
                          )}

                          {ragStep === RagStep.RETRIEVING && (
                             <div className="space-y-6 max-w-2xl mx-auto">
                                <div className="flex items-center gap-5 p-5 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-100">
                                  <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg"><Search className="w-6 h-6" /></div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Similarity Computation</p>
                                    <p className="text-base font-bold text-slate-800 leading-tight">"{query}"</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                  {retrievedChunks.map((rc, i) => (
                                    <div key={i} className={`p-4 rounded-2xl border text-[10px] font-bold ${i===0?'bg-amber-50 border-amber-200 text-amber-700':i===1?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-sky-50 border-sky-200 text-sky-700'}`}>
                                      <div className="flex justify-between mb-1">
                                        <span>MATCH {i+1}</span>
                                        <span>{(rc.score || 0 * 100).toFixed(0)}%</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-white rounded-full overflow-hidden">
                                        <div className={`h-full ${i===0?'bg-amber-500':i===1?'bg-emerald-500':'bg-sky-500'}`} style={{width: `${(rc.score || 0) * 100}%`}} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                             </div>
                          )}

                          {ragStep === RagStep.GENERATING && (
                            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-700">
                              <div className="flex items-center gap-3 mb-5 p-4 bg-white rounded-3xl border border-slate-200/60 shadow-sm self-start">
                                <div className="flex -space-x-3">
                                  {retrievedChunks.map((rc, i) => (
                                    <div key={i} className={`w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-lg ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-emerald-500' : 'bg-sky-500'}`}>
                                      C{rc.id}
                                    </div>
                                  ))}
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md shadow-blue-100"><Cpu className="w-5 h-5" /></div>
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Augmented Synthesis</span>
                              </div>

                              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200/50 shadow-2xl shadow-slate-200/50 flex-1 overflow-y-auto">
                                 <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-semibold text-lg">
                                  {answer || "Synthesizing contextual knowledge..."}
                                 </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {mode === AppMode.TEXT_TO_SQL && (
                  <div className="h-full flex flex-col">
                    {sqlStep === SqlStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <Database className="w-20 h-20 text-slate-100" />
                        <div>
                          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Enterprise SQL Generator</h2>
                          <p className="text-slate-500 max-w-sm mx-auto font-medium mt-2">Connect natural language queries to complex database schemas seamlessly.</p>
                        </div>
                      </div>
                    )}

                    {(sqlStep !== SqlStep.IDLE) && (
                      <div className="space-y-8 h-full flex flex-col">
                        <div className="bg-slate-900 rounded-[2.5rem] p-8 font-mono text-sm text-blue-400 border border-slate-800 shadow-2xl relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-6 flex gap-2 opacity-50">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                          </div>
                          <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-6">
                            <Terminal className="w-5 h-5 text-slate-500" />
                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">Validated SQL Output</span>
                          </div>
                          <div className="min-h-[50px] text-lg font-bold">
                            {sqlResult?.sql ? (
                              <div className="animate-in slide-in-from-left-6 duration-700">{sqlResult.sql}</div>
                            ) : (
                              <div className="flex items-center gap-3 text-slate-700 animate-pulse">
                                <span className="animate-bounce">_</span> Compiling Neural Instructions to Schema Dialect...
                              </div>
                            )}
                          </div>
                        </div>

                        {sqlResult?.results && (
                          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                            <div className="flex items-center justify-between mb-4">
                               <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Engine Execution Log
                              </h4>
                              <span className="text-[9px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500">Latency: 42ms</span>
                            </div>
                            <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-xl shadow-slate-100">
                              <div className="max-h-80 overflow-y-auto">
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-50/80 text-slate-500 font-black sticky top-0 backdrop-blur-sm">
                                    <tr>
                                      {Object.keys(sqlResult.results[0] || {}).map(k => (
                                        <th key={k} className="px-6 py-4 uppercase tracking-widest text-[10px]">{k}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sqlResult.results.map((row, i) => (
                                      <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                        {Object.values(row).map((v: any, j) => (
                                          <td key={j} className="px-6 py-4 text-slate-700 font-bold">
                                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {sqlResult?.explanation && (
                          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-[2rem] flex gap-4 animate-in fade-in mt-auto shadow-sm">
                            <div className="bg-indigo-600 p-2 rounded-xl text-white h-fit shadow-md shadow-indigo-200">
                                <Info className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Architecture Insight</p>
                                <p className="text-sm text-slate-700 font-bold italic leading-relaxed">{sqlResult.explanation}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Baseline Internal Logic Code */}
              <div className="bg-[#FAFBFD] border-t border-slate-100 px-10 py-8 shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-200 p-1.5 rounded-lg text-slate-500"><Code2 className="w-4 h-4" /></div>
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Internal Baseline Implementation</span>
                  </div>
                  {ragStep === RagStep.RETRIEVING && <div className="text-[10px] text-amber-600 font-black px-3 py-1 bg-amber-50 rounded-full border border-amber-100 shadow-sm">Scoring: cosine_similarity</div>}
                </div>
                <pre className="code-font text-[10px] bg-white p-6 rounded-3xl border border-slate-200/60 overflow-x-auto text-slate-700 leading-[1.8] shadow-inner max-h-40 selection:bg-blue-100">
                  {mode === AppMode.DOCUMENT_RAG ? (
                    ragStep === RagStep.CHUNKING ? CODE_SNIPPETS.CHUNKING :
                    ragStep === RagStep.EMBEDDING ? CODE_SNIPPETS.EMBEDDING :
                    ragStep === RagStep.RETRIEVING || ragStep === RagStep.STORING ? CODE_SNIPPETS.RETRIEVAL :
                    ragStep === RagStep.GENERATING ? "// Stage: Prompt Augmentation\n// Merging original question with retrieved Top-K chunks...\n// Template: {context}\\n\\nQuestion: {query}\\nAnswer:" :
                    "// Orchestrator Idle. Awaiting Baseline Trigger..."
                  ) : (
                    CODE_SNIPPETS.SQL_GEN
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t px-8 py-4 flex items-center justify-between text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-slate-200'}`} />
            {mode} ACTIVE
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-blue-600">
             STAGE: <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep}</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <a href="#" className="hover:text-slate-900 transition-colors">GitHub Artifacts</a>
          <span className="text-slate-200">|</span>
          <span>Baseline Demo V2.0</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
