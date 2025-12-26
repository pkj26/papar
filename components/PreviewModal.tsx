import React, { useState, useRef, useEffect } from 'react';
import { X, Save, AlignLeft, AlignCenter, AlignRight, Check, AlertCircle, Bold, Italic, Underline, Type } from 'lucide-react';

interface PreviewModalProps {
  html: string;
  jobId: string;
  onClose: () => void;
  onSave: (id: string, newHtml: string) => void;
}

const FONTS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Tahoma', value: 'Tahoma' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
];

const SIZES = [
  { label: 'Tiny', value: '1' },
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Medium', value: '4' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '6' },
  { label: 'Huge', value: '7' },
];

export const PreviewModal: React.FC<PreviewModalProps> = ({ html, jobId, onClose, onSave }) => {
  // Local state for margins in mm
  const [margins, setMargins] = useState({ top: 10, right: 10, bottom: 10, left: 10 });
  const contentRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize the editable div with the HTML
  useEffect(() => {
    if (contentRef.current) {
        contentRef.current.innerHTML = html;
        // Enable CSS styling for execCommand
        document.execCommand('styleWithCSS', false, 'true');
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    if (contentRef.current) {
        const editedContent = contentRef.current.innerHTML;
        
        // Wrap the content in a div that applies the margins as inline styles
        const wrapperStyle = `padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; width: 100%; box-sizing: border-box;`;
        
        const finalHtml = `<div style="${wrapperStyle}">${editedContent}</div>`;
        
        onSave(jobId, finalHtml);
    }
    setTimeout(() => setIsSaving(false), 500);
  };

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
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
                
                {/* Typography */}
                <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase tracking-wider flex items-center gap-1">
                        <Type className="w-3 h-3" /> Font
                    </span>
                    
                    <select 
                        onChange={(e) => executeCommand('fontName', e.target.value)}
                        className="h-8 text-xs border border-slate-300 rounded px-1 w-28 outline-none focus:border-brand-500 bg-white"
                        defaultValue=""
                    >
                        <option value="" disabled>Family</option>
                        {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>

                    <select 
                        onChange={(e) => executeCommand('fontSize', e.target.value)}
                        className="h-8 text-xs border border-slate-300 rounded px-1 w-20 outline-none focus:border-brand-500 bg-white"
                        defaultValue="3"
                    >
                         {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>

                    <div className="flex bg-slate-100 rounded p-0.5 border border-slate-200 ml-1">
                        <button onClick={() => executeCommand('bold')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                        <button onClick={() => executeCommand('italic')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                        <button onClick={() => executeCommand('underline')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all" title="Underline"><Underline className="w-3.5 h-3.5" /></button>
                    </div>
                </div>

                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase tracking-wider">Align</span>
                    <button onClick={() => executeCommand('justifyLeft')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyCenter')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyRight')} className="p-1.5 hover:bg-slate-100 rounded" title="Align Right"><AlignRight className="w-4 h-4" /></button>
                </div>

                {/* Margins */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase tracking-wider">Margins (mm)</span>
                    
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">L</label>
                        <input 
                            type="range" min="0" max="50" value={margins.left} 
                            onChange={(e) => setMargins(prev => ({ ...prev, left: Number(e.target.value) }))}
                            className="w-12 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            title={`Left: ${margins.left}mm`}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">R</label>
                        <input 
                            type="range" min="0" max="50" value={margins.right} 
                            onChange={(e) => setMargins(prev => ({ ...prev, right: Number(e.target.value) }))}
                            className="w-12 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            title={`Right: ${margins.right}mm`}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">T</label>
                        <input 
                            type="range" min="0" max="50" value={margins.top} 
                            onChange={(e) => setMargins(prev => ({ ...prev, top: Number(e.target.value) }))}
                            className="w-12 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            title={`Top: ${margins.top}mm`}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600">B</label>
                        <input 
                            type="range" min="0" max="50" value={margins.bottom} 
                            onChange={(e) => setMargins(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                            className="w-12 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            title={`Bottom: ${margins.bottom}mm`}
                        />
                    </div>
                </div>
            </div>
            
            <div className="px-4 py-1 bg-yellow-50 text-yellow-700 text-xs flex items-center gap-2 border-b border-yellow-100">
                <AlertCircle className="w-3 h-3" />
                <span>Select text to change font/size. Click anywhere to type or fix spacing. <strong>Changes are saved on 'Save Changes'</strong>.</span>
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