
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
  Zap,
  FileCode,
  FileType
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
  const [fileType, setFileType] = useState<string>('');
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
        setChunks(rawTexts.map((text, i) => ({ 
          id: i.toString(), 
          text, 
          state: 'pending' as const,
          metadata: `Source: ${fileName.split('.').pop()?.toUpperCase() || 'DOC'} • P. ${Math.floor(i/3) + 1}`
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
        const keywords = query.toLowerCase().split(' ').filter(k => k.length > 2);
        const scored = chunks.map(c => {
          let score = 0;
          keywords.forEach(kw => { if (c.text.toLowerCase().includes(kw)) score += 0.35; });
          if (score > 0) score += 0.3 + (Math.random() * 0.3);
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
          alert("Please upload a document and enter a question.");
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
    setFileName('');
    setFileType('');
  };

  const loadSample = () => {
    setFileContent(SAMPLE_DOC);
    setFileName('rag_baseline.pdf');
    setFileType('application/pdf');
    setQuery('What is the role of vector databases?');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileType(file.type || 'text/plain');
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      let content = ev.target?.result as string;
      // If it's a binary file, browser might not read it well as string,
      // but for this visual demo we handle basic text-like content.
      // In a real app, we'd use a server-side parser or mammoth/pdf.js
      setFileContent(content || "Simulated document content extracted from " + file.name + ".\n\n" + SAMPLE_DOC);
    };
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
      if (rank === 0) return 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 shadow-amber-100 scale-[1.07] z-30 ring-offset-4';
      if (rank === 1) return 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 shadow-emerald-100 scale-105 z-20';
      return 'border-sky-500 bg-sky-50 ring-2 ring-sky-200 shadow-sky-100 scale-102 z-10';
    }
    if (chunk.state === 'processed') return 'border-slate-200 bg-white opacity-80';
    return 'border-slate-100 bg-slate-50 opacity-40 grayscale blur-[1px]';
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-blue-100">
      <header className="bg-white border-b px-8 py-5 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-indigo-600 to-blue-500 p-2.5 rounded-xl shadow-lg shadow-blue-200">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">RAG Demo Architecture</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Cross-Format Baseline Visualizer</p>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => { setMode(AppMode.DOCUMENT_RAG); resetPipeline(); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${mode === AppMode.DOCUMENT_RAG ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <FileText className="w-4 h-4" /> Multimodal RAG
          </button>
          <button 
            onClick={() => { setMode(AppMode.TEXT_TO_SQL); resetPipeline(); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 ${mode === AppMode.TEXT_TO_SQL ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Database className="w-4 h-4" /> SQL Ingestion
          </button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[24rem] bg-white border-r flex flex-col p-8 overflow-y-auto shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Pipeline Control</h3>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Live Pipeline</span>
                </div>
              </div>
              <div className="flex items-center justify-between mb-5 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex flex-col">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">Automatic Mode</span>
                   <span className="text-[10px] text-slate-400 font-medium">Sequential step progression</span>
                </div>
                <button 
                  onClick={() => setIsAutoMode(!isAutoMode)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all ${isAutoMode ? 'bg-blue-600 shadow-lg shadow-blue-100' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isAutoMode ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>
              <button 
                onClick={handlePipelineAction}
                disabled={isProcessing}
                className="group w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-2xl shadow-slate-200"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? <FastForward className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />)}
                <span className="tracking-widest uppercase text-xs">{isProcessing ? 'Processing' : (ragStep !== RagStep.IDLE && ragStep !== RagStep.GENERATING && !isAutoMode ? 'Next Step' : 'Start Flow')}</span>
              </button>
            </section>

            {mode === AppMode.DOCUMENT_RAG && (
              <section className="space-y-8">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">1. Unified Ingestion</h3>
                    <button onClick={loadSample} className="text-[10px] text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition-colors border border-blue-100">Load Baseline PDF</button>
                  </div>
                  <label className={`group relative block w-full border-2 border-dashed rounded-[2rem] p-10 transition-all duration-500 text-center cursor-pointer ${fileContent ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-xl hover:shadow-blue-50'}`}>
                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt,.csv,.md" />
                    {fileContent ? (
                      <div className="animate-in zoom-in-50">
                        <FileType className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <span className="text-xs font-black text-slate-700 block uppercase tracking-tighter">Detected: {fileName.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    ) : (
                      <>
                        <FileCode className="w-12 h-12 text-slate-200 mx-auto mb-3 group-hover:scale-110 group-hover:text-blue-400 transition-all" />
                        <span className="text-xs font-bold text-slate-400 block px-4 leading-relaxed">Accepts PDF, Word, CSV, MD, TXT</span>
                      </>
                    )}
                    <span className="mt-4 text-[10px] font-black text-slate-400 truncate block px-2 uppercase tracking-widest">
                      {fileName || 'Click to Upload'}
                    </span>
                  </label>
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">2. Interactive Context</h3>
                  <div className="relative">
                    <textarea 
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ask anything about the document..."
                      className="w-full h-36 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-semibold focus:ring-8 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none resize-none shadow-inner leading-relaxed"
                    />
                    <div className="absolute bottom-5 right-5 bg-white p-2 rounded-xl border border-slate-100 shadow-lg">
                      <Search className="text-slate-300 w-4 h-4" />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {mode === AppMode.TEXT_TO_SQL && (
              <section className="space-y-8">
                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Relational Context</h3>
                  <div className="space-y-4">
                    {MOCK_DB_SCHEMA.map(table => (
                      <div key={table.name} className="p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 hover:border-blue-200 transition-all group hover:shadow-lg hover:bg-white">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="bg-blue-50 p-2 rounded-xl text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm">
                            <Database className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{table.name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {table.columns.slice(0, 4).map(c => (
                            <div key={c.name} className="text-[10px] text-slate-400 font-mono truncate bg-white px-2 py-1.5 rounded-lg border border-slate-100 group-hover:text-slate-600 transition-colors">
                              {c.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                   <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Schema Query</h3>
                   <textarea 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Calculate profit margin per region"
                    className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-bold focus:ring-8 focus:ring-blue-50 outline-none resize-none shadow-inner"
                  />
                </div>
              </section>
            )}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-[#F9FAFF] overflow-hidden">
          <div className="p-10 flex-1 overflow-y-auto space-y-10 max-w-7xl mx-auto w-full">
            
            {/* Step Indicators */}
            <div className="flex items-center gap-3 bg-white/80 p-6 rounded-[3rem] shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-slate-200/50 overflow-x-auto no-scrollbar backdrop-blur-xl">
              {(mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep))
                .filter(s => s !== RagStep.IDLE).map((s, idx) => {
                  const current = (mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep) as any;
                  const isActive = current === s;
                  const steps = (mode === AppMode.DOCUMENT_RAG ? Object.values(RagStep) : Object.values(SqlStep)) as any[];
                  const isPast = steps.indexOf(current) > steps.indexOf(s);
                  
                  return (
                    <React.Fragment key={s}>
                      <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl whitespace-nowrap text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-700 ${isActive ? 'bg-slate-900 text-white shadow-2xl shadow-slate-300 translate-y-[-4px]' : isPast ? 'text-emerald-500 bg-emerald-50/50 border border-emerald-100' : 'text-slate-300'}`}>
                        {isActive ? <Zap className="w-4 h-4 text-blue-400 animate-pulse" /> : isPast ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-slate-100" />}
                        {s.replace('_', ' ')}
                      </div>
                      {idx < (mode === AppMode.DOCUMENT_RAG ? 5 : 3) && <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />}
                    </React.Fragment>
                  );
                })}
            </div>

            {/* Stage Visualization Area */}
            <div className="bg-white rounded-[4rem] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.08)] border border-slate-200/40 flex flex-col overflow-hidden min-h-[700px] relative">
              <div className="flex-1 p-12 flex flex-col">
                {mode === AppMode.DOCUMENT_RAG && (
                  <div className="h-full flex flex-col">
                    {ragStep === RagStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in duration-1000">
                        <div className="w-32 h-32 bg-gradient-to-br from-slate-50 to-white rounded-[3rem] flex items-center justify-center border border-slate-100 shadow-inner">
                          <Layers className="w-12 h-12 text-slate-200" />
                        </div>
                        <div className="space-y-4">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Universal RAG Baseline</h2>
                          <p className="text-slate-400 max-w-md mx-auto font-medium text-lg leading-relaxed">Experience a state-of-the-art document retrieval and grounding engine visually.</p>
                        </div>
                        <div className="flex gap-4">
                           {['PDF', 'DOCX', 'CSV'].map(ext => <span key={ext} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">{ext} COMPLIANT</span>)}
                        </div>
                      </div>
                    )}

                    {ragStep === RagStep.UPLOADING && (
                      <div className="flex flex-col items-center justify-center h-full space-y-10 animate-in zoom-in-95">
                        <div className="relative">
                           <FileType className="w-20 h-20 text-blue-500 animate-bounce" />
                           <Activity className="absolute -top-2 -right-2 w-8 h-8 text-emerald-400 animate-pulse" />
                        </div>
                        <div className="space-y-4 text-center">
                          <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Parsing Structure</h3>
                          <p className="text-slate-400 font-bold text-xs uppercase">File: {fileName} | Ingesting Layers...</p>
                        </div>
                        <div className="w-80 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                          <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 w-2/3 animate-[progress_3s_ease-in-out_infinite]" />
                        </div>
                      </div>
                    )}

                    {[RagStep.CHUNKING, RagStep.EMBEDDING, RagStep.STORING, RagStep.RETRIEVING, RagStep.GENERATING].includes(ragStep) && (
                      <div className="flex flex-col h-full space-y-12">
                        <div>
                          <div className="flex items-center justify-between mb-8">
                            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                              {ragStep === RagStep.RETRIEVING || ragStep === RagStep.GENERATING ? <Sparkles className="w-5 h-5 text-amber-500 fill-amber-100 animate-pulse" /> : <Box className="w-5 h-5 text-slate-300" />}
                              Fragmented In-Memory Vector Store
                              <span className="ml-4 font-black text-slate-300 border-l-2 border-slate-100 pl-4">Fragments: {chunks.length}</span>
                            </h3>
                            <div className="flex gap-4 items-center bg-slate-50 px-5 py-2 rounded-2xl border border-slate-100">
                               <span className="text-[9px] font-black text-slate-400 uppercase mr-2">Heatmap:</span>
                               {[
                                 { name: 'Rank 1', color: 'bg-amber-500' },
                                 { name: 'Rank 2', color: 'bg-emerald-500' },
                                 { name: 'Rank 3', color: 'bg-sky-500' }
                               ].map(rank => (
                                 <div key={rank.name} className="flex items-center gap-2">
                                   <div className={`w-3 h-3 rounded-full ${rank.color} shadow-sm`} />
                                   <span className="text-[9px] font-black text-slate-500 uppercase">{rank.name}</span>
                                 </div>
                               ))}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
                            {chunks.map((c, i) => (
                              <div 
                                key={c.id} 
                                className={`p-6 rounded-[2rem] border-2 text-[11px] leading-relaxed h-36 relative overflow-hidden transition-all duration-1000 cubic-bezier(0.2, 0.8, 0.2, 1) ${getChunkStyle(c)}`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${c.state === 'retrieved' ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-400'}`}>ID: {i}</div>
                                  {c.state === 'retrieved' && (
                                    <div className="flex items-center gap-1.5 bg-white/50 px-2 py-0.5 rounded-lg border border-white/80">
                                      <Zap className="w-2.5 h-2.5 text-blue-500" />
                                      <span className="text-[9px] font-black text-slate-900">{((c.score || 0) * 100).toFixed(0)}%</span>
                                    </div>
                                  )}
                                </div>
                                <span className={`font-semibold ${c.state === 'retrieved' ? 'text-slate-900' : 'text-slate-500'}`}>{c.text}</span>
                                <div className="absolute bottom-4 left-6 right-6 flex justify-between items-center text-[9px] font-black text-slate-300 uppercase tracking-widest">
                                  <span>{c.metadata}</span>
                                  {c.state === 'processed' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex-1 bg-gradient-to-b from-slate-50/50 to-white rounded-[3rem] border border-slate-100 p-10 relative">
                          {ragStep === RagStep.EMBEDDING && (
                            <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in duration-1000">
                              <div className="flex gap-6">
                                {[1,2,3,4,5].map(i => (
                                  <div key={i} className="w-16 h-16 bg-white border border-blue-100 rounded-3xl flex items-center justify-center animate-pulse shadow-xl shadow-blue-50" style={{animationDelay: `${i*0.15}s`}}>
                                    <Cpu className="w-7 h-7 text-blue-500" />
                                  </div>
                                ))}
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-black text-slate-800 uppercase tracking-[0.3em]">Transforming Text to Vectors</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Dimensionality: 1536 (Ada-002 Pipeline)</p>
                              </div>
                            </div>
                          )}

                          {ragStep === RagStep.STORING && (
                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                              <div className="relative">
                                <Database className="w-20 h-20 text-slate-100" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-in zoom-in" />
                                </div>
                              </div>
                              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Committing Index to Persistent Store</p>
                            </div>
                          )}

                          {ragStep === RagStep.RETRIEVING && (
                             <div className="space-y-8 max-w-3xl mx-auto animate-in slide-in-from-bottom-10">
                                <div className="flex items-center gap-6 p-6 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-100/50">
                                  <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-xl"><Search className="w-7 h-7" /></div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Semantic Distance Calculation</p>
                                    <p className="text-xl font-bold text-slate-800 tracking-tight leading-tight italic">"{query}"</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-6">
                                  {retrievedChunks.map((rc, i) => (
                                    <div key={i} className={`p-6 rounded-3xl border-2 font-bold transition-all shadow-sm ${i===0?'bg-amber-50 border-amber-200 text-amber-700':i===1?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-sky-50 border-sky-200 text-sky-700'}`}>
                                      <div className="flex justify-between items-center mb-3 text-[10px] uppercase tracking-widest">
                                        <span>Candidate {i+1}</span>
                                        <span className="font-black">S: {(rc.score || 0).toFixed(2)}</span>
                                      </div>
                                      <div className="h-2 w-full bg-white/50 rounded-full overflow-hidden border border-white/20">
                                        <div className={`h-full ${i===0?'bg-amber-500':i===1?'bg-emerald-500':'bg-sky-500'} transition-all duration-1000`} style={{width: `${(rc.score || 0) * 100}%`}} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                             </div>
                          )}

                          {ragStep === RagStep.GENERATING && (
                            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-1000">
                              <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-3xl border border-slate-200/50 shadow-sm self-start">
                                <div className="flex -space-x-4">
                                  {retrievedChunks.map((rc, i) => (
                                    <div key={i} className={`w-10 h-10 rounded-full border-4 border-white flex items-center justify-center text-[10px] font-black text-white shadow-xl ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-emerald-500' : 'bg-sky-500'}`}>
                                      C{rc.id}
                                    </div>
                                  ))}
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-200" />
                                <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-100"><Cpu className="w-6 h-6" /></div>
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Context Injected -> Synthesis</span>
                              </div>

                              <div className="bg-white p-12 rounded-[3rem] border border-slate-200/40 shadow-[0_32px_64px_rgba(0,0,0,0.05)] flex-1 overflow-y-auto">
                                 <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-bold text-xl tracking-tight">
                                  {answer || "AI is composing a grounded response..."}
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
                  <div className="h-full flex flex-col animate-in fade-in duration-700">
                    {sqlStep === SqlStep.IDLE && (
                      <div className="flex flex-col items-center justify-center h-full text-center space-y-10">
                        <div className="p-8 bg-slate-50 rounded-[3rem] border border-slate-100">
                          <Database className="w-24 h-24 text-slate-200" />
                        </div>
                        <div className="space-y-4">
                          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Structured Reasoning Engine</h2>
                          <p className="text-slate-400 max-w-sm mx-auto font-medium text-lg leading-relaxed">Map complex natural language intents directly to relational data schemas.</p>
                        </div>
                      </div>
                    )}

                    {(sqlStep !== SqlStep.IDLE) && (
                      <div className="space-y-10 h-full flex flex-col">
                        <div className="bg-slate-900 rounded-[3rem] p-10 font-mono text-base text-blue-400 border border-slate-800 shadow-2xl relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-8 flex gap-3 opacity-40">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          </div>
                          <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-8">
                            <Terminal className="w-6 h-6 text-slate-600" />
                            <span className="text-xs text-slate-600 uppercase font-black tracking-[0.3em]">Query Compilation Layer</span>
                          </div>
                          <div className="min-h-[60px] text-xl font-black tracking-tight leading-relaxed">
                            {sqlResult?.sql ? (
                              <div className="animate-in slide-in-from-left-10 duration-1000">{sqlResult.sql}</div>
                            ) : (
                              <div className="flex items-center gap-4 text-slate-700 animate-pulse">
                                <span className="animate-[bounce_1s_infinite]">_</span> Translating human language to SQL dialect...
                              </div>
                            )}
                          </div>
                        </div>

                        {sqlResult?.results && (
                          <div className="animate-in fade-in slide-in-from-bottom-10 duration-1000 flex-1 flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                               <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-3">
                                <ShieldCheck className="w-5 h-5 text-emerald-500" /> Verified Result Partition
                              </h4>
                              <span className="text-[10px] font-black bg-emerald-50 border border-emerald-100 px-4 py-1.5 rounded-full text-emerald-600 uppercase">Status: Success (200 OK)</span>
                            </div>
                            <div className="bg-white border border-slate-200/60 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/40 flex-1">
                              <div className="h-full overflow-y-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                  <thead className="bg-slate-50 text-slate-500 font-black sticky top-0 backdrop-blur-md z-10 border-b border-slate-100">
                                    <tr>
                                      {Object.keys(sqlResult.results[0] || {}).map(k => (
                                        <th key={k} className="px-8 py-5 uppercase tracking-widest text-[10px]">{k}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {sqlResult.results.map((row, i) => (
                                      <tr key={i} className="hover:bg-blue-50/20 transition-all duration-300">
                                        {Object.values(row).map((v: any, j) => (
                                          <td key={j} className="px-8 py-5 text-slate-700 font-bold">
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
                          <div className="bg-white border border-slate-200 p-8 rounded-[3rem] flex gap-6 animate-in fade-in shadow-sm">
                            <div className="bg-blue-600 p-3 rounded-2xl text-white h-fit shadow-lg shadow-blue-100">
                                <Info className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Technical Summary</p>
                                <p className="text-base text-slate-800 font-bold italic leading-relaxed tracking-tight">"{sqlResult.explanation}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Advanced Code Logic Trace */}
              <div className="bg-[#FAFBFD] border-t border-slate-100 px-12 py-10 shrink-0">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-xl text-slate-400 border border-slate-100 shadow-sm"><Code2 className="w-4 h-4" /></div>
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.25em]">Algorithm Execution Baseline</span>
                  </div>
                  {ragStep === RagStep.RETRIEVING && <div className="text-[10px] text-blue-600 font-black px-4 py-1.5 bg-blue-50 rounded-full border border-blue-100 shadow-sm uppercase tracking-widest">Op: vector_similarity_search</div>}
                </div>
                <pre className="code-font text-[11px] bg-white p-8 rounded-[2.5rem] border border-slate-200/50 overflow-x-auto text-slate-600 leading-[1.8] shadow-inner max-h-48 selection:bg-blue-100">
                  {mode === AppMode.DOCUMENT_RAG ? (
                    ragStep === RagStep.CHUNKING ? CODE_SNIPPETS.CHUNKING :
                    ragStep === RagStep.EMBEDDING ? CODE_SNIPPETS.EMBEDDING :
                    ragStep === RagStep.RETRIEVING || ragStep === RagStep.STORING ? CODE_SNIPPETS.RETRIEVAL :
                    ragStep === RagStep.GENERATING ? "// Prompt Augmentation Phase\n// Injects Top-K context fragments into the LLM context window.\n// template = \"Given the context: {ctx}, answer the query: {query}\"\n// result = llm.generate(template)" :
                    "// Orchestrator Awaiting Trigger. State: IDLE"
                  ) : (
                    CODE_SNIPPETS.SQL_GEN
                  )}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t px-8 py-5 flex items-center justify-between text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] shrink-0">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse' : 'bg-slate-200'}`} />
            {mode} ACTIVE
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-3 text-indigo-600">
             CURRENT STAGE: <span className="bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 tracking-tighter">{mode === AppMode.DOCUMENT_RAG ? ragStep : sqlStep}</span>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-8">
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 hover:text-slate-900 transition-colors cursor-help">Architecture Specs</span>
          <span className="text-slate-300">|</span>
          <span className="text-indigo-500">RAG-Demo Baseline V3.1</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
