import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Printer, Download, Sparkles, AlertTriangle, ClipboardPaste, Users, FileText, Shuffle, FileType, Trash2, Type, Eye, BrainCircuit, FileCheck } from 'lucide-react';
import { ImageJob, JobStatus } from './types';
import { generateHtmlFromImage, remixHtmlContent, generateSolutionFromHtml, fileToGenerativePart } from './services/geminiService';
import { JobItem } from './components/JobItem';
import { PreviewModal } from './components/PreviewModal';
import { CropModal } from './components/CropModal';

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

const AVAILABLE_FONTS = [
  { label: 'Arial (Standard)', value: 'Arial, sans-serif' },
  { label: 'Times New Roman (Serif)', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New (Mono)', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana (Wide)', value: 'Verdana, Geneva, sans-serif' },
];

const App: React.FC = () => {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  
  // Track specific job preview ID, OR 'GLOBAL' for the full document
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  // If the user edits the FULL document, we store it here to use for downloads
  const [globalEditedHtml, setGlobalEditedHtml] = useState<string | null>(null);

  const [visitCount, setVisitCount] = useState<number | null>(null);
  
  // Header Settings State (Structured)
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(DEFAULT_HEADER_CONFIG);
  
  // State for Cropping
  const [croppingJobId, setCroppingJobId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Header Settings from LocalStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('snap2print_header_config');
      if (savedConfig) {
        setHeaderConfig({ ...DEFAULT_HEADER_CONFIG, ...JSON.parse(savedConfig) });
      }
    } catch (e) {
      console.error("Failed to load header config", e);
    }
  }, []);

  const handleConfigChange = (key: keyof HeaderConfig, value: string | boolean) => {
    const newConfig = { ...headerConfig, [key]: value };
    setHeaderConfig(newConfig);
    localStorage.setItem('snap2print_header_config', JSON.stringify(newConfig));
    // If config changes, reset global edit because the header changed
    setGlobalEditedHtml(null);
  };

  // Visitor Counter
  useEffect(() => {
    fetch('https://api.counterapi.dev/v1/snap2print-tracker/visits/up')
      .then(res => res.json())
      .then(data => {
        if (data && data.count) {
          setVisitCount(data.count);
        }
      })
      .catch(err => console.error('Failed to load visitor count:', err));
  }, []);

  // Helper to add files to state
  const addFiles = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;
    
    const newJobs: ImageJob[] = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
      status: JobStatus.IDLE
    }));
    setJobs(prev => [...prev, ...newJobs]);
    // Reset global edit when files change
    setGlobalEditedHtml(null);
  }, []);

  // Handle file selection from input
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files = Array.from(event.target.files) as File[];
      addFiles(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle global paste event
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const timestamp = new Date().getTime();
            const ext = file.type.split('/')[1] || 'png';
            const newName = `pasted-image-${timestamp}-${i}.${ext}`;
            const renamedFile = new File([file], newName, { type: file.type || 'image/png' });
            
            pastedFiles.push(renamedFile);
          }
        }
      }
      
      if (pastedFiles.length > 0) {
        e.preventDefault(); 
        addFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [addFiles]);

  const handleRemoveJob = (id: string) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === id);
      if (job) URL.revokeObjectURL(job.previewUrl);
      return prev.filter(job => job.id !== id);
    });
    setGlobalEditedHtml(null);
  };

  // Cropping Handlers
  const handleStartCrop = (id: string) => {
    setCroppingJobId(id);
  };

  const handleCropSave = (croppedFile: File) => {
    if (!croppingJobId) return;

    setJobs(prev => prev.map(job => {
      if (job.id === croppingJobId) {
        URL.revokeObjectURL(job.previewUrl);
        return {
          ...job,
          file: croppedFile,
          previewUrl: URL.createObjectURL(croppedFile),
          status: JobStatus.IDLE, 
          resultHtml: undefined,
          solutionHtml: undefined,
          error: undefined
        };
      }
      return job;
    }));
    setCroppingJobId(null);
    setGlobalEditedHtml(null);
  };

  const processJob = async (job: ImageJob) => {
    try {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: JobStatus.PROCESSING, error: undefined } : j));
      const generatedHtml = await generateHtmlFromImage(job.file);
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: JobStatus.COMPLETED, resultHtml: generatedHtml } 
          : j
      ));
    } catch (error: any) {
      console.error(`Job ${job.id} failed:`, error);
      setJobs(prev => prev.map(j => 
        j.id === job.id 
          ? { ...j, status: JobStatus.ERROR, error: error.message || 'Processing failed' } 
          : j
      ));
    }
  };

  const handleRetryJob = async (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (job) {
      await processJob(job);
    }
  };

  const handleProcessAll = async () => {
    setIsProcessing(true);
    const jobsToProcess = jobs.filter(j => j.status === JobStatus.IDLE || j.status === JobStatus.ERROR);

    if (jobsToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    // Execute all jobs in parallel
    await Promise.all(jobsToProcess.map(job => processJob(job)));

    setIsProcessing(false);
    setGlobalEditedHtml(null); // Reset global edit as content changed
  };

  const handleRemixAll = async () => {
    setIsRemixing(true);
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    
    if (completedJobs.length === 0) {
      setIsRemixing(false);
      return;
    }

    await Promise.all(completedJobs.map(async (job) => {
      try {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: JobStatus.PROCESSING } : j));
        const remixedHtml = await remixHtmlContent(job.resultHtml!);
        setJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, status: JobStatus.COMPLETED, resultHtml: remixedHtml, solutionHtml: undefined } 
            : j
        ));
      } catch (e) {
        console.error("Remix failed for job", job.id, e);
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: JobStatus.COMPLETED } : j));
      }
    }));

    setIsRemixing(false);
    setGlobalEditedHtml(null); // Reset global edit
  };

  const handleSolveAll = async () => {
    setIsSolving(true);
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    
    if (completedJobs.length === 0) {
      setIsSolving(false);
      return;
    }

    await Promise.all(completedJobs.map(async (job) => {
      try {
        // If solution already exists, skip unless forced? For now, re-generate.
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: JobStatus.PROCESSING } : j));
        const solutionHtml = await generateSolutionFromHtml(job.resultHtml!);
        setJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, status: JobStatus.COMPLETED, solutionHtml: solutionHtml } 
            : j
        ));
      } catch (e) {
        console.error("Solution generation failed for job", job.id, e);
        // Fallback status to COMPLETED so it doesn't stay stuck
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: JobStatus.COMPLETED } : j));
      }
    }));

    setIsSolving(false);
  };


  // Function to save edited HTML from Preview Modal
  const handleUpdateJobHtml = (id: string, newHtml: string) => {
    if (id === 'GLOBAL') {
        setGlobalEditedHtml(newHtml);
        setPreviewJobId(null);
        setPreviewContent(null);
        return;
    }

    setJobs(prev => prev.map(j => 
        j.id === id 
        ? { ...j, resultHtml: newHtml, solutionHtml: undefined } // clear solution if question changes
        : j
    ));
    setPreviewJobId(null);
    setPreviewContent(null);
    // If individual job is updated, global edit is likely invalid/stale
    setGlobalEditedHtml(null);
  };

  const handleOpenPreview = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (job && job.resultHtml) {
        setPreviewJobId(jobId);
        setPreviewContent(job.resultHtml);
    }
  };

  // Fixed Template Generation function
  const generateHeaderHtml = (isWord: boolean, isSolution: boolean = false) => {
    if (!headerConfig.enabled) {
        return '';
    }

    const { logoText, logoSubText, courseName, seriesName, marksTime, subjectTitle, instruction1, instruction2, fontFamily } = headerConfig;
    const style = `font-family: ${fontFamily};`;
    
    // Append SOLUTIONS to subject title if it is a solution document
    const finalSubjectTitle = isSolution ? `${subjectTitle} (SOLUTIONS)` : subjectTitle;

    return `
    <div style="${style} max-width: 900px; margin: 0 auto; background: white; padding: 20px 0;">
        <div style="text-align: right; margin-bottom: 10px;">
            <span style="color: #0056b3; font-weight: bold; font-size: 24px;">${logoText}</span><br>
            <small style="font-size: 10px; color: #000;">${logoSubText}</small>
        </div>
        <hr style="border: 0; border-top: 2px solid black; margin: 5px 0;">
        ${isWord ? `
        <table style="width: 100%; border: 2px solid black; border-collapse: collapse; margin-top: 5px; font-family: ${fontFamily};">
            <tr>
                <td style="padding: 5px 10px; font-weight: bold; font-size: 18px; vertical-align: middle;">
                    ${courseName}
                </td>
                <td style="padding: 5px 10px; text-align: right; font-weight: bold; font-size: 18px; vertical-align: middle;">
                    ${seriesName}<br>
                    <span style="font-size: 16px;">${marksTime}</span>
                </td>
            </tr>
        </table>
        ` : `
        <div style="border: 2px solid black; padding: 5px 10px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 18px;">
            <div>${courseName}</div>
            <div style="text-align: right;">
                ${seriesName}<br>
                <span style="font-size: 16px;">${marksTime}</span>
            </div>
        </div>
        `}
        <div style="background-color: black; color: white; text-align: center; padding: 8px; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin-top: 15px;">
            ${finalSubjectTitle}
        </div>
        ${!isSolution ? `
        <div style="text-align: center; margin-top: 15px; line-height: 1.6; color: black;">
            <span style="font-size: 22px; font-weight: bold; display: block; margin-bottom: 5px;">${instruction1}</span>
            <span style="font-size: 18px; font-weight: bold;">${instruction2}</span>
        </div>
        ` : ''}
        <hr style="border: 0; border-top: 1.5px solid black; margin-top: 15px;">
    </div>
    `;
  };

  const generateFullBodyContent = () => {
    // Generates the raw HTML content (divs) without the <html> wrapper
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return '';

    const headerHtml = generateHeaderHtml(false);
    const selectedFont = headerConfig.fontFamily;
    const isHeaderEnabled = headerConfig.enabled;

    return completedJobs.map((job, index) => `
    <div class="page-break-wrapper" style="break-after: page; page-break-after: always; margin-bottom: 30px;">
        ${index === 0 ? headerHtml : ''}
        <div style="${isHeaderEnabled ? `font-family: ${selectedFont};` : ''}">
            ${job.resultHtml}
        </div>
    </div>
    `).join('');
  };

  const handleOpenGlobalPreview = () => {
    // If we have a saved edited version, use that. Otherwise generate fresh.
    const content = globalEditedHtml || generateFullBodyContent();
    if (content) {
        setPreviewJobId('GLOBAL');
        setPreviewContent(content);
    }
  };

  const handleDownloadAll = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return;

    // Use global override if exists, otherwise generate
    const bodyContent = globalEditedHtml || generateFullBodyContent();
    const selectedFont = headerConfig.fontFamily;
    const isHeaderEnabled = headerConfig.enabled;

    const fontStyles = isHeaderEnabled ? `
        body, .page-wrapper, .page-wrapper * {
            font-family: ${selectedFont} !important;
        }
    ` : '';

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headerConfig.subjectTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        ${fontStyles}
        @media print {
            .page-break-wrapper { break-after: page; page-break-after: always; }
            body { margin: 0; padding: 0; }
            .print-container { padding: 0; margin: 0; }
        }
        .page-wrapper {
            background: white;
            min-height: 297mm;
            padding: 20px;
            margin: 20px auto;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            max-width: 210mm;
        }
        @media print {
            .page-wrapper {
                box-shadow: none;
                margin: 0;
                padding: 0;
                min-height: auto;
            }
        }
    </style>
</head>
<body class="bg-gray-100 print:bg-white">
    <div class="page-wrapper print-container">
       ${bodyContent}
    </div>
    
    <script>
      window.onload = function() {
        setTimeout(() => {
           window.print();
        }, 1000);
      }
    </script>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'printable-pages.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadWord = () => {
    // Note: Word export is complex with global edits because styling is tricky.
    // We will attempt to use the bodyContent, but if it has Tailwind classes, Word might ignore them.
    // The Gemini service tries to add inline styles, so it should be okay.
    
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return;

    const selectedFont = headerConfig.fontFamily;
    const isHeaderEnabled = headerConfig.enabled;

    const fontStyles = isHeaderEnabled ? `
      body { font-family: ${selectedFont}; }
      table { border-collapse: collapse; width: 100%; font-family: ${selectedFont}; }
      td, th { border: 1px solid #ddd; padding: 8px; font-family: ${selectedFont}; }
      * { font-family: ${selectedFont}; }
    ` : `
      body { font-family: Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ddd; padding: 8px; }
    `;

    // Use global edit or default generation
    // For Word, we might need to regenerate if globalEdit used the web-specific structure, 
    // but for simplicity we assume the user's edits are paramount.
    let content = globalEditedHtml;
    
    if (!content) {
        // Fallback to generating word-specific structure if no global edits
        const wordPageBreak = "<br clear=all style='mso-special-character:line-break;page-break-before:always'>";
        const headerHtml = generateHeaderHtml(true);
        content = completedJobs.map((job, index) => `
          <div class="WordSection" ${isHeaderEnabled ? `style="font-family: ${selectedFont};"` : ''}>
            ${index === 0 ? headerHtml : ''}
            <div ${isHeaderEnabled ? `style="font-family: ${selectedFont};"` : ''}>
               ${job.resultHtml}
            </div>
          </div>
          ${index < completedJobs.length - 1 ? wordPageBreak : ''}
        `).join('');
    }

    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title>
    <style>
      ${fontStyles}
      .page-break { page-break-after: always; }
    </style>
    </head><body>`;
    
    const postHtml = "</body></html>";
    const html = preHtml + content + postHtml;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return;

    // Use global override if exists
    const bodyContent = globalEditedHtml || generateFullBodyContent();
    const selectedFont = headerConfig.fontFamily;
    const isHeaderEnabled = headerConfig.enabled;

    const element = document.createElement('div');
    element.style.width = '210mm'; 
    element.style.padding = '10mm';
    element.style.backgroundColor = 'white';
    if (isHeaderEnabled) {
       element.style.fontFamily = selectedFont;
    }
    
    // Inject content
    element.innerHTML = bodyContent;

    const opt = {
      margin: 10,
      filename: 'document.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // @ts-ignore
    if (window.html2pdf) {
        // @ts-ignore
        window.html2pdf().set(opt).from(element).save();
    } else {
        alert("PDF Generator is loading. Please try again in 3 seconds.");
    }
  };

  const handleDownloadSolutionPdf = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.solutionHtml);
    if (completedJobs.length === 0) return;

    const headerHtml = generateHeaderHtml(false, true); // true for isSolution
    const selectedFont = headerConfig.fontFamily;
    const isHeaderEnabled = headerConfig.enabled;

    // Aggregate solutions
    const bodyContent = completedJobs.map((job, index) => `
    <div class="page-break-wrapper" style="break-after: page; page-break-after: always; margin-bottom: 30px;">
        ${index === 0 ? headerHtml : ''}
        <div style="${isHeaderEnabled ? `font-family: ${selectedFont};` : ''}">
            ${job.solutionHtml}
        </div>
    </div>
    `).join('');

    const element = document.createElement('div');
    element.style.width = '210mm'; 
    element.style.padding = '10mm';
    element.style.backgroundColor = 'white';
    if (isHeaderEnabled) {
       element.style.fontFamily = selectedFont;
    }
    
    element.innerHTML = bodyContent;

    const opt = {
      margin: 10,
      filename: 'solutions.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // @ts-ignore
    if (window.html2pdf) {
        // @ts-ignore
        window.html2pdf().set(opt).from(element).save();
    } else {
        alert("PDF Generator is loading. Please try again in 3 seconds.");
    }
  };

  const completedCount = jobs.filter(j => j.status === JobStatus.COMPLETED).length;
  const solutionsCount = jobs.filter(j => j.status === JobStatus.COMPLETED && j.solutionHtml).length;
  const croppingJob = jobs.find(j => j.id === croppingJobId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-brand-600 p-2 rounded-lg text-white">
              <Printer className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">
              Snap2Print
            </h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:block">
            Convert Images to Print-Ready HTML
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        {jobs.length === 0 && (
          <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
            <div className="w-16 h-16 bg-blue-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardPaste className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Paste images or Upload</h2>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Press <span className="font-mono bg-slate-200 px-1 rounded">Ctrl+V</span> to paste images directly, or click below to upload.
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-full font-medium hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 active:scale-95"
            >
              <Upload className="w-5 h-5" />
              Select Images
            </button>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  Files <span className="text-slate-400 text-sm font-normal">({jobs.length})</span>
                </h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1"
                >
                  <Upload className="w-4 h-4" /> Add more
                </button>
              </div>

              <div className="space-y-3">
                {jobs.map(job => (
                  <JobItem 
                    key={job.id} 
                    job={job} 
                    onRemove={handleRemoveJob} 
                    onPreview={() => handleOpenPreview(job.id)}
                    onCrop={handleStartCrop}
                    onRetry={handleRetryJob}
                  />
                ))}
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Header Settings Section */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 transition-all">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                         <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <FileType className="w-4 h-4 text-brand-600" />
                            Header Configuration
                        </h3>
                        <label className="relative inline-flex items-center cursor-pointer" title="Enable/Disable Header">
                            <input 
                                type="checkbox" 
                                checked={headerConfig.enabled} 
                                onChange={(e) => handleConfigChange('enabled', e.target.checked)}
                                className="sr-only peer" 
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                        </label>
                    </div>
                    
                    {headerConfig.enabled ? (
                        <div className="space-y-3 mt-3 animate-in slide-in-from-top-1 duration-200 fade-in">
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 mb-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                                <Type className="w-3 h-3" /> Font Style
                            </label>
                            <select
                                value={headerConfig.fontFamily}
                                onChange={(e) => handleConfigChange('fontFamily', e.target.value)}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none bg-white"
                            >
                                {AVAILABLE_FONTS.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Logo Text</label>
                                <input 
                                    type="text" 
                                    value={headerConfig.logoText}
                                    onChange={(e) => handleConfigChange('logoText', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Logo Sub-Text</label>
                                <input 
                                    type="text" 
                                    value={headerConfig.logoSubText}
                                    onChange={(e) => handleConfigChange('logoSubText', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Course Name</label>
                                    <input 
                                        type="text" 
                                        value={headerConfig.courseName}
                                        onChange={(e) => handleConfigChange('courseName', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Series Info</label>
                                    <input 
                                        type="text" 
                                        value={headerConfig.seriesName}
                                        onChange={(e) => handleConfigChange('seriesName', e.target.value)}
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Marks & Time</label>
                                <input 
                                    type="text" 
                                    value={headerConfig.marksTime}
                                    onChange={(e) => handleConfigChange('marksTime', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-800 mb-1">SUBJECT / PAPER TITLE</label>
                                <input 
                                    type="text" 
                                    value={headerConfig.subjectTitle}
                                    onChange={(e) => handleConfigChange('subjectTitle', e.target.value)}
                                    className="w-full px-2 py-2 border border-slate-300 rounded text-sm font-bold bg-slate-50 focus:border-brand-500 outline-none"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Instruction 1</label>
                                <input 
                                    type="text" 
                                    value={headerConfig.instruction1}
                                    onChange={(e) => handleConfigChange('instruction1', e.target.value)}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none"
                                />
                                <label className="block text-xs font-semibold text-slate-500 mt-2 mb-1">Instruction 2</label>
                                <textarea 
                                    value={headerConfig.instruction2}
                                    onChange={(e) => handleConfigChange('instruction2', e.target.value)}
                                    rows={2}
                                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-brand-500 outline-none resize-none"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="py-4 text-center">
                            <p className="text-xs text-slate-400 italic">
                                Header disabled. Pages will be generated with direct HTML content only.
                            </p>
                        </div>
                    )}
                </div>

                {/* Actions Section */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Actions</h3>
                  
                  <div className="space-y-3">
                    <button
                      onClick={handleProcessAll}
                      disabled={isProcessing || isRemixing || isSolving || jobs.every(j => j.status === JobStatus.COMPLETED)}
                      className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 px-4 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <Sparkles className="w-5 h-5 animate-pulse" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 text-yellow-400" />
                          Convert to HTML
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleRemixAll}
                      disabled={isProcessing || isRemixing || isSolving || completedCount === 0}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isRemixing ? (
                        <>
                          <Shuffle className="w-5 h-5 animate-spin" />
                          Remixing Questions...
                        </>
                      ) : (
                        <>
                          <Shuffle className="w-5 h-5" />
                          Shuffle / Remix Questions
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleSolveAll}
                      disabled={isProcessing || isRemixing || isSolving || completedCount === 0}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSolving ? (
                        <>
                          <BrainCircuit className="w-5 h-5 animate-pulse" />
                          Solving Questions...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-5 h-5" />
                          Generate Solutions
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleOpenGlobalPreview}
                      disabled={completedCount === 0}
                      className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Eye className="w-5 h-5" />
                        Preview Full Document
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleDownloadAll}
                        disabled={completedCount === 0}
                        className="col-span-1 flex flex-col items-center justify-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 py-2 px-1 rounded-lg text-xs font-medium hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-16 text-center"
                      >
                        <Printer className="w-5 h-5" />
                        <span>Print/HTML</span>
                      </button>

                       <button
                        onClick={handleDownloadPdf}
                        disabled={completedCount === 0}
                        className="col-span-1 flex flex-col items-center justify-center gap-1 bg-red-50 text-red-700 border border-red-200 py-2 px-1 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-16 text-center"
                      >
                        <Download className="w-5 h-5" />
                        <span>PDF</span>
                      </button>

                      <button
                        onClick={handleDownloadWord}
                        disabled={completedCount === 0}
                        className="col-span-1 flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 py-2 px-1 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-16 text-center"
                      >
                        <FileText className="w-5 h-5" />
                        <span>Word</span>
                      </button>

                      <button
                        onClick={handleDownloadSolutionPdf}
                        disabled={solutionsCount === 0}
                        className="col-span-1 flex flex-col items-center justify-center gap-1 bg-green-50 text-green-700 border border-green-200 py-2 px-1 rounded-lg text-xs font-medium hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-16 text-center"
                      >
                        <FileCheck className="w-5 h-5" />
                        <span>Solution PDF</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <strong>Tip:</strong> Click "Generate Solutions" to let AI solve your questions, then download the Solution PDF separately.
                      </p>
                    </div>
                  </div>

                  {completedCount > 0 && (
                    <div className="mt-4 text-center">
                      <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full">
                        {completedCount} / {jobs.length} Completed
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-sm gap-4">
          <p>© {new Date().getFullYear()} prakash. All rights reserved.</p>
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full shadow-sm">
             <Users className="w-4 h-4 text-brand-600" />
             <span className="font-semibold text-slate-700">
               {visitCount !== null ? `${visitCount.toLocaleString()} Visitors` : 'Counting...'}
             </span>
          </div>
        </div>
      </footer>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="image/png, image/jpeg, image/webp, image/bmp"
      />

      {/* Preview/Editor Modal */}
      {previewJobId && previewContent && (
        <PreviewModal 
          html={previewContent} 
          jobId={previewJobId}
          onClose={() => {
            setPreviewJobId(null);
            setPreviewContent(null);
          }} 
          onSave={handleUpdateJobHtml}
        />
      )}

      {/* Crop Modal */}
      {croppingJob && (
        <CropModal 
          imageSrc={croppingJob.previewUrl}
          fileName={croppingJob.file.name}
          onClose={() => setCroppingJobId(null)}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
};

export default App;