import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Languages, AlertCircle, Loader2, Zap, BrainCircuit, History, Download, X, Trash2, Play, MapPin, ExternalLink, Building2, Sparkles, FileBadge, Star, BookOpen, ListTodo, Copy, CheckSquare, Type, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS } from './constants';
import { AppStatus, UploadedFile, HistoryItem, LocationInfo, OfficialDocInfo, Highlight } from './types';
import { translateDocument, generateSpeech, decodeAudioData, resolveLocation } from './services/geminiService';
import AudioPlayer from './components/AudioPlayer';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [targetLang, setTargetLang] = useState<string>('en');
  const [processingMode, setProcessingMode] = useState<'speed' | 'detailed'>('speed');
  
  const [translatedText, setTranslatedText] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [officialInfo, setOfficialInfo] = useState<OfficialDocInfo | null>(null);
  
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  
  // Font Size State
  const [fontSize, setFontSize] = useState<number>(18); // Default 18px (text-lg)

  // Language Selection State
  const [showAllLanguages, setShowAllLanguages] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // Highlighting State
  const [selectionMenu, setSelectionMenu] = useState<{x: number, y: number, text: string} | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current UI translation
  const ui = UI_TRANSLATIONS[targetLang] || UI_TRANSLATIONS['en'];
  const isRTL = targetLang === 'ar' || targetLang === 'ur';
  
  // Languages to display
  const displayedLanguages = showAllLanguages ? SUPPORTED_LANGUAGES : SUPPORTED_LANGUAGES.slice(0, 10);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('docuvoice_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history");
      }
    }
  }, []);

  // Handle outside click to close selection menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionMenu && !(e.target as HTMLElement).closest('.highlight-menu')) {
        setSelectionMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectionMenu]);

  const saveHistory = (newItem: HistoryItem) => {
    const updated = [newItem, ...history].slice(0, 20); // Keep last 20
    setHistory(updated);
    localStorage.setItem('docuvoice_history', JSON.stringify(updated));
  };

  const updateHistoryItem = (updatedItem: HistoryItem) => {
    const updated = history.map(item => item.id === updatedItem.id ? updatedItem : item);
    setHistory(updated);
    localStorage.setItem('docuvoice_history', JSON.stringify(updated));
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('docuvoice_history', JSON.stringify(updated));
    if (currentHistoryId === id) {
       setCurrentHistoryId(null);
       setStatus(AppStatus.IDLE);
       setTranslatedText('');
       setSummary('');
       setActionItems([]);
       setFile(null);
       setAudioBuffer(null);
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setTranslatedText(item.text);
    setSummary(item.summary || '');
    setActionItems(item.actionItems || []);
    setTargetLang(item.targetLanguage);
    setLocationInfo(item.location || null);
    setOfficialInfo(item.officialInfo || null);
    setFile({ name: item.fileName, type: 'application/pdf', data: '' });
    setAudioBuffer(null);
    setStatus(AppStatus.READY);
    setShowHistory(false);
    setCurrentHistoryId(item.id);
  };

  const downloadTranslation = () => {
    const element = document.createElement("a");
    const file = new Blob([translatedText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `translation-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          if (ctx) {
             ctx.fillStyle = 'white';
             ctx.fillRect(0, 0, width, height);
             ctx.drawImage(img, 0, 0, width, height);
          }
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = (err) => reject(new Error("Failed to load image"));
      };
      reader.onerror = (err) => reject(new Error("Failed to read file"));
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMsg("File is too large. Please select a file under 10MB.");
      return;
    }

    try {
      setErrorMsg('');
      setStatus(AppStatus.IDLE);
      setAudioBuffer(null);
      setTranslatedText('');
      setSummary('');
      setActionItems([]);
      setLocationInfo(null);
      setOfficialInfo(null);
      setFile(null);
      setCurrentHistoryId(null);
      setSelectionMenu(null);
      
      let base64Data = '';
      let fileType = selectedFile.type;

      if (selectedFile.type.startsWith('image/')) {
        setIsCompressing(true);
        try {
          base64Data = await compressImage(selectedFile);
          fileType = 'image/jpeg';
        } catch (e) {
          console.error("Compression failed, using original", e);
           const reader = new FileReader();
           base64Data = await new Promise((resolve) => {
              reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
              reader.readAsDataURL(selectedFile);
           });
        }
        setIsCompressing(false);
      } else {
        const reader = new FileReader();
        base64Data = await new Promise((resolve) => {
            reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
            reader.readAsDataURL(selectedFile);
        });
      }

      setFile({
        name: selectedFile.name,
        type: fileType,
        data: base64Data,
      });

    } catch (err) {
      setIsCompressing(false);
      setErrorMsg("Error processing file.");
    }
  };

  const generateAudioOnly = async () => {
    if (!translatedText) return;
    
    // Combine Summary and Full Text
    let textToRead = translatedText;
    if (summary && summary.length > 0) {
      textToRead = `Summary. ${summary}. \n\n Full Document Translation. ${translatedText}`;
    }

    try {
      setStatus(AppStatus.GENERATING_AUDIO);
      const audioBase64 = await generateSpeech(textToRead);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = await decodeAudioData(audioBase64, audioCtx);
      setAudioBuffer(buffer);
      setStatus(AppStatus.READY);
      if (audioCtx.state !== 'closed') audioCtx.close();
    } catch (err) {
      console.error(err);
      setStatus(AppStatus.READY);
      setErrorMsg("Failed to generate audio.");
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    try {
      setErrorMsg('');
      setStatus(AppStatus.TRANSLATING);
      setTranslatedText('');
      setSummary('');
      setActionItems([]);
      setLocationInfo(null);
      setOfficialInfo(null);
      setSelectionMenu(null);

      // Step 1: Translate and Extract Metadata
      const { text, summary, actionItems, address, officialInfo } = await translateDocument(file.data, file.type, targetLang, processingMode);
      setTranslatedText(text);
      setSummary(summary);
      setActionItems(actionItems);
      setOfficialInfo(officialInfo);

      let locationData: LocationInfo | undefined = undefined;

      // Step 1.5: Resolve Location if address found
      if (address) {
        setStatus(AppStatus.RESOLVING_LOCATION);
        const resolved = await resolveLocation(address);
        locationData = {
          address,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          mapUri: resolved.mapUri
        };
        setLocationInfo(locationData);
      }

      setStatus(AppStatus.GENERATING_AUDIO);

      // Step 2: Generate Audio - Include both Summary and Text
      let textForAudio = text;
      if (summary && summary.length > 0) {
        textForAudio = `Summary. ${summary}. \n\n Full Document Translation. ${text}`;
      }

      const audioBase64 = await generateSpeech(textForAudio);
      
      // Step 3: Decode Audio for playback
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = await decodeAudioData(audioBase64, audioCtx);
      
      setAudioBuffer(buffer);
      setStatus(AppStatus.READY);

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fileName: file.name,
        targetLanguage: targetLang,
        text: text,
        summary: summary,
        actionItems: actionItems,
        location: locationData,
        officialInfo: officialInfo || undefined,
        highlights: []
      };

      // Save to History
      saveHistory(newHistoryItem);
      setCurrentHistoryId(newHistoryItem.id);
      
      if (audioCtx.state !== 'closed') {
        audioCtx.close();
      }

    } catch (err) {
      console.error(err);
      setStatus(AppStatus.ERROR);
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  // Text Selection Handling
  const handleTextMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionMenu(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) return;

    // Check if selection is inside the translated text area
    if (textContainerRef.current && textContainerRef.current.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectionMenu({
        x: rect.left + (rect.width / 2),
        y: rect.top - 10,
        text: text
      });
    } else {
      setSelectionMenu(null);
    }
  };

  const handleCopySelection = () => {
    if (selectionMenu) {
      navigator.clipboard.writeText(selectionMenu.text);
      setSelectionMenu(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleSaveHighlight = (category: 'important' | 'vocabulary' | 'action') => {
    if (!selectionMenu || !currentHistoryId) return;

    const currentItem = history.find(h => h.id === currentHistoryId);
    if (!currentItem) return;

    const newHighlight: Highlight = {
      id: Date.now().toString(),
      text: selectionMenu.text,
      category,
      timestamp: Date.now()
    };

    const updatedItem = {
      ...currentItem,
      highlights: [...(currentItem.highlights || []), newHighlight]
    };

    updateHistoryItem(updatedItem);
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteHighlight = (highlightId: string) => {
    if (!currentHistoryId) return;
    const currentItem = history.find(h => h.id === currentHistoryId);
    if (!currentItem) return;

    const updatedItem = {
      ...currentItem,
      highlights: currentItem.highlights?.filter(h => h.id !== highlightId) || []
    };
    updateHistoryItem(updatedItem);
  };

  // Font Size Handlers
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 2, 32));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 2, 14));

  // Derived state for current highlights
  const currentHighlights = currentHistoryId 
    ? history.find(h => h.id === currentHistoryId)?.highlights || []
    : [];

  return (
    <div 
      className={`min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 relative overflow-x-hidden ${isRTL ? 'rtl' : ''}`} 
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <header className="max-w-3xl w-full flex items-center justify-between mb-8 relative z-10">
        <div></div> {/* Spacer */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-indigo-900 mb-2 tracking-tight">
            {ui.appTitle}
          </h1>
          <p className="text-lg text-slate-600 hidden sm:block">
            {ui.appSubtitle}
          </p>
        </div>
        <button 
          onClick={() => setShowHistory(true)}
          className="p-3 bg-white text-slate-600 rounded-full shadow-md hover:bg-slate-50 transition-transform hover:scale-105 border border-slate-200"
          title={ui.history}
        >
          <History size={24} />
        </button>
      </header>

      {/* Language Selection Bar (New) */}
      <div className="max-w-3xl w-full mb-8 z-0">
        <p className="text-center text-slate-500 mb-4 text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2">
          <Languages size={16} />
          {ui.selectLanguage}
        </p>
        <div className="flex flex-wrap justify-center gap-2 px-2">
           {displayedLanguages.map((lang) => (
             <button
               key={lang.code}
               onClick={() => {
                 setTargetLang(lang.code);
                 if (status === AppStatus.READY) {
                    // Optionally reset if user changes language after processing, or allow re-process
                    // For now, let's keep it simple. If they want to re-translate, they hit the button below.
                 }
               }}
               disabled={status === AppStatus.TRANSLATING || status === AppStatus.GENERATING_AUDIO}
               className={`px-4 py-2 rounded-full text-sm font-medium transition-all shadow-sm border 
                 ${targetLang === lang.code 
                   ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105 ring-2 ring-indigo-200' 
                   : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                 } disabled:opacity-50 disabled:cursor-not-allowed`}
             >
               {lang.nativeName}
             </button>
           ))}
           <button
             onClick={() => setShowAllLanguages(!showAllLanguages)}
             className="px-3 py-2 rounded-full text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors flex items-center gap-1 border border-transparent hover:border-slate-200"
           >
             {showAllLanguages ? (
               <><ChevronUp size={14} /> {ui.showLess}</>
             ) : (
               <><ChevronDown size={14} /> {ui.showMore}</>
             )}
           </button>
        </div>
      </div>

      {/* History Sidebar */}
      <div 
        className={`fixed inset-y-0 right-0 w-full sm:w-80 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 border-l border-slate-200 flex flex-col ${
          showHistory ? 'translate-x-0' : (isRTL ? '-translate-x-full' : 'translate-x-full')
        }`}
        style={isRTL ? { left: 0, right: 'auto', borderRight: '1px solid #e2e8f0', borderLeft: 'none' } : {}}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <History size={20} /> {ui.history}
          </h2>
          <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-slate-800">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {history.length === 0 ? (
            <div className="text-center text-slate-400 py-10">
              <p>{ui.noHistory}</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => loadHistoryItem(item)}
                className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group ${currentHistoryId === item.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-indigo-400'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-slate-800 text-sm truncate w-40">{item.fileName}</h3>
                  <button 
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {item.officialInfo?.isOfficial && (
                   <div className="mb-2">
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 uppercase tracking-wide">
                        {ui.officialTag}
                      </span>
                   </div>
                )}
                {item.highlights && item.highlights.length > 0 && (
                  <div className="flex gap-1 mb-2">
                    {item.highlights.some(h => h.category === 'important') && <div className="w-2 h-2 rounded-full bg-yellow-400"></div>}
                    {item.highlights.some(h => h.category === 'action') && <div className="w-2 h-2 rounded-full bg-red-400"></div>}
                    {item.highlights.some(h => h.category === 'vocabulary') && <div className="w-2 h-2 rounded-full bg-green-400"></div>}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                  <span className="bg-slate-100 px-2 py-1 rounded-md">{item.targetLanguage}</span>
                  <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  {item.location && (
                    <MapPin size={12} className="text-indigo-500" />
                  )}
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 italic">
                  "{item.summary ? item.summary.substring(0, 60) : item.text.substring(0, 60)}..."
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {showHistory && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          onClick={() => setShowHistory(false)}
        />
      )}

      {/* Text Selection Floating Menu */}
      {selectionMenu && (
        <div 
          className="fixed z-50 flex items-center gap-1 p-1 bg-slate-800 rounded-lg shadow-xl highlight-menu animate-in fade-in zoom-in duration-200"
          style={{ 
            left: `${selectionMenu.x}px`, 
            top: `${selectionMenu.y}px`,
            transform: 'translate(-50%, -100%) translateY(-10px)'
          }}
        >
          <button 
            onClick={handleCopySelection}
            className="p-2 text-white hover:bg-slate-700 rounded-md transition-colors tooltip" 
            title="Copy Text"
          >
            <Copy size={16} />
          </button>
          <div className="w-px h-4 bg-slate-600 mx-1"></div>
          <button 
            onClick={() => handleSaveHighlight('important')}
            className="p-2 text-yellow-300 hover:bg-slate-700 rounded-md transition-colors"
            title="Mark as Important"
          >
            <Star size={16} />
          </button>
          <button 
            onClick={() => handleSaveHighlight('action')}
            className="p-2 text-red-300 hover:bg-slate-700 rounded-md transition-colors"
            title="Action Item"
          >
            <ListTodo size={16} />
          </button>
          <button 
            onClick={() => handleSaveHighlight('vocabulary')}
            className="p-2 text-green-300 hover:bg-slate-700 rounded-md transition-colors"
            title="Save Term"
          >
            <BookOpen size={16} />
          </button>
          
          {/* Arrow */}
          <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-800"></div>
        </div>
      )}

      <main className="max-w-6xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 relative z-0">
        
        {/* Upload Section (Simplified) */}
        <div className="p-8 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="bg-slate-100 p-2 rounded-lg text-slate-600"><Upload size={20} /></span>
            {ui.step1}
          </h2>
          
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer relative
              ${file ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
            onClick={() => !isCompressing && fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={isCompressing}
            />
            
            {isCompressing ? (
              <div className="flex flex-col items-center py-4">
                <Loader2 size={48} className="text-indigo-600 animate-spin mb-2" />
                <p className="font-medium text-indigo-900">{ui.optimizing}</p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center">
                <FileText size={48} className="text-indigo-600 mb-2" />
                <p className="font-medium text-indigo-900">{file.name}</p>
                <p className="text-sm text-indigo-600 mt-1">{ui.changeFile}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload size={48} className="text-slate-300 mb-2" />
                <p className="font-medium text-slate-700">{ui.uploadPrompt}</p>
                <p className="text-sm text-slate-400 mt-1">{ui.uploadSupport}</p>
              </div>
            )}
          </div>
        </div>

        {/* Removed Step 2: Choose Language (Moved to Header) */}

        {/* Action Button & Results */}
        <div className="p-8 bg-slate-50/30">
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 border border-red-100">
              <AlertCircle size={20} />
              {errorMsg}
            </div>
          )}

          {status === AppStatus.READY ? (
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                {/* Audio Player */}
                {audioBuffer ? (
                  <AudioPlayer audioBuffer={audioBuffer} labels={ui.audioPlayer} />
                ) : (
                  <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100 text-center">
                    <p className="text-indigo-900 mb-4 font-medium">{ui.viewHistoryPrompt}</p>
                    <button 
                      onClick={generateAudioOnly}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-full font-bold shadow-md hover:bg-indigo-700 flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105"
                    >
                      <Play size={20} fill="currentColor" /> {ui.generateAudio}
                    </button>
                  </div>
                )}
                
                {/* Simplified Summary Card (Crucial for uneducated users) */}
                {summary && (
                  <div className="bg-emerald-50 rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                    <div className="px-6 py-3 border-b border-emerald-100 flex items-center gap-2 bg-emerald-100/50">
                      <Sparkles size={20} className="text-emerald-600" />
                      <h3 className="font-bold text-emerald-900">{ui.summaryTitle}</h3>
                    </div>
                    <div className="p-6 text-emerald-900 text-lg leading-relaxed">
                      {summary}
                    </div>
                  </div>
                )}

                {/* Action Items Checklist Card */}
                {actionItems && actionItems.length > 0 && (
                  <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 overflow-hidden">
                    <div className="px-6 py-3 border-b border-blue-100 flex items-center gap-2 bg-blue-100/50">
                      <CheckSquare size={20} className="text-blue-600" />
                      <h3 className="font-bold text-blue-900">{ui.actionItemsTitle}</h3>
                    </div>
                    <div className="p-6">
                      <ul className="space-y-3">
                        {actionItems.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <div className="mt-1 w-5 h-5 rounded border-2 border-blue-300 flex items-center justify-center shrink-0 bg-white">
                              {/* Empty checkbox visual for 'to-do' feel */}
                            </div>
                            <span className="text-blue-900 text-lg leading-snug font-medium">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Government Official Details Card */}
                {officialInfo?.isOfficial && (
                   <div className="bg-amber-50 rounded-xl shadow-sm border border-amber-200 overflow-hidden">
                     <div className="px-6 py-3 border-b border-amber-100 flex items-center justify-between bg-amber-100/50">
                        <div className="flex items-center gap-2">
                          <Building2 size={20} className="text-amber-700" />
                          <h3 className="font-bold text-amber-900">{ui.officialDetails}</h3>
                        </div>
                        <span className="text-xs font-bold bg-amber-600 text-white px-2 py-1 rounded-md uppercase tracking-wider">{ui.officialTag}</span>
                     </div>
                     <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {officialInfo.goNumber && (
                          <div className="bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                            <span className="text-xs text-amber-600 uppercase font-bold block mb-1">{ui.goNumber}</span>
                            <span className="font-mono text-slate-800 font-medium">{officialInfo.goNumber}</span>
                          </div>
                        )}
                        {officialInfo.date && (
                          <div className="bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                            <span className="text-xs text-amber-600 uppercase font-bold block mb-1">{ui.date}</span>
                            <span className="text-slate-800 font-medium">{officialInfo.date}</span>
                          </div>
                        )}
                        {officialInfo.department && (
                          <div className="col-span-1 md:col-span-2 bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                            <span className="text-xs text-amber-600 uppercase font-bold block mb-1">{ui.department}</span>
                            <span className="text-slate-800 font-medium">{officialInfo.department}</span>
                          </div>
                        )}
                        {officialInfo.subject && (
                          <div className="col-span-1 md:col-span-2 bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                            <span className="text-xs text-amber-600 uppercase font-bold block mb-1">{ui.subject}</span>
                            <span className="text-slate-800 italic">{officialInfo.subject}</span>
                          </div>
                        )}
                     </div>
                   </div>
                )}

                {/* Location Card */}
                {locationInfo && (
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <MapPin size={20} className="text-indigo-600" />
                        {ui.locationTitle}
                      </h3>
                      {locationInfo.mapUri && (
                         <a href={locationInfo.mapUri} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                           {ui.openMaps} <ExternalLink size={12}/>
                         </a>
                      )}
                    </div>
                    <div className="p-6">
                      <p className="text-slate-800 font-medium mb-1">{locationInfo.address}</p>
                      {locationInfo.latitude && locationInfo.longitude ? (
                        <div className="space-y-4">
                           <p className="text-xs text-slate-500 font-mono">
                            LAT: {locationInfo.latitude.toFixed(6)}, LNG: {locationInfo.longitude.toFixed(6)}
                           </p>
                           <div className="w-full h-48 bg-slate-100 rounded-lg overflow-hidden relative">
                             <iframe
                               width="100%"
                               height="100%"
                               frameBorder="0"
                               scrolling="no"
                               marginHeight={0}
                               marginWidth={0}
                               src={`https://maps.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}&z=15&output=embed`}
                               title="Location Map"
                               className="absolute inset-0"
                             />
                           </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic mt-2">{ui.coordinatesNotFound || "Coordinates not found."}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Translated Text Display */}
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{ui.fullTranslation}</h3>
                    
                    <div className="flex items-center gap-3">
                       {/* Font Size Controls */}
                       <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                          <button 
                            onClick={decreaseFontSize} 
                            className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"
                            title="Decrease text size"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-xs font-bold w-4 text-center text-slate-600"><Type size={14} /></span>
                          <button 
                            onClick={increaseFontSize} 
                            className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600"
                            title="Increase text size"
                          >
                            <Plus size={14} />
                          </button>
                       </div>

                       <div className="w-px h-4 bg-slate-200"></div>

                       <button 
                        onClick={downloadTranslation}
                        className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm font-medium hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Download size={16} /> <span className="hidden sm:inline">{ui.download}</span>
                      </button>
                    </div>
                  </div>
                  <div 
                    ref={textContainerRef}
                    onMouseUp={handleTextMouseUp}
                    style={{ fontSize: `${fontSize}px` }}
                    className="prose prose-slate max-w-none text-slate-800 leading-relaxed whitespace-pre-wrap selection:bg-indigo-200 selection:text-indigo-900 cursor-text transition-all duration-200"
                  >
                    {translatedText}
                  </div>
                </div>
                
                {/* Saved Highlights Section */}
                {currentHighlights.length > 0 && (
                   <div className="space-y-4">
                     <h3 className="font-bold text-slate-700 flex items-center gap-2">
                       <Star size={20} className="text-yellow-500 fill-yellow-500" />
                       {ui.savedHighlights}
                     </h3>
                     <div className="grid grid-cols-1 gap-3">
                       {currentHighlights.map((hl) => (
                         <div 
                            key={hl.id} 
                            className={`p-4 rounded-xl border-l-4 shadow-sm bg-white flex items-start gap-3 transition-transform hover:scale-[1.01] ${
                              hl.category === 'important' ? 'border-l-yellow-400' :
                              hl.category === 'action' ? 'border-l-red-400' : 'border-l-green-400'
                            }`}
                         >
                           <div className={`p-2 rounded-full shrink-0 ${
                              hl.category === 'important' ? 'bg-yellow-100 text-yellow-600' :
                              hl.category === 'action' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                           }`}>
                             {hl.category === 'important' && <Star size={16} />}
                             {hl.category === 'action' && <ListTodo size={16} />}
                             {hl.category === 'vocabulary' && <BookOpen size={16} />}
                           </div>
                           <div className="flex-1">
                             <p className="text-slate-800 italic">"{hl.text}"</p>
                             <div className="flex justify-between items-center mt-2">
                               <span className={`text-xs font-bold uppercase tracking-wide ${
                                  hl.category === 'important' ? 'text-yellow-600' :
                                  hl.category === 'action' ? 'text-red-600' : 'text-green-600'
                               }`}>
                                 {hl.category}
                               </span>
                               <button 
                                 onClick={() => handleDeleteHighlight(hl.id)}
                                 className="text-slate-300 hover:text-red-500 transition-colors"
                               >
                                 <Trash2 size={14} />
                               </button>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                )}

                <button 
                  onClick={() => {
                    setStatus(AppStatus.IDLE);
                    setTranslatedText('');
                    setSummary('');
                    setActionItems([]);
                    setAudioBuffer(null);
                    setFile(null);
                    setLocationInfo(null);
                    setOfficialInfo(null);
                    setCurrentHistoryId(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="w-full py-4 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
                >
                  {ui.startOver}
                </button>
             </div>
          ) : (
            <>
              {/* Mode Selection */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button 
                  onClick={() => setProcessingMode('speed')}
                  disabled={!file || status !== AppStatus.IDLE}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    processingMode === 'speed' 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                      : 'border-slate-200 hover:border-indigo-300 text-slate-600'
                  } ${(!file || status !== AppStatus.IDLE) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Zap size={24} className={processingMode === 'speed' ? 'fill-indigo-200' : ''} />
                  <div className="text-center">
                    <span className="block font-bold text-sm">{ui.fastMode}</span>
                    <span className="block text-xs opacity-75">{ui.fastModeDesc}</span>
                  </div>
                </button>
                <button 
                  onClick={() => setProcessingMode('detailed')}
                  disabled={!file || status !== AppStatus.IDLE}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    processingMode === 'detailed' 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                      : 'border-slate-200 hover:border-indigo-300 text-slate-600'
                  } ${(!file || status !== AppStatus.IDLE) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <BrainCircuit size={24} className={processingMode === 'detailed' ? 'fill-indigo-200' : ''} />
                  <div className="text-center">
                    <span className="block font-bold text-sm">{ui.detailedMode}</span>
                    <span className="block text-xs opacity-75">{ui.detailedModeDesc}</span>
                  </div>
                </button>
              </div>

              <button
                onClick={handleProcess}
                disabled={!file || status !== AppStatus.IDLE || isCompressing}
                className={`w-full py-5 rounded-xl text-xl font-bold text-white shadow-lg transition-all transform flex items-center justify-center gap-3
                  ${!file || status !== AppStatus.IDLE || isCompressing
                    ? 'bg-slate-400 cursor-not-allowed opacity-70' 
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] hover:shadow-indigo-200'}`}
              >
                {status === AppStatus.IDLE && (
                  <>
                    <CheckCircle size={24} />
                    {ui.translateBtn}
                  </>
                )}
                {status === AppStatus.TRANSLATING && (
                  <>
                    <Loader2 size={24} className="animate-spin" />
                    {ui.analyzing}
                  </>
                )}
                {status === AppStatus.RESOLVING_LOCATION && (
                  <>
                    <MapPin size={24} className="animate-bounce" />
                    {ui.findingLocation}
                  </>
                )}
                {status === AppStatus.GENERATING_AUDIO && (
                  <>
                    <Loader2 size={24} className="animate-spin" />
                    {ui.generating}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </main>
      
      <footer className="mt-12 text-slate-400 text-sm">
        Powered by Gemini 2.5 & 3 Flash
      </footer>
    </div>
  );
};

export default App;