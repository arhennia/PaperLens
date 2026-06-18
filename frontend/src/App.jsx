import { useState, useEffect, useRef } from 'react';
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
  Sparkles,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  BarChart2,
  PieChart,
  Calendar,
  Layers,
  Settings2,
  BookOpen,
  Activity
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function App() {
  // --- STATE MANAGEMENT ---
  const [dragActive, setDragActive] = useState(false);
  
  // Selection states
  const [selectedFiles, setSelectedFiles] = useState([]); // Array of { id, file, name, size, year }
  const [subject, setSubject] = useState('');
  const [examName, setExamName] = useState('');
  const [examType, setExamType] = useState('end_sem');
  const [totalMarks, setTotalMarks] = useState('');
  const [chapters, setChapters] = useState([]);
  const [chapterInput, setChapterInput] = useState('');
  const [showContextForm, setShowContextForm] = useState(false);

  // Flow states: 'idle' | 'uploading' | 'polling' | 'complete' | 'error'
  const [sessionStatus, setSessionStatus] = useState('idle');
  const [sessionId, setSessionId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pollingData, setPollingData] = useState(null);
  const [resolveYears, setResolveYears] = useState({}); // Mapping of paperId -> overrideYear

  // Loaded data states
  const [analyticsData, setAnalyticsData] = useState(null);
  const [questionsData, setQuestionsData] = useState([]); // Master ranked question list

  // Dashboard filter/UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChapterFilter, setSelectedChapterFilter] = useState('All');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('All');
  const [marksFilter, setMarksFilter] = useState('All'); // 'All' | '5+' | '8+'
  const [repeatedOnlyFilter, setRepeatedOnlyFilter] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [hoveredTrendPoint, setHoveredTrendPoint] = useState(null);

  const fileInputRef = useRef(null);

  // --- REGEX FOR YEAR EXTRACTION ---
  const parseYearFromFilename = (name) => {
    const match = name.match(/\b(20[0-3]\d|199\d)\b/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
  };

  // --- SELECTION HANDLERS ---
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const addFiles = (files) => {
    const newFiles = Array.from(files)
      .filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      .map(file => ({
        id: `${file.name}-${file.size}-${Date.now()}`,
        file,
        name: file.name,
        size: file.size,
        year: parseYearFromFilename(file.name)
      }));

    setSelectedFiles(prev => {
      // Avoid duplicate names in the selection list
      const filtered = newFiles.filter(nf => !prev.some(p => p.name === nf.name));
      return [...prev, ...filtered];
    });
  };

  const removeFile = (id) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleYearChange = (id, yearVal) => {
    setSelectedFiles(prev => prev.map(f => f.id === id ? { ...f, year: parseInt(yearVal) || '' } : f));
  };

  // Chapter tag helpers
  const handleAddChapter = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && chapterInput.trim()) {
      e.preventDefault();
      if (!chapters.includes(chapterInput.trim())) {
        setChapters(prev => [...prev, chapterInput.trim()]);
      }
      setChapterInput('');
    }
  };

  const removeChapter = (tag) => {
    setChapters(prev => prev.filter(c => c !== tag));
  };

  // --- SUBMISSION ACTION ---
  const handleStartAnalysis = async () => {
    if (selectedFiles.length === 0) return;
    setSessionStatus('uploading');
    setErrorMsg('');

    const formData = new FormData();
    selectedFiles.forEach(f => {
      formData.append('files', f.file);
    });

    if (subject.trim()) formData.append('subject', subject.trim());
    if (examName.trim()) formData.append('examName', examName.trim());
    formData.append('examType', examType);
    if (totalMarks) formData.append('totalMarks', totalMarks);
    if (chapters.length > 0) formData.append('chapters', JSON.stringify(chapters));
    
    // Construct year mapping
    const yearsMap = {};
    selectedFiles.forEach(f => {
      yearsMap[f.name] = f.year;
    });
    formData.append('years', JSON.stringify(yearsMap));

    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to create analysis session');
      }

      const data = await response.json();
      setSessionId(data.sessionId);
      setSessionStatus('polling');
    } catch (err) {
      console.error(err);
      setSessionStatus('error');
      setErrorMsg(err.message || 'Error uploading files to server.');
    }
  };

  // --- POLLING ENGINE ---
  useEffect(() => {
    if (sessionStatus !== 'polling' || !sessionId) return;

    let timer;
    const pollSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch session progress');
        }
        const data = await response.json();
        setPollingData(data);

        if (data.status === 'complete') {
          // Fetch final results & transition
          await loadDashboardData(sessionId);
          setSessionStatus('complete');
        } else if (data.status === 'failed') {
          // Check if it's because of year resolution
          const needsYearFile = data.papers.find(p => p.status === 'needs_year');
          if (needsYearFile) {
            setErrorMsg(`Year not detected for ${needsYearFile.filename}`);
          } else {
            setSessionStatus('error');
            setErrorMsg(data.error || 'Batch processing pipeline failed.');
          }
        } else {
          // Keep polling
          timer = setTimeout(pollSession, 2000);
        }
      } catch (err) {
        console.error(err);
        setSessionStatus('error');
        setErrorMsg(err.message || 'Error polling session status.');
      }
    };

    timer = setTimeout(pollSession, 1000);
    return () => clearTimeout(timer);
  }, [sessionStatus, sessionId]);

  // --- RESOLVE MISSING YEAR ---
  const handleResolveYearSubmit = async (paperId, filename) => {
    const overrideYearVal = resolveYears[paperId];
    if (!overrideYearVal) return;

    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/papers/${paperId}/year`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: parseInt(overrideYearVal) })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to update paper year');
      }

      // Reset resolution inputs, clear errors and return to polling state
      setResolveYears(prev => {
        const copy = { ...prev };
        delete copy[paperId];
        return copy;
      });
      setErrorMsg('');
      setSessionStatus('polling');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error updating paper year');
    }
  };

  // --- DASHBOARD DATA LOADING ---
  const loadDashboardData = async (sId) => {
    try {
      // 1. Load Analytics
      const responseAnalytics = await fetch(`${API_URL}/api/sessions/${sId}/analytics`);
      if (!responseAnalytics.ok) throw new Error('Failed to load dashboard metrics');
      const dataAnalytics = await responseAnalytics.json();
      setAnalyticsData(dataAnalytics.analytics);

      // 2. Load Ranked Questions
      const responseQuestions = await fetch(`${API_URL}/api/sessions/${sId}/questions`);
      if (!responseQuestions.ok) throw new Error('Failed to load ranked questions');
      const dataQuestions = await responseQuestions.json();
      setQuestionsData(dataQuestions.questions);
    } catch (err) {
      console.error(err);
      setSessionStatus('error');
      setErrorMsg(err.message || 'Error downloading analysis results.');
    }
  };

  // --- COPY VERBATIM TEXT HELPER ---
  const handleCopyText = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportCSV = () => {
    if (!sessionId) return;
    window.open(`${API_URL}/api/sessions/${sessionId}/export/csv`);
  };

  const resetUploader = () => {
    setSelectedFiles([]);
    setSubject('');
    setExamName('');
    setExamType('end_sem');
    setTotalMarks('');
    setChapters([]);
    setChapterInput('');
    setSessionStatus('idle');
    setSessionId(null);
    setPollingData(null);
    setErrorMsg('');
    setAnalyticsData(null);
    setQuestionsData([]);
    setSearchQuery('');
    setSelectedChapterFilter('All');
    setSelectedPriorityFilter('All');
    setMarksFilter('All');
    setRepeatedOnlyFilter(false);
    setExpandedQuestionId(null);
  };

  // --- FILTER QUESTIONS LIST ---
  const filteredQuestions = questionsData.filter(q => {
    // 1. Text Search query
    if (searchQuery) {
      const qText = q.canonicalText.toLowerCase();
      const qTopic = q.topicName.toLowerCase();
      const query = searchQuery.toLowerCase();
      if (!qText.includes(query) && !qTopic.includes(query)) return false;
    }
    // 2. Chapter Filter
    if (selectedChapterFilter !== 'All') {
      if (q.topicName !== selectedChapterFilter) return false;
    }
    // 3. Priority Level Filter
    if (selectedPriorityFilter !== 'All') {
      if (q.priorityLevel !== selectedPriorityFilter) return false;
    }
    // 4. Marks Range Filter
    if (marksFilter !== 'All') {
      const marksVal = q.maxMarks;
      if (marksFilter === '5+' && marksVal < 5) return false;
      if (marksFilter === '8+' && marksVal < 8) return false;
    }
    // 5. Repeated Only
    if (repeatedOnlyFilter) {
      if (q.occurrencesCount <= 1) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-x-hidden">
      
      {/* Premium Decorative Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-900/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-mono font-bold text-lg tracking-wider text-white">PAPERLENS</span>
              <span className="ml-2 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-semibold">
                Milestone 4
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">Multi-PDF Analysis Engine</span>
            {sessionStatus === 'complete' && (
              <button
                onClick={resetUploader}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-white rounded-lg transition-all"
              >
                Upload New Batch
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 flex flex-col items-center">
        
        {/* ======================================================== */}
        {/* PHASE 1: IDLE UPLOADER & CONFIG                          */}
        {/* ======================================================== */}
        {sessionStatus === 'idle' && (
          <div className="w-full max-w-3xl space-y-8 animate-[fadeIn_0.3s_ease-out]">
            
            {/* Intro */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Multi-PDF Exam Analyzer
              </h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Upload up to 5 Previous Year Question (PYQ) papers. PaperLens parses each paper, deduplicates questions, clusters concept variations, maps chapters, and generates a prioritized master study bank.
              </p>
            </div>

            {/* Selection Area Card */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-md shadow-2xl space-y-6">
              
              {/* Drop Zone */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 relative group overflow-hidden
                  ${dragActive 
                    ? 'border-indigo-500 bg-indigo-950/10 shadow-lg shadow-indigo-500/10' 
                    : 'border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-950/40'}`}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".pdf"
                  multiple
                  className="hidden" 
                  onChange={handleFileChange}
                />
                
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="flex flex-col items-center justify-center space-y-3 relative z-10">
                  <div className={`p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all duration-300 shadow-inner
                    ${dragActive ? 'scale-110 text-indigo-400 border-indigo-500/30' : ''}`}
                  >
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm mb-0.5">
                      Drag & drop multiple exam papers here
                    </p>
                    <p className="text-slate-500 text-xs">
                      or <span className="text-indigo-400 font-semibold group-hover:underline">browse files</span> from your device
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest px-2 py-0.5 rounded bg-slate-900/60 border border-slate-800/80">
                    PDF format only · Max 5 files
                  </span>
                </div>
              </div>

              {/* Selected Files Checklist */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
                  <h3 className="text-xs font-mono tracking-wider text-slate-400 uppercase flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Upload Queue ({selectedFiles.length})</span>
                  </h3>
                  <div className="border border-slate-800/80 rounded-xl divide-y divide-slate-800/60 overflow-hidden bg-slate-950/30">
                    {selectedFiles.map((item) => (
                      <div key={item.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-900/20">
                        <div className="flex items-center space-x-2.5 truncate">
                          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-slate-200 font-medium truncate max-w-xs sm:max-w-md">{item.name}</p>
                            <p className="text-[10px] text-slate-500">{(item.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                        </div>

                        {/* Year Picker / Override */}
                        <div className="flex items-center space-x-2 justify-between sm:justify-end">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] text-slate-500 font-mono">Exam Year:</span>
                            <select
                              value={item.year}
                              onChange={(e) => handleYearChange(item.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500/50"
                            >
                              {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map(yr => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            className="p-1.5 hover:bg-slate-800/60 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Context Form */}
              <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950/20">
                <button
                  type="button"
                  onClick={() => setShowContextForm(!showContextForm)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Settings2 className="w-4 h-4 text-indigo-400" />
                    <span>Syllabus Context &amp; Custom Settings (Optional)</span>
                  </div>
                  {showContextForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showContextForm && (
                  <div className="p-4 border-t border-slate-850 space-y-4 animate-[slideDown_0.2s_ease-out]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Subject Name */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block">Subject Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Operating Systems"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                        />
                      </div>

                      {/* Exam Name */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block">Exam Name</label>
                        <input
                          type="text"
                          placeholder="e.g. End Semester Exam"
                          value={examName}
                          onChange={(e) => setExamName(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Exam Type */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block">Exam Type</label>
                        <select
                          value={examType}
                          onChange={(e) => setExamType(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-lg text-slate-200 focus:outline-none transition-colors"
                        >
                          <option value="end_sem">End-Semester Exam</option>
                          <option value="mid_sem">Mid-Semester Exam</option>
                          <option value="internal">Internal / Class Test</option>
                          <option value="competitive">Competitive Exam</option>
                        </select>
                      </div>

                      {/* Total Marks */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block">Total Marks</label>
                        <input
                          type="number"
                          placeholder="e.g. 70"
                          value={totalMarks}
                          onChange={(e) => setTotalMarks(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    {/* Chapter Tags */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block">Topics / Chapters</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          placeholder="Type chapter name and click +"
                          value={chapterInput}
                          onChange={(e) => setChapterInput(e.target.value)}
                          onKeyDown={handleAddChapter}
                          className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500/50 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={handleAddChapter}
                          className="px-3 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Chapter Chips Container */}
                      {chapters.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {chapters.map(c => (
                            <span key={c} className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-900/50 text-indigo-300 text-[10px] font-semibold">
                              <span>{c}</span>
                              <button
                                type="button"
                                onClick={() => removeChapter(c)}
                                className="ml-1.5 text-indigo-400 hover:text-indigo-200 focus:outline-none font-bold"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={selectedFiles.length === 0}
                  onClick={handleStartAnalysis}
                  className={`px-6 py-2.5 rounded-xl text-xs font-semibold text-white transition-all flex items-center space-x-2 shadow-lg shadow-indigo-500/10 cursor-pointer
                    ${selectedFiles.length === 0 
                      ? 'bg-slate-800 text-slate-500 border border-slate-900 cursor-not-allowed shadow-none' 
                      : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border border-indigo-500/20'}`}
                >
                  <span>Start Multi-Paper Analysis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PHASE 2: UPLOADING STATE                                 */}
        {/* ======================================================== */}
        {sessionStatus === 'uploading' && (
          <div className="w-full max-w-md bg-slate-900/35 border border-slate-900/80 rounded-2xl p-8 text-center backdrop-blur-md shadow-2xl space-y-5">
            <div className="p-3 bg-indigo-950/40 rounded-full border border-indigo-900/50 text-indigo-400 w-12 h-12 flex items-center justify-center mx-auto animate-spin">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-white font-semibold text-base">Uploading Exam Papers</h3>
              <p className="text-slate-400 text-xs max-w-xs mx-auto">
                Saving files and initializing analysis session...
              </p>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PHASE 3: LIVE PIPELINE POLLING & RESOLUTION               */}
        {/* ======================================================== */}
        {sessionStatus === 'polling' && pollingData && (
          <div className="w-full max-w-xl bg-slate-900/40 border border-slate-900 backdrop-blur-md rounded-2xl p-6 shadow-2xl space-y-6 animate-[fadeIn_0.3s_ease-out]">
            
            {/* Status Stepper */}
            <div className="border-b border-slate-800/80 pb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-base flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                  <span>Pipeline Execution</span>
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950/50 border border-indigo-900/50 text-indigo-400 font-bold">
                  {pollingData.status}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-1">Session ID: {sessionId}</p>
            </div>

            {/* Live Progress Steppers */}
            <div className="space-y-4">
              {/* Stepper Steps */}
              <div className="relative pl-6 border-l border-slate-800 space-y-6 text-xs">
                
                {/* Step 1: Upload */}
                <div className="relative">
                  <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-emerald-950 font-bold">✓</span>
                  <div>
                    <h4 className="font-semibold text-slate-200">Session Initialized</h4>
                    <p className="text-slate-500 text-[10px]">PDF files saved to uploader server workspace</p>
                  </div>
                </div>

                {/* Step 2: Extraction */}
                <div className="relative">
                  {pollingData.status === 'created' || pollingData.status === 'extracting' ? (
                    <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] text-indigo-200 animate-pulse font-bold">⋯</span>
                  ) : (
                    <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-emerald-950 font-bold">✓</span>
                  )}
                  <div>
                    <h4 className="font-semibold text-slate-200">Per-PDF Processing &amp; Extraction</h4>
                    <p className="text-slate-500 text-[10px] mb-2">Running PyMuPDF parser and OCR services</p>
                    
                    {/* List of files with status checklist */}
                    <div className="border border-slate-850 rounded-lg divide-y divide-slate-850/80 bg-slate-950/30 text-[11px] overflow-hidden">
                      {pollingData.papers.map(p => (
                        <div key={p.id} className="p-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center space-x-2 truncate">
                            <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            <span className="text-slate-300 truncate font-mono">{p.filename}</span>
                          </div>

                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {p.status === 'extracting' && (
                              <span className="text-indigo-400 flex items-center space-x-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>extracting...</span>
                              </span>
                            )}
                            {p.status === 'queued' && <span className="text-slate-500">queued</span>}
                            {p.status === 'extracted' && (
                              <span className="text-emerald-400 flex items-center space-x-1">
                                <Check className="w-3 h-3" />
                                <span>{p.questionsFound} questions</span>
                              </span>
                            )}
                            {p.status === 'needs_year' && (
                              <span className="text-red-400 font-semibold">missing year</span>
                            )}
                            {p.status === 'failed' && <span className="text-red-400">failed</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 3: Deduplication and Scoring */}
                <div className="relative">
                  {pollingData.status === 'complete' ? (
                    <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-emerald-950 font-bold">✓</span>
                  ) : pollingData.status === 'merging' || pollingData.status === 'analyzing' ? (
                    <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] text-indigo-200 animate-pulse font-bold">⋯</span>
                  ) : (
                    <span className="absolute left-[-29px] top-0.5 w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[9px] text-slate-500 font-bold">3</span>
                  )}
                  <div>
                    <h4 className="font-semibold text-slate-300">Deduplication &amp; priority scoring</h4>
                    <p className="text-slate-500 text-[10px]">Grouping exact &amp; fuzzy duplicates, scoring across years</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Live Interactive Manual Year Resolution (if session halted on needs_year) */}
            {pollingData.papers.some(p => p.status === 'needs_year') && (
              <div className="border border-red-900/35 bg-red-950/10 rounded-xl p-4 space-y-3 animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center space-x-2 text-red-400 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>Action Required: Resolve Missing Exam Years</span>
                </div>
                <p className="text-red-300/80 text-[11px] leading-relaxed">
                  The PDF text extraction could not determine the exam year from the filenames or document content for the following papers. Please select the correct year and submit to resume the pipeline.
                </p>
                
                <div className="space-y-2.5 pt-1.5">
                  {pollingData.papers.filter(p => p.status === 'needs_year').map(p => (
                    <div key={p.id} className="p-3 bg-slate-950/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border border-slate-900">
                      <span className="font-mono text-slate-300 truncate sm:max-w-xs">{p.filename}</span>
                      
                      <div className="flex items-center space-x-2 self-end sm:self-auto">
                        <select
                          value={resolveYears[p.id] || ''}
                          onChange={(e) => setResolveYears(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 font-mono focus:outline-none"
                        >
                          <option value="">Select year...</option>
                          {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map(yr => (
                            <option key={yr} value={yr}>{yr}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!resolveYears[p.id]}
                          onClick={() => handleResolveYearSubmit(p.id, p.filename)}
                          className={`px-3 py-1 rounded font-semibold text-[11px] text-white transition-all cursor-pointer
                            ${!resolveYears[p.id] 
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                              : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'}`}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spinner message */}
            <div className="text-center text-[10px] text-slate-500 font-mono flex items-center justify-center space-x-2 pt-2 border-t border-slate-900/80">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Polling backend state... updates every 2 seconds</span>
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* PHASE 4: ERROR SCREEN                                    */}
        {/* ======================================================== */}
        {sessionStatus === 'error' && (
          <div className="w-full max-w-md bg-red-950/10 border border-red-900/30 rounded-2xl p-8 text-center backdrop-blur-sm space-y-4">
            <div className="p-3 bg-red-950/50 rounded-full border border-red-900/50 text-red-400 w-12 h-12 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-red-200 font-semibold text-base">Process Failed</h3>
              <p className="text-red-300/80 text-xs mt-1 max-w-xs mx-auto leading-relaxed">
                {errorMsg || 'An error occurred during multi-PDF session processing.'}
              </p>
            </div>
            <button
              onClick={resetUploader}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl text-xs font-semibold transition-all hover:border-slate-700 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* PHASE 5: COMPLETE DASHBOARD & RESULTS                   */}
        {/* ======================================================== */}
        {sessionStatus === 'complete' && analyticsData && (
          <div className="w-full space-y-8 animate-[fadeIn_0.4s_ease-out]">
            
            {/* Dashboard Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/20 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase font-bold">Exam Session Dashboard</span>
                <h2 className="text-xl font-bold text-white font-mono uppercase tracking-wide">
                  {subject || pollingData?.name || 'Operating Systems Exam Batch'}
                </h2>
                {examName && <p className="text-xs text-slate-400">{examName} ({examType.replace('_', ' ')})</p>}
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-emerald-450" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={resetUploader}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Analyze New Batch
                </button>
              </div>
            </div>

            {/* 1. Summary Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Total Papers */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Exam Papers</label>
                  <p className="text-2xl font-extrabold text-white">{analyticsData.total_papers}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-indigo-400">
                  <FileText className="w-5 h-5" />
                </div>
              </div>

              {/* Card 2: Total Raw Questions */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Parsed Questions</label>
                  <p className="text-2xl font-extrabold text-white">{analyticsData.total_raw_questions}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-emerald-400">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              {/* Card 3: Unique Concepts */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Unique Concepts</label>
                  <p className="text-2xl font-extrabold text-white">{analyticsData.total_unique_questions}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-amber-400">
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>

              {/* Card 4: Concept Repeat Rate % */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Repetition Rate</label>
                  <p className="text-2xl font-extrabold text-white">{analyticsData.repeat_rate}%</p>
                </div>
                {/* Custom SVG Mini Circular Progress Wheel */}
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg className="w-10 h-10 transform -rotate-90">
                    <circle cx="20" cy="20" r="16" stroke="#1e293b" strokeWidth="3.5" fill="transparent" />
                    <circle 
                      cx="20" 
                      cy="20" 
                      r="16" 
                      stroke="url(#progressGrad)" 
                      strokeWidth="3.5" 
                      fill="transparent" 
                      strokeDasharray={100}
                      strokeDashoffset={100 - analyticsData.repeat_rate} 
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute text-[9px] font-mono text-slate-300 font-bold">
                    {Math.round(analyticsData.repeat_rate)}%
                  </div>
                </div>
              </div>

            </div>

            {/* 2. Interactive Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Chart 1: Priority Distribution Donut */}
              <div className="bg-slate-900/40 border border-slate-900 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
                  <PieChart className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-mono tracking-wider uppercase text-slate-300">Priority Distribution</h3>
                </div>

                <div className="flex-1 flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
                  {/* Dynamic SVG Donut Chart */}
                  <div className="relative w-36 h-36 flex items-center justify-center flex-shrink-0">
                    <svg className="w-32 h-32" viewBox="0 0 100 100">
                      {/* Empty track */}
                      <circle cx="50" cy="50" r="40" stroke="#1e293b" strokeWidth="9" fill="transparent" />
                      {(() => {
                        const dist = analyticsData.priority_distribution;
                        const total = Object.values(dist).reduce((a, b) => a + b, 0);
                        let accumulatedPercent = 0;
                        const colorsMap = {
                          critical: '#B5353C',
                          very_high: '#C97A20',
                          high: '#2A7A55',
                          medium: '#1E5A9B',
                          low: '#5E7A8E'
                        };
                        const C = 2 * Math.PI * 40; // ~251.32
                        
                        if (total === 0) return null;

                        return Object.entries(dist).map(([key, val]) => {
                          if (val === 0) return null;
                          const percent = val / total;
                          const dasharray = `${percent * C} ${C}`;
                          const dashoffset = C - (accumulatedPercent * C);
                          accumulatedPercent += percent;
                          return (
                            <circle
                              key={key}
                              cx="50"
                              cy="50"
                              r="40"
                              stroke={colorsMap[key]}
                              strokeWidth="10"
                              fill="transparent"
                              strokeDasharray={dasharray}
                              strokeDashoffset={dashoffset}
                              transform="rotate(-90 50 50)"
                              strokeLinecap="butt"
                              className="transition-all duration-500 hover:stroke-[12] cursor-pointer"
                            />
                          );
                        });
                      })()}
                    </svg>
                    <div className="absolute text-center">
                      <p className="text-2xl font-extrabold text-white leading-none">
                        {Object.values(analyticsData.priority_distribution).reduce((a, b) => a + b, 0)}
                      </p>
                      <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono font-bold mt-1">Concepts</p>
                    </div>
                  </div>

                  {/* Donut Legend with Clickable Filters */}
                  <div className="space-y-2 text-[10px] w-full max-w-[150px]">
                    {[
                      { key: 'critical', label: 'Critical', colorBg: 'bg-[#B5353C]' },
                      { key: 'very_high', label: 'Very High', colorBg: 'bg-[#C97A20]' },
                      { key: 'high', label: 'High', colorBg: 'bg-[#2A7A55]' },
                      { key: 'medium', label: 'Medium', colorBg: 'bg-[#1E5A9B]' },
                      { key: 'low', label: 'Low', colorBg: 'bg-[#5E7A8E]' }
                    ].map(tier => {
                      const count = analyticsData.priority_distribution[tier.key] || 0;
                      return (
                        <button
                          key={tier.key}
                          onClick={() => setSelectedPriorityFilter(prev => prev === tier.key ? 'All' : tier.key)}
                          className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all hover:bg-slate-900/60
                            ${selectedPriorityFilter === tier.key 
                              ? 'border-indigo-500 bg-indigo-950/20 text-indigo-200' 
                              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <span className={`w-2 h-2 rounded-full ${tier.colorBg} flex-shrink-0`} />
                            <span>{tier.label}</span>
                          </div>
                          <span className="font-mono font-semibold">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Chart 2: Focus Areas Chapter Weightages */}
              <div className="bg-slate-900/40 border border-slate-900 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
                  <BarChart2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-mono tracking-wider uppercase text-slate-300">Exam Focus Weightages</h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1 max-h-48 scrollbar-thin">
                  {analyticsData.focus_areas && analyticsData.focus_areas.length > 0 ? (
                    analyticsData.focus_areas.map((area) => (
                      <div key={area.topic_id} className="space-y-1 text-[10px]">
                        <div className="flex justify-between font-mono">
                          <span className="text-slate-300 font-semibold truncate max-w-[150px] sm:max-w-xs">{area.name}</span>
                          <span className="text-indigo-400 font-bold">{area.freq_pct}% marks</span>
                        </div>
                        {/* Interactive Horizontal Progress Bar */}
                        <div 
                          onClick={() => setSelectedChapterFilter(prev => prev === area.name ? 'All' : area.name)}
                          className={`w-full h-2 rounded-full overflow-hidden cursor-pointer relative group
                            ${selectedChapterFilter === area.name ? 'bg-indigo-950 border border-indigo-900' : 'bg-slate-950'}`}
                        >
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500 group-hover:opacity-85" 
                            style={{ width: `${area.freq_pct}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-650 text-xs font-mono text-center">
                      No chapter focus metrics available. Provide chapter labels during upload.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 3: Year-wise Question Frequency Trend Line */}
              <div className="bg-slate-900/40 border border-slate-900 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-mono tracking-wider uppercase text-slate-300">Question Frequency Trend</h3>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-1 relative">
                  {analyticsData.year_trends && analyticsData.year_trends.length > 0 ? (
                    (() => {
                      const trends = analyticsData.year_trends;
                      const years = trends.map(t => t.year);
                      const counts = trends.map(t => t.count);
                      
                      const minYear = Math.min(...years);
                      const maxYear = Math.max(...years);
                      const minCount = 0;
                      const maxCount = Math.max(...counts, 4);
                      
                      const w = 240;
                      const h = 110;
                      const paddingLeft = 25;
                      const paddingRight = 10;
                      const paddingTop = 10;
                      const paddingBottom = 20;

                      const xRange = maxYear - minYear || 1;
                      const yRange = maxCount - minCount || 1;

                      const getX = (yr) => paddingLeft + ((yr - minYear) / xRange) * (w - paddingLeft - paddingRight);
                      const getY = (cnt) => (h - paddingBottom) - ((cnt - minCount) / yRange) * (h - paddingTop - paddingBottom);

                      const points = trends.map(t => ({
                        x: getX(t.year),
                        y: getY(t.count),
                        year: t.year,
                        count: t.count
                      }));

                      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      const areaPath = points.length > 0 
                        ? `${linePath} L ${points[points.length - 1].x} ${h - paddingBottom} L ${points[0].x} ${h - paddingBottom} Z`
                        : '';

                      return (
                        <div className="relative w-full flex flex-col items-center">
                          <svg className="w-full max-w-[280px]" viewBox={`0 0 ${w} ${h}`}>
                            <defs>
                              <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            
                            {/* Grid Lines */}
                            <line x1={paddingLeft} y1={paddingTop} x2={w - paddingRight} y2={paddingTop} stroke="#1e293b" strokeDasharray="3 3" />
                            <line x1={paddingLeft} y1={(paddingTop + h - paddingBottom) / 2} x2={w - paddingRight} y2={(paddingTop + h - paddingBottom) / 2} stroke="#1e293b" strokeDasharray="3 3" />
                            <line x1={paddingLeft} y1={h - paddingBottom} x2={w - paddingRight} y2={h - paddingBottom} stroke="#334155" strokeWidth="1.2" />

                            {/* Area Fill */}
                            {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

                            {/* Line Path */}
                            {linePath && <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}

                            {/* Interactive Dots */}
                            {points.map((p, idx) => (
                              <circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r="4"
                                fill="#ffffff"
                                stroke="#818cf8"
                                strokeWidth="2"
                                className="cursor-pointer transition-all hover:r-5.5 hover:fill-indigo-400"
                                onMouseEnter={() => setHoveredTrendPoint(p)}
                                onMouseLeave={() => setHoveredTrendPoint(null)}
                              />
                            ))}

                            {/* X-Axis labels */}
                            {points.map((p, idx) => (
                              <text
                                key={idx}
                                x={p.x}
                                y={h - 5}
                                fill="#64748b"
                                fontSize="7.5"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                {p.year}
                              </text>
                            ))}

                            {/* Y-Axis labels (Min & Max) */}
                            <text x={5} y={paddingTop + 3} fill="#64748b" fontSize="7" fontFamily="monospace">{maxCount}</text>
                            <text x={5} y={h - paddingBottom + 2} fill="#64748b" fontSize="7" fontFamily="monospace">0</text>
                          </svg>

                          {/* Hover Tooltip Box */}
                          <div className="h-5 text-[9px] font-mono text-slate-400 mt-1">
                            {hoveredTrendPoint ? (
                              <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-indigo-300">
                                <strong>{hoveredTrendPoint.year}</strong>: {hoveredTrendPoint.count} questions
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">Hover points to view totals</span>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-655 text-xs font-mono">
                      No trend metrics computed.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* 3. Master Question Bank Section */}
            <div className="bg-slate-900/40 border border-slate-900 backdrop-blur-md rounded-3xl p-6 shadow-xl space-y-6">
              
              {/* Toolbar Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800/80 gap-4">
                <div>
                  <h3 className="text-base font-bold text-white tracking-wide flex items-center space-x-2">
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    <span>Master Question Bank</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Ranked by Priority Score (frequency × recency × weight)</p>
                </div>

                {/* CSV Download Trigger */}
                <button
                  onClick={handleExportCSV}
                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer self-start sm:self-auto shadow-sm"
                >
                  <FileDown className="w-4 h-4 text-emerald-450" />
                  <span>Download Ranked Bank (CSV)</span>
                </button>
              </div>

              {/* Filters Sidebar Toolbar */}
              <div className="bg-slate-950/45 p-4 rounded-2xl border border-slate-900/85 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                
                {/* Search Bar */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Search</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-600">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search question texts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="block w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-850 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-550 focus:outline-none rounded-xl text-slate-200 placeholder-slate-600 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Chapter Filter */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Chapters</label>
                  <select
                    value={selectedChapterFilter}
                    onChange={(e) => setSelectedChapterFilter(e.target.value)}
                    className="block w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-850 focus:border-indigo-500/50 focus:outline-none rounded-xl text-slate-300"
                  >
                    <option value="All">All Chapters ({analyticsData.focus_areas?.length || 0})</option>
                    {analyticsData.focus_areas?.map(area => (
                      <option key={area.topic_id} value={area.name}>{area.name}</option>
                    ))}
                  </select>
                </div>

                {/* Priority Levels Filter */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Priority Tiers</label>
                  <select
                    value={selectedPriorityFilter}
                    onChange={(e) => setSelectedPriorityFilter(e.target.value)}
                    className="block w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-850 focus:border-indigo-500/50 focus:outline-none rounded-xl text-slate-300"
                  >
                    <option value="All">All Priorities</option>
                    <option value="critical">Critical</option>
                    <option value="very_high">Very High</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                {/* Marks Filter & Repetition Toggle Group */}
                <div className="flex items-center justify-between gap-4 pt-4 md:pt-0">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Marks</label>
                    <div className="flex space-x-1 p-0.5 bg-slate-950 border border-slate-850 rounded-xl">
                      {['All', '5+', '8+'].map(lbl => (
                        <button
                          key={lbl}
                          onClick={() => setMarksFilter(lbl)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                            marksFilter === lbl 
                              ? 'bg-indigo-600 text-white' 
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 flex flex-col justify-end text-right">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">Concept Frequency</label>
                    <label className="inline-flex items-center space-x-2 cursor-pointer self-end">
                      <span className="text-[10px] text-slate-400 font-medium font-mono">Repeated Only</span>
                      <input 
                        type="checkbox" 
                        checked={repeatedOnlyFilter}
                        onChange={(e) => setRepeatedOnlyFilter(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-slate-800 rounded bg-slate-950 focus:ring-indigo-500/30 focus:ring-opacity-25"
                      />
                    </label>
                  </div>
                </div>

              </div>

              {/* Main Questions List */}
              <div className="space-y-4">
                {filteredQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-950/20 border border-slate-900 rounded-2xl">
                    <AlertCircle className="w-10 h-10 text-slate-600 mb-3" />
                    <p className="text-slate-400 font-medium text-sm">No ranked concepts match your filter criteria.</p>
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedChapterFilter('All');
                        setSelectedPriorityFilter('All');
                        setMarksFilter('All');
                        setRepeatedOnlyFilter(false);
                      }}
                      className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  </div>
                ) : (
                  filteredQuestions.map((q) => {
                    const isExpanded = expandedQuestionId === q.id;
                    
                    // Style mapping for priority borders & badges
                    let borderCol = 'border-l-slate-600';
                    let textCol = 'text-slate-400';
                    let bgCol = 'bg-slate-900/40 border-slate-900';
                    
                    if (q.priorityLevel === 'critical') {
                      borderCol = 'border-l-red-600';
                      textCol = 'text-red-400';
                      bgCol = 'bg-red-950/5 border-red-900/10 hover:border-red-900/30';
                    } else if (q.priorityLevel === 'very_high') {
                      borderCol = 'border-l-orange-500';
                      textCol = 'text-orange-400';
                      bgCol = 'bg-orange-950/5 border-orange-900/10 hover:border-orange-900/30';
                    } else if (q.priorityLevel === 'high') {
                      borderCol = 'border-l-emerald-500';
                      textCol = 'text-emerald-400';
                      bgCol = 'bg-emerald-950/5 border-emerald-900/10 hover:border-emerald-900/30';
                    } else if (q.priorityLevel === 'medium') {
                      borderCol = 'border-l-blue-500';
                      textCol = 'text-blue-400';
                      bgCol = 'bg-blue-950/5 border-blue-900/10 hover:border-blue-900/30';
                    }

                    return (
                      <div 
                        key={q.id}
                        className={`border-l-4 rounded-xl p-4 transition-all duration-300 relative group overflow-hidden ${borderCol} ${bgCol}`}
                      >
                        {/* Background highlight */}
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                        {/* Top Summary Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 z-10 relative">
                          <div className="flex items-center space-x-2.5">
                            {/* Priority badge */}
                            <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md border font-mono ${textCol} border-current/25 bg-current/[0.03]`}>
                              {q.priorityLevel.replace('_', ' ')}
                            </span>
                            {/* Chapter Tag */}
                            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-950 border border-slate-850 text-slate-400">
                              {q.topicName}
                            </span>
                            {/* Occurrence badge */}
                            <span className="text-[10px] text-slate-500 font-mono font-semibold">
                              ×{q.occurrencesCount} occurrences ({q.firstYear === q.lastYear ? q.firstYear : `${q.firstYear}–${q.lastYear}`})
                            </span>
                          </div>

                          <div className="flex items-center space-x-3.5">
                            {/* Marks info */}
                            <span className="text-xs font-semibold text-emerald-450 font-mono">
                              Avg: {q.avgMarks} Marks
                            </span>
                            {/* Priority Score indicator */}
                            <div className="flex items-center space-x-1">
                              <span className="text-[9px] font-mono text-slate-500">Score:</span>
                              <span className="text-sm font-extrabold text-white font-mono">{Math.round(q.priorityScore)}</span>
                            </div>
                            {/* Expand toggle */}
                            <button
                              onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                              className="p-1 rounded bg-slate-950/80 border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Canonical text */}
                        <p className="text-slate-200 text-sm leading-relaxed mt-3 mb-1 font-medium select-text z-10 relative pr-6">
                          {q.canonicalText}
                        </p>

                        {/* Collapsible expanded section (Timeline and priority details) */}
                        {isExpanded && (
                          <div className="mt-5 pt-4 border-t border-slate-900/90 space-y-5 animate-[slideDown_0.2s_ease-out] z-10 relative">
                            
                            {/* Priority factors progress bars */}
                            <div className="space-y-3.5">
                              <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center space-x-1">
                                <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Priority Scoring Factors Breakdown</span>
                              </h4>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-[10px] bg-slate-950/40 p-3.5 rounded-xl border border-slate-900/80">
                                {[
                                  { label: 'Frequency (30%)', val: q.factors.frequency, desc: `${q.occurrencesCount} repetitions` },
                                  { label: 'Recency (25%)', val: q.factors.recency, desc: `last asked in ${q.lastYear}` },
                                  { label: 'Marks Weight (20%)', val: q.factors.marks, desc: `${q.avgMarks} average marks` },
                                  { label: 'Year Spread (15%)', val: q.factors.spread, desc: `${Math.round(q.factors.spread)}% session coverage` },
                                  { label: 'Cluster Concept Density (7%)', val: q.factors.cluster, desc: `cluster density index` },
                                  { label: 'Chapter Relevance Boost (3%)', val: q.factors.chapter, desc: `syllabus priority` }
                                ].map(f => (
                                  <div key={f.label} className="space-y-1">
                                    <div className="flex justify-between font-mono text-[9px]">
                                      <span className="text-slate-450 font-semibold">{f.label}</span>
                                      <span className="text-slate-300 font-bold">{Math.round(f.val)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden flex items-center">
                                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${f.val}%` }} />
                                    </div>
                                    <span className="text-[8px] text-slate-500 font-mono italic block">{f.desc}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Priority reasoning text block */}
                              <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/35 text-[11px] text-indigo-300 leading-relaxed">
                                <span className="font-bold block mb-0.5">Scoring Engine Summary:</span>
                                {q.priorityReason}
                              </div>
                            </div>

                            {/* Evolution timeline occurrence checklist */}
                            <div className="space-y-3">
                              <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center space-x-1.5">
                                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Verbatim Wording Timeline ({q.occurrencesCount} occurrences)</span>
                              </h4>
                              
                              <div className="space-y-2.5">
                                {q.evolution.map((occ, oIdx) => (
                                  <div key={oIdx} className="bg-slate-950/50 border border-slate-900 p-3 rounded-lg flex flex-col space-y-2 relative group/item">
                                    {/* Action icons (copy) */}
                                    <button
                                      onClick={() => handleCopyText(occ.verbatimText, `${q.id}-${oIdx}`)}
                                      className="absolute top-2 right-2 p-1 text-slate-500 hover:text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer flex items-center space-x-1 text-[9px]"
                                    >
                                      {copiedId === `${q.id}-${oIdx}` ? <Check className="w-3 h-3 text-emerald-450" /> : <Copy className="w-3 h-3" />}
                                      <span>{copiedId === `${q.id}-${oIdx}` ? 'Copied' : 'Copy'}</span>
                                    </button>

                                    {/* Header details */}
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                                      <span className="font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/40 px-2 py-0.2 rounded shadow-sm">
                                        {occ.year} Exam
                                      </span>
                                      <span className="text-slate-500">·</span>
                                      <span className="text-emerald-400 bg-emerald-950/30 border border-emerald-900/30 px-1.5 py-0.2 rounded font-semibold">
                                        {occ.marks} Marks
                                      </span>
                                      <span className="text-slate-500">·</span>
                                      <span className="text-slate-400">
                                        Number: <strong className="text-slate-300 font-semibold">{occ.questionNumber}</strong>
                                      </span>
                                      <span className="text-slate-500 hidden sm:inline">·</span>
                                      <span className="text-slate-500 truncate max-w-[150px] sm:max-w-xs block hidden sm:inline" title={occ.filename}>
                                        {occ.filename}
                                      </span>
                                    </div>
                                    {/* Verbatim wording */}
                                    <p className="text-slate-400 text-xs italic select-text pr-10 font-sans leading-relaxed">
                                      "{occ.verbatimText}"
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-6 mt-12 w-full z-10 relative">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
          <p>PaperLens © 2026 · Multi-PDF Study Analyzer</p>
          <p>Built with FastAPI, PyMuPDF, RapidFuzz &amp; React 19</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
