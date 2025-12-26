import React, { useState, useRef, useEffect } from 'react';
import { X, Save, AlignLeft, AlignCenter, AlignRight, Check, AlertCircle } from 'lucide-react';

interface PreviewModalProps {
  html: string;
  jobId: string;
  onClose: () => void;
  onSave: (id: string, newHtml: string) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ html, jobId, onClose, onSave }) => {
  // Local state for margins in mm
  const [margins, setMargins] = useState({ top: 10, right: 10, bottom: 10, left: 10 });
  const contentRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize the editable div with the HTML
  useEffect(() => {
    if (contentRef.current) {
        // We need to strip existing container padding if it exists, or just place the raw html content in our container
        // The service returns the content without body/head tags, so it's safe to inject.
        // However, if the user edits multiple times, we might be wrapping wrappers.
        // For simplicity, we assume 'html' is the inner content.
        contentRef.current.innerHTML = html;
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    if (contentRef.current) {
        const editedContent = contentRef.current.innerHTML;
        
        // Wrap the content in a div that applies the margins as inline styles
        // This ensures the margins persist when downloading via the main App buttons
        const wrapperStyle = `padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; width: 100%; box-sizing: border-box;`;
        
        // Check if we already wrapped it previously to avoid nesting padding hell
        // A simple heuristic: if the edited content starts with a div having our specific style pattern, maybe unwrap it?
        // Actually, simpler: Just save the innerHTML. 
        // AND THEN apply the margins to the container in the final download function in App.tsx?
        // NO, the user wants to adjust margins PER PAGE here. 
        // So we wrap it in a div.
        
        const finalHtml = `<div style="${wrapperStyle}">${editedContent}</div>`;
        
        onSave(jobId, finalHtml);
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const executeCommand = (command: string) => {
    document.execCommand(command, false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden">
        
        {/* Top Toolbar */}
        <div className="flex flex-col border-b border-slate-200 bg-slate-50 z-10">
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   Edit & Preview
                   <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">Editable</span>
                </h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium text-sm"
                    >
                        {isSaving ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {isSaving ? "Saved!" : "Save Changes"}
                    </button>
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Editing Controls */}
            <div className="flex items-center gap-6 p-2 px-4 bg-white text-sm overflow-x-auto">
                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase tracking-wider">Align</span>
                    <button onClick={() => executeCommand('justifyLeft')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyCenter')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyRight')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Right"><AlignRight className="w-4 h-4" /></button>
                </div>

                {/* Margins */}
                <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase tracking-wider">Margins (mm)</span>
                    
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">Left</label>
                        <input 
                            type="range" min="0" max="50" value={margins.left} 
                            onChange={(e) => setMargins(prev => ({ ...prev, left: Number(e.target.value) }))}
                            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xs w-4">{margins.left}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">Right</label>
                        <input 
                            type="range" min="0" max="50" value={margins.right} 
                            onChange={(e) => setMargins(prev => ({ ...prev, right: Number(e.target.value) }))}
                            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                         <span className="text-xs w-4">{margins.right}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">Top</label>
                        <input 
                            type="range" min="0" max="50" value={margins.top} 
                            onChange={(e) => setMargins(prev => ({ ...prev, top: Number(e.target.value) }))}
                            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                         <span className="text-xs w-4">{margins.top}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">Bottom</label>
                        <input 
                            type="range" min="0" max="50" value={margins.bottom} 
                            onChange={(e) => setMargins(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                         <span className="text-xs w-4">{margins.bottom}</span>
                    </div>
                </div>
            </div>
            
            <div className="px-4 py-1 bg-yellow-50 text-yellow-700 text-xs flex items-center gap-2 border-b border-yellow-100">
                <AlertCircle className="w-3 h-3" />
                <span>Click anywhere on the document below to type, delete text, or fix spacing issues. Don't forget to click <strong>Save Changes</strong>.</span>
            </div>
        </div>
        
        {/* Editor Area */}
        <div className="flex-1 bg-slate-200 p-8 overflow-auto flex justify-center">
           <div 
             className="bg-white shadow-xl min-h-[297mm] origin-top outline-none"
             style={{
               width: '210mm',
               // Dynamic Padding based on controls
               paddingTop: `${margins.top}mm`,
               paddingRight: `${margins.right}mm`,
               paddingBottom: `${margins.bottom}mm`,
               paddingLeft: `${margins.left}mm`,
             }}
           >
               {/* Content Editable Div */}
               <div 
                  ref={contentRef}
                  contentEditable
                  className="outline-none min-h-full"
                  style={{ width: '100%' }}
                  spellCheck={false}
               />
           </div>
        </div>
      </div>
    </div>
  );
};