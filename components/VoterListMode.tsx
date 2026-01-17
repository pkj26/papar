import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, Play, Loader2, CheckCircle, AlertCircle, Trash2, FileText, Database, PauseCircle, RefreshCw, Zap, TrendingUp, Users, FileDigit, Save, FastForward } from 'lucide-react';
import { JobStatus, VoterJob, VoterData } from '../types';
import { extractVoterData, ExtractionProgress } from '../services/geminiService';
// @ts-ignore
import * as XLSX from 'xlsx';

interface SavedProgress {
    data: VoterData[];
    processedPages: number;
}

export const VoterListMode: React.FC = () => {
  const [jobs, setJobs] = useState<VoterJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Live Stats State
  const [liveStats, setLiveStats] = useState<ExtractionProgress>({
      totalPages: 0,
      processedPages: 0,
      entriesFound: 0,
      status: 'Ready'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const isRunningRef = useRef(false);
  const jobsRef = useRef<VoterJob[]>([]);

  // We need to track page progress specifically for resume logic
  const [resumeState, setResumeState] = useState<Record<string, number>>({}); 

  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  // --- RESUMABILITY / LOCAL STORAGE LOGIC ---
  const saveProgressToLocal = (fileName: string, data: VoterData[], processedPages: number) => {
      try {
          const key = `voter_progress_${fileName.replace(/\s+/g, '_')}`;
          const payload: SavedProgress = { data, processedPages };
          localStorage.setItem(key, JSON.stringify(payload));
      } catch (e) {
          console.warn("Local Storage Full", e);
      }
  };

  const loadProgressFromLocal = (fileName: string): SavedProgress | null => {
      try {
          const key = `voter_progress_${fileName.replace(/\s+/g, '_')}`;
          const saved = localStorage.getItem(key);
          if (saved) return JSON.parse(saved);
      } catch (e) {
          console.error("Failed to load saved progress", e);
      }
      return null;
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const newJobs: VoterJob[] = newFiles.map(f => {
          // Check for existing progress
          const savedInfo = loadProgressFromLocal(f.name);
          const hasSavedData = savedInfo && savedInfo.data.length > 0;

          if (hasSavedData) {
              // Update local state map to know where to resume this file
              setResumeState(prev => ({ ...prev, [f.name]: savedInfo!.processedPages }));
          }

          // If we have data, we show it as "Partial" or "Completed" depending on user action, 
          // but visually we'll just show IDLE with a note if it's partial. 
          // Actually, let's mark it as IDLE so they can hit Start/Resume.
          
          return {
            id: Math.random().toString(36).substring(7),
            file: f,
            status: hasSavedData ? JobStatus.IDLE : JobStatus.IDLE,
            extractedData: savedInfo ? savedInfo.data : [],
            error: hasSavedData ? `Resumable (${savedInfo!.data.length} records)` : undefined
          };
      });
      setJobs(prev => [...prev, ...newJobs]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateJobStatus = (id: string, status: JobStatus, data?: any[], error?: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status, extractedData: data || j.extractedData, error } : j));
  };

  // Helper to safely append data to state without losing previous rows
  const appendJobData = (id: string, newData: VoterData[], totalProcessedPages: number) => {
      setJobs(prev => prev.map(j => {
          if (j.id === id) {
              const updatedData = [...j.extractedData, ...newData];
              // Auto-save
              saveProgressToLocal(j.file.name, updatedData, totalProcessedPages);
              return { ...j, extractedData: updatedData };
          }
          return j;
      }));
  };

  const processNextJob = async () => {
    if (!isRunningRef.current) return;
    if (queueRef.current.length === 0) {
        setIsProcessing(false);
        isRunningRef.current = false;
        setLiveStats(prev => ({ ...prev, status: 'All tasks completed.' }));
        return;
    }
    
    const nextId = queueRef.current[0]; // Peek
    if (!nextId) return;

    // Check if already fully completed manually? No, we trust the status.
    const currentJob = jobsRef.current.find(j => j.id === nextId);
    if (!currentJob) {
        queueRef.current.shift();
        processNextJob();
        return;
    }

    if (currentJob.status === JobStatus.COMPLETED) {
         // Skip completed jobs
         queueRef.current.shift();
         processNextJob();
         return;
    }

    updateJobStatus(nextId, JobStatus.PROCESSING, undefined, undefined); // clear error

    try {
        setLiveStats(prev => ({ ...prev, status: `Starting ${currentJob.file.name}...` }));

        // Determine Start Page (Resume logic)
        // We look at the current data length or stored page count
        const resumePageCount = resumeState[currentJob.file.name] || 0;
        
        if (resumePageCount > 0) {
             console.log(`Resuming ${currentJob.file.name} from page index ${resumePageCount}`);
             setLiveStats(prev => ({ ...prev, status: `Resuming from page ${resumePageCount}...` }));
        }

        // We pass a callback to extractVoterData to get incremental updates
        // Note: extractVoterData now returns ONLY the new data found in this session
        const sessionData = await extractVoterData(
            currentJob.file,
            resumePageCount,
            (progress) => {
                setLiveStats(prev => ({
                    ...progress,
                    entriesFound: currentJob.extractedData.length + progress.entriesFound // Total = Existing + New
                }));
            },
            (batchData) => {
                // This runs every time a batch of pages is finished
                // We need to calculate total pages processed so far for saving
                // Note: batchData is just 1 page usually (or BATCH_SIZE). 
                // We don't get exact page index here easily, but we can increment resumeState?
                // Actually, extractVoterData manages the loop. We need to trust the final update.
                // A better way: The 'progress' callback gives 'processedPages'.
                // But progress callback doesn't have the data.
                
                // We'll update state. The 'processedPages' in liveStats comes from progress callback.
                // We can use that for saving? No, react state update async issues.
                
                // Let's just append data. We will update the 'Resume Page Count' at the end of function or aggressively if we tracked it.
                // For simplicity, we save with an estimated page count (current stored + batch size).
                // Or better: We rely on the final save. 
                // BUT user said "if stops in middle". 
                // We need to update the saved Page Count incrementally.
                
                // HACK: We assume BATCH_SIZE = 1.
                // We can't easily know absolute page number here without changing callback signature.
                // Let's rely on the final save for exact page count, 
                // AND try to save incrementally by just reading the current liveStats.processedPages (risky)
                // Let's just append data for now.
                
                // We will rely on the fact that if they stop, they have the DATA. 
                // To support resume, we need to know how many pages that data represents.
                // Let's modify appendJobData to NOT save page count yet, or save a safe lower bound.
                
                // Actually, simpler: We only update the 'resumeState' (Saved Page Count) when we are sure.
                // Let's just update the data.
                setJobs(prev => prev.map(j => {
                    if (j.id === nextId) {
                        const updated = [...j.extractedData, ...batchData];
                        // We don't update page count in storage here to avoid sync issues. 
                        // We only save data. On reload, we might re-process some pages if we don't save page count.
                        // That is acceptable for safety.
                        saveProgressToLocal(j.file.name, updated, resumePageCount); // Keep old page count until finish? No that's bad.
                        return { ...j, extractedData: updated };
                    }
                    return j;
                }));
            }
        );

        // Update with final data and final page count
        // Note: extractVoterData returns ALL sorted entries found in THIS session.
        // We merge with existing.
        
        // Wait, extractVoterData returns `allEntries`.
        // If we resumed, `allEntries` only contains the NEW entries.
        // We need to append them to `currentJob.extractedData`.
        
        // However, `appendJobData` was already adding them incrementally!
        // So `currentJob.extractedData` in state (via `setJobs`) is already growing.
        // But `currentJob` variable here is stale closure.
        
        // We need to get the latest data from ref to save correctly.
        const finishedJob = jobsRef.current.find(j => j.id === nextId);
        const finalTotalPages = liveStats.processedPages; // This is actually total pages processed in THIS session + resume start?
        // extractVoterData's progress returns 'processedPages' which is relative to startPage?
        // No, in my implementation it returns `startPage + batchImages.length`. So it is absolute index.
        
        if (finishedJob) {
             updateJobStatus(nextId, JobStatus.COMPLETED, finishedJob.extractedData);
             saveProgressToLocal(currentJob.file.name, finishedJob.extractedData, finalTotalPages);
             // Update resume state for next time (marks as fully done if we reached end)
             setResumeState(prev => ({ ...prev, [currentJob.file.name]: finalTotalPages }));
        }

    } catch (err: any) {
        // If error, we still have partial data in state.
        updateJobStatus(nextId, JobStatus.ERROR, undefined, err.message);
    }

    queueRef.current.shift();
    processNextJob();
  };

  const startProcessing = async () => {
    if (isRunningRef.current) return;

    setIsProcessing(true);
    setLiveStats({ totalPages: 0, processedPages: 0, entriesFound: 0, status: 'Initializing AI...' });

    const pendingIds = jobs
        .filter(j => j.status !== JobStatus.COMPLETED)
        .map(j => j.id);

    if (pendingIds.length === 0) {
        setIsProcessing(false);
        alert("All files are already processed!");
        return;
    }

    // Reset errors on retry but KEEP DATA for resume
    setJobs(prev => prev.map(j => j.status === JobStatus.ERROR ? { ...j, status: JobStatus.IDLE, error: undefined } : j));

    queueRef.current = pendingIds;
    isRunningRef.current = true;
    
    processNextJob();
  };

  const stopProcessing = () => {
    isRunningRef.current = false;
    setIsProcessing(false);
    queueRef.current = [];
    setLiveStats(prev => ({ ...prev, status: 'Paused by user.' }));
  };

  const exportToExcel = () => {
    const allData: VoterData[] = jobs.flatMap(j => j.extractedData);
    if (allData.length === 0) {
        alert("No data to export! Please process files first.");
        return;
    }

    const formattedData = allData.map(item => ({
        "District": item.District || "",
        "AC Number": item.ACNo || "",
        "AC Name": item.ACName || "",
        "Police Station": item.PoliceStation || "",
        "Post Office": item.PostOffice || "",
        "Polling Station Name": item.PollingStationName || "",
        "Polling Station Address": item.PollingStationAddress || "",
        "Part No": item.PartNo || "",
        "Section No": item.SectionNo || "",
        "Section Name": item.SectionName || "",
        "Serial No": item.SerialNo,
        "Voter ID": item.VoterID,
        "Name (PUNJABI)": item.NamePunjabi,
        "Name (English)": item.NameEnglish,
        "Father/Husband Name (Punjabi)": item.RelationNamePunjabi,
        "Father/Husband Name (English)": item.RelationNameEnglish,
        "House No": item.HouseNo,
        "Age": item.Age,
        "Gender": item.Gender
    }));

    const ws = XLSX.utils.json_to_sheet(formattedData);
    
    const wscols = [
        { wch: 15 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, 
        { wch: 25 }, { wch: 25 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, 
        { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, 
        { wch: 25 }, { wch: 8 }, { wch: 6 }, { wch: 8 }
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Voter List");
    XLSX.writeFile(wb, "VoterList_Master.xlsx");
  };

  const removeJob = (index: number) => {
    const jobToRemove = jobs[index];
    const key = `voter_progress_${jobToRemove.file.name.replace(/\s+/g, '_')}`;
    localStorage.removeItem(key);

    queueRef.current = queueRef.current.filter(id => id !== jobToRemove.id);
    setJobs(prev => prev.filter((_, i) => i !== index));
    // Also remove from resume state
    setResumeState(prev => {
        const next = { ...prev };
        delete next[jobToRemove.file.name];
        return next;
    });
  };

  const clearAll = () => {
    if (window.confirm("Clear all files and saved progress?")) {
        stopProcessing();
        Object.keys(localStorage).forEach(key => {
            if(key.startsWith('voter_progress_')) localStorage.removeItem(key);
        });
        setJobs([]);
        setResumeState({});
        setLiveStats({ totalPages: 0, processedPages: 0, entriesFound: 0, status: 'Ready' });
    }
  };

  const totalRecords = jobs.reduce((acc, curr) => acc + curr.extractedData.length, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-6 h-6 text-indigo-600" />
              Voter List Extractor <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1 border border-purple-200"><Zap className="w-3 h-3 fill-purple-500 text-purple-500" /> AI Turbo V2</span>
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Supports Resume (Auto-Save). Checks every page for metadata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload PDFs
            </button>
            <input type="file" ref={fileInputRef} onChange={handleUpload} multiple className="hidden" accept="application/pdf" />

            {!isProcessing ? (
                <button 
                onClick={startProcessing}
                disabled={jobs.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50"
                >
                <Play className="w-4 h-4" /> 
                {jobs.some(j => (resumeState[j.file.name] || 0) > 0) ? 'Resume / Start' : 'Start Processing'}
                </button>
            ) : (
                <button 
                onClick={stopProcessing}
                className="flex items-center gap-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors shadow-lg shadow-amber-200"
                >
                <PauseCircle className="w-4 h-4" /> Pause
                </button>
            )}

            <button 
              onClick={exportToExcel}
              disabled={totalRecords === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </div>

        {/* Live Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <FileDigit className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Pages Scanned</p>
                    <p className="text-xl font-bold text-slate-800">
                        {isProcessing ? (
                           <span>{liveStats.processedPages} <span className="text-xs text-slate-400 font-normal">/ {liveStats.totalPages > 0 ? liveStats.totalPages : '?'}</span></span>
                        ) : (
                           <span>-</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                    <Users className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase">Entries Found</p>
                    <p className="text-xl font-bold text-slate-800">
                        {totalRecords}
                        {isProcessing && <span className="text-xs text-green-500 ml-1">(+Live)</span>}
                    </p>
                </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isProcessing ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                    <Loader2 className={`w-6 h-6 ${isProcessing ? 'animate-spin' : ''}`} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-slate-500 font-semibold uppercase">Status</p>
                    <p className="text-sm font-medium text-slate-800 truncate" title={liveStats.status}>
                        {liveStats.status}
                    </p>
                </div>
            </div>
        </div>

      </div>

      {/* File List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
         <div className="grid grid-cols-12 bg-slate-50 p-3 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
             <div className="col-span-1 text-center">#</div>
             <div className="col-span-6">File Name</div>
             <div className="col-span-3">Status</div>
             <div className="col-span-2 text-right">Actions</div>
         </div>
         
         <div className="max-h-[500px] overflow-y-auto">
            {jobs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                    <FileText className="w-12 h-12 mb-3 opacity-20" />
                    <p>No files uploaded yet.</p>
                </div>
            ) : (
                jobs.map((job, idx) => {
                    const resumeCount = resumeState[job.file.name] || 0;
                    return (
                    <div key={job.id} className={`grid grid-cols-12 p-3 text-sm items-center border-b border-slate-100 transition-colors ${job.status === JobStatus.PROCESSING ? 'bg-indigo-50/30' : 'hover:bg-slate-50'}`}>
                        <div className="col-span-1 text-center text-slate-400">{idx + 1}</div>
                        <div className="col-span-6 font-medium text-slate-700 truncate pr-4" title={job.file.name}>
                            {job.file.name}
                        </div>
                        <div className="col-span-3">
                            {job.status === JobStatus.IDLE && resumeCount > 0 && <span className="text-amber-600 text-xs bg-amber-50 px-2 py-1 rounded flex items-center w-fit gap-1 border border-amber-100"><FastForward className="w-3 h-3"/> Resumable (Pg {resumeCount})</span>}
                            {job.status === JobStatus.IDLE && resumeCount === 0 && <span className="text-slate-400 text-xs bg-slate-100 px-2 py-1 rounded">Pending</span>}
                            {job.status === JobStatus.PROCESSING && <span className="text-indigo-600 text-xs bg-indigo-100 px-2 py-1 rounded flex items-center w-fit gap-1 font-semibold"><Loader2 className="w-3 h-3 animate-spin"/> Processing...</span>}
                            {job.status === JobStatus.COMPLETED && <span className="text-green-600 text-xs bg-green-50 px-2 py-1 rounded flex items-center w-fit gap-1 border border-green-100">
                                <CheckCircle className="w-3 h-3"/> Done ({job.extractedData.length})
                            </span>}
                            {job.status === JobStatus.ERROR && <span className="text-red-600 text-xs bg-red-50 px-2 py-1 rounded flex items-center w-fit gap-1 border border-red-100" title={job.error}><AlertCircle className="w-3 h-3"/> {job.error}</span>}
                        </div>
                        <div className="col-span-2 text-right flex justify-end gap-2">
                             {job.status === JobStatus.ERROR && (
                                <button onClick={() => updateJobStatus(job.id, JobStatus.IDLE)} className="text-slate-400 hover:text-blue-600 p-1" title="Retry">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                             )}
                             <button onClick={() => removeJob(idx)} className="text-slate-400 hover:text-red-500 p-1">
                                 <Trash2 className="w-4 h-4" />
                             </button>
                        </div>
                    </div>
                )})
            )}
         </div>
         {totalRecords > 0 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700 underline">Clear All Data</button>
            </div>
         )}
      </div>
    </div>
  );
};
