import { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Check, 
  Copy, 
  Search, 
  AlertCircle, 
  RefreshCw, 
  FileDown, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [extractionResult, setExtractionResult] = useState(null); // { filename, pageCount, extractedText }
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'raw_text'

  // Drag & drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const validateAndUpload = (selectedFile) => {
    setErrorMsg('');
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith?.('.pdf')) {
      // Fallback check if browser MIME type is missing
      if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
        setStatus('error');
        setErrorMsg('Invalid file type. Please upload a PDF file.');
        return;
      }
    }
    
    // Limit to 25MB for safety
    if (selectedFile.size > 25 * 1024 * 1024) {
      setStatus('error');
      setErrorMsg('File is too large. Maximum size is 25MB.');
      return;
    }

    setFile(selectedFile);
    uploadFile(selectedFile);
  };

  const loadDemoFile = async (url, filename) => {
    setStatus('uploading');
    setErrorMsg('');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch demo file: ${response.statusText}`);
      }
      const blob = await response.blob();
      const demoFile = new File([blob], filename, { type: 'application/pdf' });
      setFile(demoFile);
      uploadFile(demoFile);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Failed to load demo file.');
    }
  };

  const uploadFile = async (pdfFile) => {
    setStatus('uploading');
    const formData = new FormData();
    formData.append('file', pdfFile);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract text from PDF');
      }

      const data = await response.json();
      setExtractionResult(data);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Server error. Please ensure the backend is running.');
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleCopyText = async () => {
    if (!extractionResult?.extractedText) return;
    try {
      await navigator.clipboard.writeText(extractionResult.extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownloadText = () => {
    if (!extractionResult?.extractedText) return;
    const blob = new Blob([extractionResult.extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${extractionResult.filename.replace('.pdf', '')}_extracted.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetUploader = () => {
    setFile(null);
    setStatus('idle');
    setErrorMsg('');
    setExtractionResult(null);
    setSearchQuery('');
    setActiveTab('questions');
  };

  // Helper function to render text with highlighted search results
  const renderHighlightedText = (text) => {
    if (!searchQuery) return text;
    
    const parts = text.split(new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={index} className="bg-amber-400/30 text-amber-200 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Decorative gradient blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-900/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-mono font-bold text-lg tracking-wider text-white">PAPERLENS</span>
              <span className="ml-2 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-semibold">
                Milestone 3.1
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-mono"
            >
              Docs
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 flex flex-col items-center">
        
        {/* Intro */}
        <div className="text-center max-w-2xl mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent mb-4">
            Question Extraction Engine
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            PaperLens converts raw examination texts into clean, structured question lists.
            Upload a Previous Year Question (PYQ) paper PDF to parse pages and group questions with nested subquestions.
          </p>
        </div>

        {/* Upload State / Inactive Area */}
        {status === 'idle' && (
          <div className="w-full max-w-2xl">
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-sm relative group overflow-hidden
                ${dragActive 
                  ? 'border-indigo-500 bg-indigo-950/10 shadow-lg shadow-indigo-500/10' 
                  : 'border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/40'}`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".pdf"
                className="hidden" 
                onChange={handleFileChange}
              />
              
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              
              <div className="flex flex-col items-center justify-center space-y-4 relative z-10">
                <div className={`p-4 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all duration-300 shadow-inner
                  ${dragActive ? 'scale-110 text-indigo-400 border-indigo-500/30' : ''}`}
                >
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-white font-medium text-base mb-1">
                    Drag and drop your exam paper here
                  </p>
                  <p className="text-slate-500 text-sm">
                    or <span className="text-indigo-400 font-semibold group-hover:underline">browse files</span> from your device
                  </p>
                </div>
                <div className="pt-2">
                  <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest px-2.5 py-1 rounded bg-slate-900/60 border border-slate-800/80">
                    PDF format only · Max 25MB
                  </span>
                </div>
                <div className="pt-4 flex flex-col items-center space-y-2">
                  <p className="text-xs text-slate-500 font-medium">Or test with one of our demo exam papers:</p>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDemoFile('/demo_exam.pdf', 'sample_exam.pdf');
                      }}
                      className="px-3.5 py-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/60 hover:border-indigo-500/50 rounded-lg text-xs font-semibold text-indigo-300 transition-all cursor-pointer shadow-sm"
                    >
                      Load Text-Based Exam
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDemoFile('/demo_scanned_exam.pdf', 'scanned_exam.pdf');
                      }}
                      className="px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-900/60 hover:border-emerald-500/50 rounded-lg text-xs font-semibold text-emerald-300 transition-all cursor-pointer shadow-sm"
                    >
                      Load Scanned OCR Exam
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading / Processing State */}
        {status === 'uploading' && (
          <div className="w-full max-w-md bg-slate-900/35 border border-slate-900/80 rounded-2xl p-8 text-center backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-indigo-950">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 animate-[shimmer_1.5s_infinite]" style={{ width: '40%', backgroundSize: '200% 100%' }}></div>
            </div>
            
            <div className="flex flex-col items-center justify-center space-y-5">
              <div className="p-3 bg-indigo-950/40 rounded-full border border-indigo-900/50 text-indigo-400 animate-spin">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-white font-semibold text-lg">Parsing PDF Document</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto">
                  Uploading to server and running PyMuPDF text extractor...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="w-full max-w-md bg-red-950/10 border border-red-900/30 rounded-2xl p-8 text-center backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="p-3 bg-red-950/50 rounded-full border border-red-900/50 text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-red-200 font-semibold text-lg">Extraction Failed</h3>
                <p className="text-red-300/80 text-sm mt-1 max-w-xs mx-auto">
                  {errorMsg}
                </p>
              </div>
              <button
                onClick={resetUploader}
                className="mt-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl text-sm font-semibold transition-all hover:border-slate-700"
              >
                Try Another File
              </button>
            </div>
          </div>
        )}

        {/* Success / Result View */}
        {status === 'success' && extractionResult && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-[fadeIn_0.4s_ease-out]">
            
            {/* Metadata Card */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <h3 className="text-white font-bold text-base tracking-wide flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    <span>File Details</span>
                  </h3>
                  <button 
                    onClick={resetUploader}
                    className="text-xs text-slate-400 hover:text-indigo-400 flex items-center space-x-1 font-semibold transition-colors"
                  >
                    <span>Reset</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                      File Name
                    </label>
                    <p className="text-slate-200 font-mono text-sm break-all font-semibold bg-slate-950/60 p-3 rounded-xl border border-slate-900/80">
                      {extractionResult.filename}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                        Page Count
                      </label>
                      <p className="text-2xl font-extrabold text-indigo-400">
                        {extractionResult.pageCount}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                        Method
                      </label>
                      <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-semibold ${
                        extractionResult.extractionMethod === 'ocr'
                          ? 'bg-amber-950/40 border border-amber-900/50 text-amber-400'
                          : 'bg-emerald-950/40 border border-emerald-900/50 text-emerald-400'
                      }`}>
                        {extractionResult.extractionMethod === 'ocr' ? 'OCR EXTRACTION' : 'TEXT EXTRACTION'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                        Questions Found
                      </label>
                      <p className="text-2xl font-extrabold text-emerald-450">
                        {extractionResult.questionCount}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
                        Total Characters
                      </label>
                      <p className="text-slate-300 font-mono text-sm mt-1">
                        {extractionResult.extractedText.length.toLocaleString()} chars
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800/80 pt-4 flex flex-col space-y-2">
                  <button
                    onClick={handleCopyText}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-500/10 cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied!' : 'Copy Extracted Text'}</span>
                  </button>

                  <button
                    onClick={handleDownloadText}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Download TXT file</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Content Preview Card */}
            <div className="lg:col-span-2 bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 shadow-xl flex flex-col h-[600px]">
              
              {/* Tab Bar and Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/85 gap-4">
                
                {/* Tabs */}
                <div className="flex space-x-1 p-0.5 bg-slate-950 border border-slate-850 rounded-xl max-w-xs w-full sm:w-auto">
                  <button
                    onClick={() => setActiveTab('questions')}
                    className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeTab === 'questions'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                        : 'text-slate-400 hover:text-slate-250 hover:bg-slate-900/40'
                    }`}
                  >
                    Questions View
                  </button>
                  <button
                    onClick={() => setActiveTab('raw_text')}
                    className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeTab === 'raw_text'
                        ? 'bg-indigo-650 text-white shadow-md shadow-indigo-950'
                        : 'text-slate-400 hover:text-slate-250 hover:bg-slate-900/40'
                    }`}
                  >
                    Raw Text View
                  </button>
                </div>
                
                {/* Search Bar */}
                <div className="relative max-w-xs w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder={activeTab === 'questions' ? "Search questions..." : "Search inside text..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-9 pr-3 py-1.5 text-sm bg-slate-950 border border-slate-850 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-550 focus:outline-none rounded-xl text-slate-200 placeholder-slate-500 transition-all font-mono"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className={`absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-500 hover:text-slate-350 bg-transparent border-0 cursor-pointer`}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {/* Questions Tab Content */}
              {activeTab === 'questions' && (
                <div className="flex-1 overflow-y-auto mt-4 pr-2 space-y-4">
                  {/* Warnings Banner */}
                  {extractionResult.warnings && extractionResult.warnings.length > 0 && (
                    <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 flex flex-col space-y-2 mb-4 animate-[fadeIn_0.3s_ease-out]">
                      <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>Parser Warnings &amp; Sanity Checks</span>
                      </div>
                      <ul className="list-disc pl-5 text-xs text-amber-300/85 space-y-1">
                        {extractionResult.warnings.map((warn, wIdx) => (
                          <li key={wIdx}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {extractionResult.questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <AlertCircle className="w-12 h-12 text-slate-500 mb-4" />
                      <p className="text-slate-300 font-semibold text-lg">No Questions Detected</p>
                      <p className="text-slate-500 text-sm max-w-sm mt-1">
                        The Question Extraction Engine could not identify any standard question numbering or format patterns in this document.
                      </p>
                      <p className="text-slate-500 text-xs mt-4">
                        You can inspect the raw text using the <strong className="text-slate-400 font-semibold">Raw Text View</strong> tab.
                      </p>
                    </div>
                  ) : (() => {
                    const filteredQuestions = extractionResult.questions.filter(q => {
                      if (!searchQuery) return true;
                      const query = searchQuery.toLowerCase();
                      return (
                        q.questionNumber.toLowerCase().includes(query) ||
                        q.questionText.toLowerCase().includes(query) ||
                        (q.section && q.section.toLowerCase().includes(query))
                      );
                    });

                    if (filteredQuestions.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <AlertCircle className="w-10 h-10 text-slate-600 mb-3" />
                          <p className="text-slate-400 font-medium">No questions match your search query.</p>
                          <button 
                            onClick={() => setSearchQuery('')}
                            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                          >
                            Clear Search
                          </button>
                        </div>
                      );
                    }

                    return filteredQuestions.map((q, idx) => (
                      <div 
                        key={idx} 
                        className="bg-slate-950/50 border border-slate-900 hover:border-slate-800 rounded-xl p-5 transition-all flex flex-col space-y-4 relative group overflow-hidden"
                      >
                        {/* Card subtle hover highlight */}
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        
                        {/* Top row: Number, Section, Marks */}
                        <div className="flex flex-wrap items-center justify-between gap-2 z-10">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sm text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 px-2.5 py-0.5 rounded-lg shadow-sm">
                              {renderHighlightedText(q.questionNumber)}
                            </span>
                            {q.section && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-900 border border-slate-850 text-slate-400">
                                {renderHighlightedText(q.section)}
                              </span>
                            )}
                          </div>
                          
                          {q.marks !== undefined && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-900/50 text-emerald-450 font-mono">
                              {q.marks} {typeof q.marks === 'number' || !isNaN(q.marks) ? 'Marks' : ''}
                            </span>
                          )}
                        </div>
                        
                        {/* Body: Text */}
                        <p className="text-slate-300 text-sm leading-relaxed z-10 break-words select-text">
                          {renderHighlightedText(q.questionText)}
                        </p>

                        {/* Nested Subquestions List */}
                        {q.subquestions && q.subquestions.length > 0 && (
                          <div className="pl-6 border-l-2 border-indigo-950 space-y-3 mt-2 z-10">
                            {q.subquestions.map((sub, sIdx) => (
                              <div key={sIdx} className="bg-slate-900/30 border border-slate-900/60 rounded-lg p-3 hover:border-slate-850 transition-all flex flex-col space-y-2 relative">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-semibold text-xs text-indigo-350 bg-indigo-950/30 border border-indigo-900/40 px-2.5 py-0.5 rounded">
                                    {renderHighlightedText(sub.questionNumber)}
                                  </span>
                                  {sub.marks !== undefined && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-950/50 border border-slate-800 text-emerald-400 font-mono">
                                      {sub.marks} {typeof sub.marks === 'number' || !isNaN(sub.marks) ? 'Marks' : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed break-words select-text">
                                  {renderHighlightedText(sub.questionText)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Raw Text Tab Content */}
              {activeTab === 'raw_text' && (
                <div className="flex-1 overflow-y-auto mt-4 pr-2 bg-slate-950/40 rounded-xl p-4 border border-slate-900/80 font-mono text-sm leading-relaxed text-slate-300 break-words whitespace-pre-wrap select-text">
                  {renderHighlightedText(extractionResult.extractedText)}
                </div>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
          <p>PaperLens © 2026 · Built with FastAPI, PyMuPDF &amp; Tesseract OCR</p>
          <p>Milestone 3 — Question Extraction Engine</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
