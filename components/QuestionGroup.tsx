import React, { useRef } from 'react';
import { QuestionGroup, JobStatus } from '../types';
import { Trash2, Plus, Image as ImageIcon, Loader2, CheckCircle, AlertCircle, Eye, FileSignature, RefreshCw, ArrowRightLeft, FileText } from 'lucide-react';

interface QuestionGroupProps {
  group: QuestionGroup;
  index: number;
  allGroups?: QuestionGroup[]; // For move capability
  onAddImages: (groupId: string, files: File[]) => void;
  onRemoveImage: (groupId: string, imageIndex: number) => void;
  onRemoveGroup: (groupId: string) => void;
  onMoveImage?: (sourceGroupId: string, imageIndex: number, targetGroupId: string) => void;
  onRetry: (groupId: string) => void;
  onPreview: (html: string) => void;
  onSolutionPreview: () => void;
}

export const QuestionGroupItem: React.FC<QuestionGroupProps> = ({ 
  group, 
  index, 
  allGroups = [],
  onAddImages, 
  onRemoveImage, 
  onRemoveGroup,
  onMoveImage,
  onRetry,
  onPreview,
  onSolutionPreview
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(group.id, Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const otherGroups = allGroups.filter(g => g.id !== group.id);

  return (
    <div className={`border rounded-xl shadow-sm bg-white overflow-hidden transition-all ${group.status === JobStatus.ERROR ? 'border-red-200' : 'border-slate-200'}`}>
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <span className="bg-brand-600 text-white text-xs font-bold px-2 py-1 rounded">
                Q{index + 1}
            </span>
            <h3 className="font-semibold text-slate-700">{group.name}</h3>
            {group.files.length > 0 && (
                <span className="text-xs text-slate-500">({group.files.length} items)</span>
            )}
        </div>
        <div className="flex items-center gap-2">
            {group.status === JobStatus.COMPLETED && (
                <>
                 {group.resultHtml && (
                    <button onClick={() => onPreview(group.resultHtml!)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="View/Edit HTML">
                        <Eye className="w-4 h-4" />
                    </button>
                 )}
                 {group.solutionHtml && (
                    <button onClick={onSolutionPreview} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded" title="View/Edit Solution">
                        <FileSignature className="w-4 h-4" />
                    </button>
                 )}
                </>
            )}
            
            {group.status === JobStatus.ERROR && (
                <button onClick={() => onRetry(group.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded flex items-center gap-1 text-xs font-medium">
                    <RefreshCw className="w-3 h-3" /> Retry
                </button>
            )}

            <button onClick={() => onRemoveGroup(group.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        
        {/* Status Indicator */}
        <div className="mb-4">
             {group.status === JobStatus.IDLE && group.files.length === 0 && (
                <div className="text-sm text-slate-400 italic flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Add images or documents to this question container
                </div>
             )}
             {group.status === JobStatus.PROCESSING && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin" /> 
                    Processing files...
                </div>
             )}
             {group.status === JobStatus.COMPLETED && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded-lg">
                    <CheckCircle className="w-4 h-4" /> 
                    Ready for print
                </div>
             )}
             {group.status === JobStatus.ERROR && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" /> 
                    {group.error}
                </div>
             )}
        </div>

        {/* Image Grid */}
        <div className="flex flex-wrap gap-3">
            {group.previews.map((preview, idx) => {
                const file = group.files[idx];
                const isPdf = file.type === 'application/pdf';
                const isWord = file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc');
                const isImage = !isPdf && !isWord;

                return (
                <div key={idx} className="relative group w-24 h-32 border border-slate-200 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                    
                    {isImage ? (
                        <img src={preview} alt={`Page ${idx+1}`} className="w-full h-full object-cover" />
                    ) : (
                        <div className={`flex flex-col items-center justify-center text-center p-2 h-full w-full ${isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                           {isPdf ? <FileText className="w-8 h-8 mb-1" /> : <FileText className="w-8 h-8 mb-1" />}
                           <span className="text-[10px] font-medium leading-tight line-clamp-2 break-all">{file.name}</span>
                           <span className="text-[9px] uppercase font-bold mt-1 bg-white/50 px-1 rounded">{isPdf ? 'PDF' : 'DOC'}</span>
                        </div>
                    )}
                    
                    {group.status === JobStatus.IDLE && (
                        <>
                            <button 
                                onClick={() => onRemoveImage(group.id, idx)}
                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                                title="Delete"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>

                            {/* Move Button: Only show if other groups exist */}
                            {otherGroups.length > 0 && onMoveImage && (
                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 w-6 h-6">
                                    <div className="relative w-full h-full">
                                         {/* The Select is transparent but clickable over the icon */}
                                         <select 
                                            onChange={(e) => onMoveImage(group.id, idx, e.target.value)}
                                            value=""
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                            title="Move to another question"
                                         >
                                            <option value="" disabled>Move to...</option>
                                            {otherGroups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                         </select>
                                         <div className="bg-blue-500 text-white p-1 rounded-full w-full h-full flex items-center justify-center hover:bg-blue-600">
                                            <ArrowRightLeft className="w-3 h-3" />
                                         </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                        Page {idx + 1}
                    </div>
                </div>
            )})}

            {/* Add Image Button (Only if IDLE) */}
            {group.status === JobStatus.IDLE && (
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-32 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-brand-500 hover:text-brand-500 transition-colors bg-slate-50 hover:bg-brand-50"
                >
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Add File</span>
                </button>
            )}
        </div>

        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            multiple 
            accept="image/*,application/pdf,.docx,.doc"
        />
      </div>
    </div>
  );
};