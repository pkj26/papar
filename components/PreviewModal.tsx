import React, { useState, useRef, useEffect } from 'react';
import { X, Save, AlignLeft, AlignCenter, AlignRight, Check, AlertCircle, Bold, Italic, Underline, Type, ArrowDownToLine, Scissors } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fitStatus, setFitStatus] = useState<string>("");

  // Initialize the editable div with the HTML
  useEffect(() => {
    if (contentRef.current) {
        contentRef.current.innerHTML = html;
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

  const insertPageBreak = () => {
    const breakHtml = `<div style="page-break-after: always; height: 1px; border-bottom: 2px dashed #ccc; margin: 20px 0; position: relative;" title="Page Break"></div>`;
    document.execCommand('insertHTML', false, breakHtml);
  };

  const handleAutoFit = () => {
    if (!containerRef.current || !contentRef.current) return;
    
    setFitStatus("Fitting...");
    
    // A4 height in pixels approx 1122px at 96dpi (297mm). 
    // We want to fit into roughly 1 page height minus margins.
    const A4_HEIGHT_PX = 1050; // Safety buffer
    
    // Reset font size to start fresh or continue? Let's just scale down current.
    let currentScale = 100; // percent
    let iterations = 0;
    
    const attemptFit = () => {
        if (!contentRef.current) return;
        const height = contentRef.current.scrollHeight;
        
        if (height > A4_HEIGHT_PX && iterations < 20) {
            // Reduce font size of everything
            currentScale -= 5;
            contentRef.current.style.fontSize = `${currentScale}%`;
            iterations++;
            requestAnimationFrame(attemptFit);
        } else {
            setFitStatus(iterations > 0 ? `Shrunk to ${currentScale}%` : "Already fits!");
            setTimeout(() => setFitStatus(""), 2000);
        }
    };
    
    attemptFit();
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
                
                {/* Font/Type */}
                <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                    <Type className="w-4 h-4 text-slate-400" />
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
                        <button onClick={() => executeCommand('bold')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all"><Bold className="w-3.5 h-3.5" /></button>
                        <button onClick={() => executeCommand('italic')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all"><Italic className="w-3.5 h-3.5" /></button>
                        <button onClick={() => executeCommand('underline')} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all"><Underline className="w-3.5 h-3.5" /></button>
                    </div>
                </div>

                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
                    <button onClick={() => executeCommand('justifyLeft')} className="p-1.5 hover:bg-slate-100 rounded" title="Left"><AlignLeft className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyCenter')} className="p-1.5 hover:bg-slate-100 rounded" title="Center"><AlignCenter className="w-4 h-4" /></button>
                    <button onClick={() => executeCommand('justifyRight')} className="p-1.5 hover:bg-slate-100 rounded" title="Right"><AlignRight className="w-4 h-4" /></button>
                </div>

                {/* Page Controls */}
                <div className="flex items-center gap-3 border-r border-slate-200 pr-4">
                    <button 
                        onClick={handleAutoFit}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100"
                        title="Shrink font size until it fits 1 page"
                    >
                        <ArrowDownToLine className="w-3 h-3" />
                        {fitStatus || "Auto Fit"}
                    </button>

                    <button 
                        onClick={insertPageBreak}
                        className="flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100"
                        title="Insert Page Break at cursor"
                    >
                        <Scissors className="w-3 h-3" />
                        Page Break
                    </button>
                </div>

                {/* Margins */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold text-slate-400 mr-1 uppercase">Margins</span>
                    {['Top', 'Right', 'Bottom', 'Left'].map((side, i) => (
                        <div key={side} className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">{side[0]}</span>
                            <input 
                                type="number" min="0" max="50" 
                                value={Object.values(margins)[i]} 
                                onChange={(e) => setMargins(prev => ({ ...prev, [side.toLowerCase()]: Number(e.target.value) }))}
                                className="w-8 h-6 text-xs border rounded px-1 text-center"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
        
        {/* Editor Area */}
        <div className="flex-1 bg-slate-200 p-8 overflow-auto flex justify-center relative">
           <div 
             ref={containerRef}
             className="bg-white shadow-xl min-h-[297mm] origin-top outline-none relative"
             style={{
               width: '210mm',
               paddingTop: `${margins.top}mm`,
               paddingRight: `${margins.right}mm`,
               paddingBottom: `${margins.bottom}mm`,
               paddingLeft: `${margins.left}mm`,
             }}
           >
               {/* Visual Page Guide Marker (A4 end) */}
               <div className="absolute top-[297mm] left-0 right-0 border-b-2 border-red-300 border-dashed pointer-events-none z-10 opacity-50">
                    <span className="absolute right-2 -top-5 text-xs text-red-400 bg-white px-1">End of Page 1</span>
               </div>
               
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