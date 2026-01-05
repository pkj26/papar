import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Printer, Download, Sparkles, ClipboardPaste, FileType, BrainCircuit, FileCheck, PlusCircle, Code, FileText, Shuffle, Database, LayoutTemplate } from 'lucide-react';
import { QuestionGroup, JobStatus } from './types';
import { generateHtmlFromImages, remixHtmlContent, generateSolutionFromHtml } from './services/geminiService';
import { QuestionGroupItem } from './components/QuestionGroup';
import { PreviewModal } from './components/PreviewModal';
import { VoterListMode } from './components/VoterListMode';

// Defined shape of the new fixed header
interface HeaderConfig {
  enabled: boolean;
  logoText: string;
  logoSubText: string;
  courseName: string;
  seriesName: string;
  marksTime: string;
  subjectTitle: string;
  instruction1: string;
  instruction2: string;
  fontFamily: string;
}

const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  enabled: true,
  logoText: 'CA CATest',
  logoSubText: 'Best Test Series for CA Exams',
  courseName: 'CA Foundation Course',
  seriesName: '(Mock Test Paper – Series : 1-2)',
  marksTime: 'MAXIMUM MARKS: 100     TIMING: 3 1/4 Hours',
  subjectTitle: 'PAPER 1 : ACCOUNTING',
  instruction1: 'Question No. 1 is compulsory.',
  instruction2: 'Candidates are required to answer any four questions from the remaining five questions.',
  fontFamily: 'Arial, sans-serif'
};

type PreviewMode = 'CONTENT' | 'SOLUTION' | 'GLOBAL';
type AppMode = 'QUESTION_PAPER' | 'VOTER_LIST';

const App: React.FC = () => {
  // Main State: Mode Selection
  const [appMode, setAppMode] = useState<AppMode>('QUESTION_PAPER');

  // --- QUESTION PAPER STATE ---
  const [questions, setQuestions] = useState<QuestionGroup[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode | null>(null);

  const [globalEditedHtml, setGlobalEditedHtml] = useState<string | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(DEFAULT_HEADER_CONFIG);
  
  const topInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('snap2print_header_config');
      if (savedConfig) setHeaderConfig({ ...DEFAULT_HEADER_CONFIG, ...JSON.parse(savedConfig) });
    } catch (e) { console.error("Failed to load header config", e); }
  }, []);

  const handleConfigChange = (key: keyof HeaderConfig, value: string | boolean) => {
    const newConfig = { ...headerConfig, [key]: value };
    setHeaderConfig(newConfig);
    localStorage.setItem('snap2print_header_config', JSON.stringify(newConfig));
    setGlobalEditedHtml(null);
  };

  useEffect(() => {
    fetch('https://api.counterapi.dev/v1/snap2print-tracker/visits/up')
      .then(res => res.json())
      .then(data => { if (data?.count) setVisitCount(data.count); })
      .catch(err => console.error('Failed to load visitor count:', err));
  }, []);

  // --- Question Management Logic ---

  const addQuestionGroup = useCallback((initialFiles: File[] = []) => {
    const newGroup: QuestionGroup = {
        id: Math.random().toString(36).substring(7),
        name: `Question ${questions.length + 1}`,
        files: initialFiles,
        previews: initialFiles.map(f => URL.createObjectURL(f)),
        status: JobStatus.IDLE
    };
    setQuestions(prev => [...prev, newGroup]);
  }, [questions.length]);

  const addImagesToGroup = (groupId: string, newFiles: File[]) => {
    setQuestions(prev => prev.map(q => {
        if (q.id === groupId) {
            const newPreviews = newFiles.map(f => URL.createObjectURL(f));
            return {
                ...q,
                files: [...q.files, ...newFiles],
                previews: [...q.previews, ...newPreviews],
                status: JobStatus.IDLE // Reset status if modified
            };
        }
        return q;
    }));
    setGlobalEditedHtml(null);
  };

  const removeImageFromGroup = (groupId: string, imageIndex: number) => {
    setQuestions(prev => prev.map(q => {
        if (q.id === groupId) {
            URL.revokeObjectURL(q.previews[imageIndex]);
            const newFiles = [...q.files];
            const newPreviews = [...q.previews];
            newFiles.splice(imageIndex, 1);
            newPreviews.splice(imageIndex, 1);
            return { ...q, files: newFiles, previews: newPreviews };
        }
        return q;
    }));
  };

  const moveImageBetweenGroups = (sourceGroupId: string, imageIndex: number, targetGroupId: string) => {
    setQuestions(prev => {
        const sourceGroup = prev.find(q => q.id === sourceGroupId);
        const targetGroup = prev.find(q => q.id === targetGroupId);
        
        if (!sourceGroup || !targetGroup) return prev;

        const fileToMove = sourceGroup.files[imageIndex];
        const previewToMove = sourceGroup.previews[imageIndex]; 

        const newSourceFiles = [...sourceGroup.files];
        const newSourcePreviews = [...sourceGroup.previews];
        newSourceFiles.splice(imageIndex, 1);
        newSourcePreviews.splice(imageIndex, 1);

        const newTargetFiles = [...targetGroup.files, fileToMove];
        const newTargetPreviews = [...targetGroup.previews, previewToMove];

        return prev.map(q => {
            if (q.id === sourceGroupId) {
                return { ...q, files: newSourceFiles, previews: newSourcePreviews };
            }
            if (q.id === targetGroupId) {
                return { ...q, files: newTargetFiles, previews: newTargetPreviews, status: JobStatus.IDLE };
            }
            return q;
        });
    });
    setGlobalEditedHtml(null);
  };

  const removeQuestionGroup = (groupId: string) => {
    const q = questions.find(g => g.id === groupId);
    if (q) q.previews.forEach(url => URL.revokeObjectURL(url));
    setQuestions(prev => prev.filter(g => g.id !== groupId));
    setGlobalEditedHtml(null);
  };

  const handleInitialUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        const files = Array.from(event.target.files);
        addQuestionGroup(files);
    }
    if (topInputRef.current) topInputRef.current.value = '';
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (appMode !== 'QUESTION_PAPER') return; // Only paste in question mode

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        // Accept images
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const timestamp = new Date().getTime();
            const ext = file.type.split('/')[1] || 'png';
            const newName = `pasted-${timestamp}-${i}.${ext}`;
            const renamedFile = new File([file], newName, { type: file.type || 'image/png' });
            pastedFiles.push(renamedFile);
          }
        } 
        // Accept PDF
        else if (items[i].type === 'application/pdf') {
             const file = items[i].getAsFile();
             if (file) pastedFiles.push(file);
        }
        else if (items[i].kind === 'file') {
             const file = items[i].getAsFile();
             if (file && (file.name.endsWith('.docx') || file.type.includes('word'))) {
                 pastedFiles.push(file);
             }
        }
      }
      
      if (pastedFiles.length > 0) {
        e.preventDefault();
        setQuestions(prev => {
             const newGroup: QuestionGroup = {
                id: Math.random().toString(36).substring(7),
                name: `Question ${prev.length + 1}`,
                files: pastedFiles,
                previews: pastedFiles.map(f => URL.createObjectURL(f)),
                status: JobStatus.IDLE
            };
            return [...prev, newGroup];
        });
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [appMode]);

  // --- Processing Logic ---

  const processQuestion = async (group: QuestionGroup) => {
    if (group.files.length === 0) return;

    try {
        setQuestions(prev => prev.map(q => q.id === group.id ? { ...q, status: JobStatus.PROCESSING, error: undefined } : q));
        const generatedHtml = await generateHtmlFromImages(group.files);
        setQuestions(prev => prev.map(q => 
            q.id === group.id 
            ? { ...q, status: JobStatus.COMPLETED, resultHtml: generatedHtml } 
            : q
        ));
    } catch (error: any) {
        setQuestions(prev => prev.map(q => 
            q.id === group.id 
            ? { ...q, status: JobStatus.ERROR, error: error.message || 'Processing failed' } 
            : q
        ));
    }
  };

  const handleProcessAll = async () => {
    setIsProcessing(true);
    const groupsToProcess = questions.filter(q => (q.status === JobStatus.IDLE || q.status === JobStatus.ERROR) && q.files.length > 0);
    if (groupsToProcess.length === 0) {
        setIsProcessing(false);
        return;
    }
    for (const group of groupsToProcess) {
        await processQuestion(group);
    }
    setIsProcessing(false);
    setGlobalEditedHtml(null);
  };

  const handleRetryGroup = async (id: string) => {
    const group = questions.find(q => q.id === id);
    if (group) await processQuestion(group);
  };

  const handleSolveAll = async () => {
    setIsSolving(true);
    const completedGroups = questions.filter(q => q.status === JobStatus.COMPLETED && q.resultHtml);
    if (completedGroups.length === 0) {
        setIsSolving(false);
        return;
    }
    for (const group of completedGroups) {
         try {
            setQuestions(prev => prev.map(q => q.id === group.id ? { ...q, status: JobStatus.PROCESSING } : q));
            const solutionHtml = await generateSolutionFromHtml(group.resultHtml!);
            setQuestions(prev => prev.map(q => 
                q.id === group.id 
                ? { ...q, status: JobStatus.COMPLETED, solutionHtml: solutionHtml } 
                : q
            ));
         } catch (e: any) {
            console.error("Solution failed", e);
            setQuestions(prev => prev.map(q => q.id === group.id ? { ...q, status: JobStatus.ERROR, error: `Solution Error: ${e.message || 'Unknown'}` } : q));
         }
    }
    setIsSolving(false);
  };
  
  const handleRemixAll = async () => {
    setIsRemixing(true);
    const completedGroups = questions.filter(q => q.status === JobStatus.COMPLETED && q.resultHtml);
    if (completedGroups.length === 0) { setIsRemixing(false); return; }
    for (const group of completedGroups) {
        try {
            setQuestions(prev => prev.map(q => q.id === group.id ? { ...q, status: JobStatus.PROCESSING } : q));
            const remixedHtml = await remixHtmlContent(group.resultHtml!);
            setQuestions(prev => prev.map(q => 
                q.id === group.id 
                ? { ...q, status: JobStatus.COMPLETED, resultHtml: remixedHtml, solutionHtml: undefined } 
                : q
            ));
        } catch (e) {
            setQuestions(prev => prev.map(q => q.id === group.id ? { ...q, status: JobStatus.COMPLETED } : q));
        }
    }
    setIsRemixing(false);
  };

  const handleSavePreview = (id: string, newHtml: string) => {
    if (previewMode === 'GLOBAL') {
        setGlobalEditedHtml(newHtml);
    } else if (previewMode === 'SOLUTION') {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, solutionHtml: newHtml } : q));
    } else {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, resultHtml: newHtml, solutionHtml: undefined } : q));
        setGlobalEditedHtml(null);
    }
    setPreviewJobId(null);
    setPreviewContent(null);
    setPreviewMode(null);
  };

  // --- Generation Logic (PDF/HTML) ---
  const generateHeaderHtml = (isWord: boolean, isSolution: boolean = false) => {
    if (!headerConfig.enabled) return '';
    const { logoText, logoSubText, courseName, seriesName, marksTime, subjectTitle, instruction1, instruction2, fontFamily } = headerConfig;
    const style = `font-family: ${fontFamily};`;
    const finalSubjectTitle = isSolution ? `${subjectTitle} (SOLUTIONS)` : subjectTitle;

    return `
    <div style="${style} max-width: 900px; margin: 0 auto; background: white; padding: 20px 0;">
        <div style="text-align: right; margin-bottom: 10px;">
            <span style="color: #0056b3; font-weight: bold; font-size: 24px;">${logoText}</span><br>
            <small style="font-size: 10px; color: #000;">${logoSubText}</small>
        </div>
        <hr style="border: 0; border-top: 2px solid black; margin: 5px 0;">
        <div style="border: 2px solid black; padding: 5px 10px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 18px;">
            <div>${courseName}</div>
            <div style="text-align: right;">
                ${seriesName}<br><span style="font-size: 16px;">${marksTime}</span>
            </div>
        </div>
        <div style="background-color: black; color: white; text-align: center; padding: 8px; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin-top: 15px;">
            ${finalSubjectTitle}
        </div>
        ${!isSolution ? `
        <div style="text-align: center; margin-top: 15px; line-height: 1.6; color: black;">
            <span style="font-size: 22px; font-weight: bold; display: block; margin-bottom: 5px;">${instruction1}</span>
            <span style="font-size: 18px; font-weight: bold;">${instruction2}</span>
        </div>` : ''}
        <hr style="border: 0; border-top: 1.5px solid black; margin-top: 15px;">
    </div>`;
  };

  const generateFullBodyContent = () => {
    const completed = questions.filter(q => q.status === JobStatus.COMPLETED && q.resultHtml);
    if (completed.length === 0) return '';
    const headerHtml = generateHeaderHtml(false);
    
    const bodyContent = completed.map((q, index) => `
    <div class="question-container" style="margin-bottom: 40px; border-bottom: 1px dashed #ccc; padding-bottom: 20px;">
        <div style="${headerConfig.enabled ? `font-family: ${headerConfig.fontFamily};` : ''}">
            ${q.resultHtml}
        </div>
    </div>
    `).join('');

    return headerHtml + bodyContent;
  };

  // --- Downloads ---

  const handleDownloadHtml = () => {
    const content = globalEditedHtml || generateFullBodyContent();
    if (!content) return;
    
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${headerConfig.subjectTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
       body { background: #f3f4f6; padding: 20px; font-family: sans-serif; }
       .container { max-width: 210mm; margin: 0 auto; background: white; padding: 10mm; }
    </style>
</head>
<body>
    <div class="container">
       ${content}
    </div>
</body>
</html>`;
    downloadFile(fullHtml, 'question-paper.html', 'text/html');
  };

  const handleDownloadWord = () => {
    const content = globalEditedHtml || generateFullBodyContent();
    if (!content) return;

    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${headerConfig.subjectTitle}</title></head><body>`;
    const postHtml = "</body></html>";
    const html = preHtml + content + postHtml;

    downloadFile(html, 'question-paper.doc', 'application/msword');
  };

  const handleDownloadSolutionHtml = () => {
    const completed = questions.filter(q => q.status === JobStatus.COMPLETED && q.solutionHtml);
    if (completed.length === 0) return;
    
    const headerHtml = generateHeaderHtml(false, true);
    const bodyContent = completed.map(q => `
        <div style="margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
            <h3>${q.name}</h3>
            ${q.solutionHtml}
        </div>
    `).join('');
    
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head><body style="padding:20px;">${headerHtml}${bodyContent}</body></html>`;
    downloadFile(fullHtml, 'solutions.html', 'text/html');
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob(['\ufeff', content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const content = globalEditedHtml || generateFullBodyContent();
    if (!content) return;

    const element = document.createElement('div');
    element.style.width = '210mm'; 
    element.style.padding = headerConfig.enabled ? '10mm' : '5mm';
    element.style.backgroundColor = 'white';
    if (headerConfig.enabled) element.style.fontFamily = headerConfig.fontFamily;
    element.innerHTML = content;

    const opt = {
      margin: 10,
      filename: 'question-paper.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // @ts-ignore
    if (window.html2pdf) window.html2pdf().set(opt).from(element).save();
  };
  
  const handleDownloadSolutionPdf = () => {
    const completed = questions.filter(q => q.status === JobStatus.COMPLETED && q.solutionHtml);
    if (completed.length === 0) return;
    const headerHtml = generateHeaderHtml(false, true);

    const bodyContent = completed.map((q) => `
    <div class="solution-section" style="margin-bottom: 30px;">
        <div style="background: #374151; color: #fff; padding: 4px 10px; font-size: 12px; font-weight: bold; margin-bottom: 15px; display: inline-block; border-radius: 4px;">
           ${q.name}
        </div>
        <div style="${headerConfig.enabled ? `font-family: ${headerConfig.fontFamily};` : ''}">
            ${q.solutionHtml}
        </div>
    </div>
    `).join('');

    const element = document.createElement('div');
    element.style.width = '210mm'; 
    element.style.padding = '10mm';
    element.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&display=swap');
        .solution-block { page-break-inside: avoid !important; break-inside: avoid !important; margin-bottom: 25px; border-bottom: 1px dashed #ccc; padding-bottom: 20px; display: block; }
        .handwritten { font-family: 'Kalam', cursive !important; }
        div, p { word-wrap: break-word; max-width: 100%; }
      </style>
      ${headerHtml}
      <div style="margin-top: 20px;">${bodyContent}</div>
    `;
    
    // @ts-ignore
    if (window.html2pdf) window.html2pdf().set({ margin: [5,5,5,5], filename: 'solutions.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(element).save();
  };

  const completedCount = questions.filter(q => q.status === JobStatus.COMPLETED).length;
  // Check if ANY solution has been generated
  const hasSolutions = questions.some(q => !!q.solutionHtml);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-brand-600 p-2 rounded-lg text-white"><Printer className="w-6 h-6" /></div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">Snap2Print</h1>
          </div>
          
          {/* Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
             <button 
                onClick={() => setAppMode('QUESTION_PAPER')} 
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${appMode === 'QUESTION_PAPER' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                <LayoutTemplate className="w-4 h-4" /> Exam Paper
             </button>
             <button 
                onClick={() => setAppMode('VOTER_LIST')} 
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${appMode === 'VOTER_LIST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
                <Database className="w-4 h-4" /> Voter List
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        
        {/* RENDER BASED ON MODE */}
        {appMode === 'VOTER_LIST' ? (
           <VoterListMode />
        ) : (
        <>
            {questions.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
                <div className="w-16 h-16 bg-blue-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ClipboardPaste className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Question Paper</h2>
                <p className="text-slate-500 max-w-md mx-auto mb-8">
                Press <strong>Ctrl+V</strong> to paste images instantly, or click below.
                </p>
                <button onClick={() => topInputRef.current?.click()} className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-full font-medium hover:bg-brand-700 transition-all shadow-lg active:scale-95">
                <Upload className="w-5 h-5" /> Start Upload
                </button>
            </div>
            )}

            {questions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-800">Questions ({questions.length})</h2>
                    <button onClick={() => addQuestionGroup()} className="flex items-center gap-1 text-sm bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition-colors">
                        <PlusCircle className="w-4 h-4" /> Add Question
                    </button>
                </div>

                <div className="space-y-6">
                    {questions.map((group, idx) => (
                    <QuestionGroupItem 
                        key={group.id}
                        group={group}
                        index={idx}
                        allGroups={questions}
                        onAddImages={addImagesToGroup}
                        onRemoveImage={removeImageFromGroup}
                        onRemoveGroup={removeQuestionGroup}
                        onMoveImage={moveImageBetweenGroups}
                        onRetry={handleRetryGroup}
                        onPreview={(html) => { setPreviewJobId(group.id); setPreviewContent(html); setPreviewMode('CONTENT'); }}
                        onSolutionPreview={() => { setPreviewJobId(group.id); setPreviewContent(group.solutionHtml || null); setPreviewMode('SOLUTION'); }}
                    />
                    ))}
                </div>
                
                <button onClick={() => addQuestionGroup()} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all flex items-center justify-center gap-2 font-medium">
                    <PlusCircle className="w-5 h-5" /> Add Another Question Block
                </button>
                </div>

                <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                    {/* Header Config */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileType className="w-4 h-4" /> Header</h3>
                            <input type="checkbox" checked={headerConfig.enabled} onChange={(e) => handleConfigChange('enabled', e.target.checked)} />
                        </div>
                        {headerConfig.enabled && (
                            <div className="space-y-2 text-xs">
                                <input type="text" placeholder="Logo Text" value={headerConfig.logoText} onChange={(e) => handleConfigChange('logoText', e.target.value)} className="w-full p-1.5 border rounded" />
                                <input type="text" placeholder="Subject Title" value={headerConfig.subjectTitle} onChange={(e) => handleConfigChange('subjectTitle', e.target.value)} className="w-full p-1.5 border rounded font-bold" />
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
                    <h3 className="font-semibold text-slate-800 mb-2">Actions</h3>
                    
                    {/* GENERATION ACTIONS */}
                    <div className="space-y-2">
                        <button onClick={handleProcessAll} disabled={isProcessing} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors">
                            {isProcessing ? <Sparkles className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4 text-yellow-400" />} Convert All to HTML
                        </button>
                        <button onClick={handleRemixAll} disabled={isProcessing || isRemixing} className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium transition-colors">
                            <Shuffle className="w-4 h-4" /> Remix Questions
                        </button>
                        <button onClick={handleSolveAll} disabled={isSolving} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors">
                            <BrainCircuit className="w-4 h-4" /> Generate Smart Solutions
                        </button>
                    </div>
                    
                    {/* STANDARD DOWNLOADS */}
                    <div className="pt-4 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Downloads</p>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={handleDownloadHtml} disabled={completedCount === 0} className="flex flex-col items-center justify-center p-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                <Code className="w-5 h-5 mb-1" /> 
                                <span className="text-[10px] font-bold">HTML</span>
                            </button>
                            <button onClick={handleDownloadWord} disabled={completedCount === 0} className="flex flex-col items-center justify-center p-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                <FileText className="w-5 h-5 mb-1" /> 
                                <span className="text-[10px] font-bold">Word</span>
                            </button>
                            <button onClick={handleDownloadPdf} disabled={completedCount === 0} className="flex flex-col items-center justify-center p-2 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                <Download className="w-5 h-5 mb-1" /> 
                                <span className="text-[10px] font-bold">PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* SOLUTION DOWNLOADS - CONDITIONALLY RENDERED */}
                    {hasSolutions && (
                        <div className="pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                                Solutions <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[9px]">Ready</span>
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleDownloadSolutionHtml} className="flex items-center justify-center gap-2 p-2 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors">
                                    <Code className="w-4 h-4" /> 
                                    <span className="text-xs font-bold">Solution HTML</span>
                                </button>
                                <button onClick={handleDownloadSolutionPdf} className="flex items-center justify-center gap-2 p-2 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors">
                                    <FileCheck className="w-4 h-4" /> 
                                    <span className="text-xs font-bold">Solution PDF</span>
                                </button>
                            </div>
                        </div>
                    )}

                    </div>
                </div>
                </div>
            </div>
            )}
        </>
        )}
      </main>

      <input type="file" ref={topInputRef} onChange={handleInitialUpload} className="hidden" multiple accept="image/*,application/pdf,.docx,.doc" />
      {previewJobId && previewContent && <PreviewModal html={previewContent} jobId={previewJobId} onClose={() => { setPreviewJobId(null); setPreviewMode(null); }} onSave={handleSavePreview} />}
    </div>
  );
};

export default App;