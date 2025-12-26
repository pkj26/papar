import React, { useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { X, Check } from 'lucide-react';
import getCroppedImg from '../utils/canvasUtils';

interface CropModalProps {
  imageSrc: string;
  onClose: () => void;
  onSave: (croppedFile: File) => void;
  fileName: string;
}

export const CropModal: React.FC<CropModalProps> = ({ imageSrc, onClose, onSave, fileName }) => {
  // State for the crop selection
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // Initialize crop when image loads to show a default selection (e.g., center 80%)
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Set a default crop in the center
    const cropWidth = width * 0.8;
    const cropHeight = height * 0.8;
    const x = (width - cropWidth) / 2;
    const y = (height - cropHeight) / 2;
    
    setCrop({
      unit: 'px',
      x,
      y,
      width: cropWidth,
      height: cropHeight,
    });
  };

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) {
        // If no crop is selected but they click done, just save the original?
        // Or better, assume full image if no crop interaction. 
        // For now let's enforce a selection or close.
        if (!completedCrop) {
           onClose();
           return;
        }
        return;
    }

    const img = imgRef.current;
    
    // The rendered image might be scaled down by CSS (max-height/max-width).
    // We need to calculate the scale to map the crop selection back to the original image resolution.
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const finalPixelCrop = {
        x: completedCrop.x * scaleX,
        y: completedCrop.y * scaleY,
        width: completedCrop.width * scaleX,
        height: completedCrop.height * scaleY,
    };

    try {
      const croppedFile = await getCroppedImg(imageSrc, finalPixelCrop, fileName);
      onSave(croppedFile);
    } catch (e) {
      console.error("Failed to crop image", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 z-10">
          <h3 className="font-semibold text-slate-800">Select Area to Crop</h3>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 relative bg-slate-900 flex items-center justify-center p-4 overflow-auto">
           {/* ReactCrop wrapper */}
           <ReactCrop 
             crop={crop} 
             onChange={(c) => setCrop(c)} 
             onComplete={(c) => setCompletedCrop(c)}
             className="max-h-full"
           >
             <img 
               ref={imgRef} 
               src={imageSrc} 
               alt="Crop me" 
               onLoad={onImageLoad}
               className="max-h-[75vh] object-contain block mx-auto" // Limit height so it fits in modal
             />
           </ReactCrop>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-4">
            <span className="text-sm text-slate-500 mr-auto hidden sm:inline">
                Drag to select the area you want to convert.
            </span>
            <button
                onClick={onClose}
                className="px-4 py-2 text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg font-medium transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={handleSave}
                className="px-4 py-2 bg-brand-600 text-white hover:bg-brand-700 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors"
            >
                <Check className="w-4 h-4" />
                Done
            </button>
        </div>
      </div>
    </div>
  );
};