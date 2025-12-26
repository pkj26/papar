import React from 'react';
import { X } from 'lucide-react';

interface PreviewModalProps {
  html: string | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ html, onClose }) => {
  if (!html) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800">HTML Preview</h3>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 bg-slate-100 p-8 overflow-auto">
           {/* We use shadow DOM or iframe isolation in a real production app, 
               but for simplicity we render inside a confined div with scope */}
           <div 
             className="bg-white shadow-lg mx-auto min-h-[1000px] max-w-[210mm] p-[10mm] origin-top"
             style={{
               // Simulate A4 paper
               width: '210mm',
             }}
             dangerouslySetInnerHTML={{ __html: html }}
           />
        </div>
      </div>
    </div>
  );
};