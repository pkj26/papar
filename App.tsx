import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Printer, Download, Sparkles, AlertTriangle, ClipboardPaste, Users, FileText } from 'lucide-react';
import { ImageJob, JobStatus } from './types';
import { generateHtmlFromImage } from './services/geminiService';
import { JobItem } from './components/JobItem';
import { PreviewModal } from './components/PreviewModal';
import { CropModal } from './components/CropModal';

const App: React.FC = () => {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  
  // State for Cropping
  const [croppingJobId, setCroppingJobId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visitor Counter
  useEffect(() => {
    // Using counterapi.dev to track visits
    // Namespace: snap2print-tracker, Key: visits
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
            // Give pasted files a unique name and explicit type
            // This helps if the clipboard file has missing metadata
            const timestamp = new Date().getTime();
            const ext = file.type.split('/')[1] || 'png';
            const newName = `pasted-image-${timestamp}-${i}.${ext}`;
            const renamedFile = new File([file], newName, { type: file.type || 'image/png' });
            
            pastedFiles.push(renamedFile);
          }
        }
      }
      
      if (pastedFiles.length > 0) {
        e.preventDefault(); // Prevent default only if we captured images
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
      // Revoke object URL to avoid memory leaks
      const job = prev.find(j => j.id === id);
      if (job) URL.revokeObjectURL(job.previewUrl);
      return prev.filter(job => job.id !== id);
    });
  };

  // Cropping Handlers
  const handleStartCrop = (id: string) => {
    setCroppingJobId(id);
  };

  const handleCropSave = (croppedFile: File) => {
    if (!croppingJobId) return;

    setJobs(prev => prev.map(job => {
      if (job.id === croppingJobId) {
        // Revoke old URL
        URL.revokeObjectURL(job.previewUrl);
        return {
          ...job,
          file: croppedFile,
          previewUrl: URL.createObjectURL(croppedFile),
          status: JobStatus.IDLE, // Reset status if it was processed
          resultHtml: undefined,
          error: undefined
        };
      }
      return job;
    }));
    setCroppingJobId(null);
  };

  const processJob = async (job: ImageJob) => {
    try {
      // Update status to PROCESSING
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
    
    // Filter jobs that need processing (IDLE or ERROR)
    const jobsToProcess = jobs.filter(j => j.status === JobStatus.IDLE || j.status === JobStatus.ERROR);

    if (jobsToProcess.length === 0) {
      setIsProcessing(false);
      return;
    }

    // Process sequentially (one by one) to avoid Rate Limits (429)
    // Parallel processing with Promise.all triggers rate limits quickly on free tier
    for (const job of jobsToProcess) {
      // Check if job still exists (wasn't deleted while processing others)
      const currentJob = jobs.find(j => j.id === job.id);
      if (!currentJob) continue;

      await processJob(job);
      
      // Small delay between requests to be gentle on the API
      await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    setIsProcessing(false);
  };

  const handleDownloadAll = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return;

    // Construct a single HTML file with print breaks
    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Documents</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @media print {
            .page-break { page-break-after: always; break-after: page; display: block; height: 0; }
            body { margin: 0; padding: 0; }
            .print-container { padding: 0; margin: 0; }
        }
        .page-wrapper {
            background: white;
            min-height: 297mm; /* A4 height */
            padding: 20px;
            margin: 20px auto;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            max-width: 210mm;
        }
        @media print {
            .page-wrapper {
                box-shadow: none;
                margin: 0;
                padding: 0; /* Let the internal padding handle it, or reset */
                min-height: auto;
            }
        }
    </style>
</head>
<body class="bg-gray-100 print:bg-white">
    ${completedJobs.map(job => `
    <div class="page-wrapper print-container">
        ${job.resultHtml}
    </div>
    <div class="page-break"></div>
    `).join('')}
    
    <script>
      // Automatically prompt print when opened
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
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.resultHtml);
    if (completedJobs.length === 0) return;

    // MS Word requires specific XML namespaces and structure to render HTML correctly as a .doc file.
    // NOTE: MS Word does not execute JavaScript, so the Tailwind CDN script won't run. 
    // That is why the Gemini Prompt now requests inline styles as well.
    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title>
    <!-- Basic Reset for Word -->
    <style>
      body { font-family: Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ddd; padding: 8px; }
      .page-break { page-break-after: always; }
    </style>
    </head><body>`;
    
    const postHtml = "</body></html>";
    
    // Word specific page break
    const wordPageBreak = "<br clear=all style='mso-special-character:line-break;page-break-before:always'>";

    const innerContent = completedJobs.map((job, index) => `
      <div class="WordSection">
        ${job.resultHtml}
      </div>
      ${index < completedJobs.length - 1 ? wordPageBreak : ''}
    `).join('');

    const html = preHtml + innerContent + postHtml;

    // Create a Blob with the specific MIME type for Word
    const blob = new Blob(['\ufeff', html], {
        type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.doc'; // .doc extension forces Word to open it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completedCount = jobs.filter(j => j.status === JobStatus.COMPLETED).length;

  const croppingJob = jobs.find(j => j.id === croppingJobId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
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
        
        {/* Intro / Empty State */}
        {jobs.length === 0 && (
          <div className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
            <div className="w-16 h-16 bg-blue-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardPaste className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Paste images or Upload</h2>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Press <span className="font-mono bg-slate-200 px-1 rounded">Ctrl+V</span> to paste images directly, or click below to upload.
              You can crop images before converting.
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

        {/* Main Content Area */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left: Job List */}
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
                    onPreview={setPreviewHtml}
                    onCrop={handleStartCrop}
                    onRetry={handleRetryJob}
                  />
                ))}
              </div>
            </div>

            {/* Right: Actions & Stats */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-24">
                <h3 className="font-semibold text-slate-800 mb-4">Actions</h3>
                
                <div className="space-y-3">
                  <button
                    onClick={handleProcessAll}
                    disabled={isProcessing || jobs.every(j => j.status === JobStatus.COMPLETED)}
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

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleDownloadAll}
                      disabled={completedCount === 0}
                      className="col-span-1 flex flex-col items-center justify-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 py-2 px-2 rounded-lg text-sm font-medium hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-20"
                    >
                      <Download className="w-5 h-5" />
                      <span>Printable HTML</span>
                    </button>

                    <button
                      onClick={handleDownloadWord}
                      disabled={completedCount === 0}
                      className="col-span-1 flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 py-2 px-2 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-20"
                    >
                      <FileText className="w-5 h-5" />
                      <span>Word File</span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                      <strong>Tip:</strong> Word download uses inline styles. For perfect layout, use the Printable HTML option.
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
        )}
      </main>

      {/* Footer with Visitor Counter */}
      <footer className="py-6 border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-sm gap-4">
          <p>© {new Date().getFullYear()} Snap2Print. All rights reserved.</p>
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full shadow-sm">
             <Users className="w-4 h-4 text-brand-600" />
             <span className="font-semibold text-slate-700">
               {visitCount !== null ? `${visitCount.toLocaleString()} Visitors` : 'Counting...'}
             </span>
          </div>
        </div>
      </footer>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="image/png, image/jpeg, image/webp, image/bmp"
      />

      {/* Preview Modal */}
      {previewHtml && (
        <PreviewModal 
          html={previewHtml} 
          onClose={() => setPreviewHtml(null)} 
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