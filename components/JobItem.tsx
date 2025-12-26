import React from 'react';
import { ImageJob, JobStatus } from '../types';
import { Loader2, CheckCircle, AlertCircle, Eye, Trash2, Crop, RefreshCw } from 'lucide-react';

interface JobItemProps {
  job: ImageJob;
  onRemove: (id: string) => void;
  onPreview: (html: string) => void;
  onCrop: (id: string) => void;
  onRetry: (id: string) => void;
}

export const JobItem: React.FC<JobItemProps> = ({ job, onRemove, onPreview, onCrop, onRetry }) => {
  return (
    <div className={`flex items-center p-4 bg-white border rounded-lg shadow-sm hover:shadow-md transition-all group ${job.status === JobStatus.ERROR ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
      {/* Thumbnail */}
      <div className="h-20 w-20 flex-shrink-0 rounded overflow-hidden border border-slate-100 bg-slate-50 relative">
        <img 
          src={job.previewUrl} 
          alt="Original" 
          className="h-full w-full object-cover"
        />
        {job.status === JobStatus.IDLE && (
           <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              {/* Optional overlay effect */}
           </div>
        )}
      </div>

      {/* Info */}
      <div className="ml-4 flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">
          {job.file.name}
        </p>
        <p className="text-xs text-slate-500">
          {(job.file.size / 1024).toFixed(1)} KB
        </p>
        
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {job.status === JobStatus.IDLE && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
              Ready
            </span>
          )}
          {job.status === JobStatus.PROCESSING && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Processing...
            </span>
          )}
          {job.status === JobStatus.COMPLETED && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Done
            </span>
          )}
          {job.status === JobStatus.ERROR && (
            <span 
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
              title={job.error}
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              {job.error ? (job.error.includes('429') ? 'Server Busy (429)' : job.error.substring(0, 30)) : 'Failed'}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ml-4 flex items-center gap-2">
        {job.status === JobStatus.IDLE && (
          <>
            <button
              onClick={() => onCrop(job.id)}
              className="p-2 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors"
              title="Crop Image"
            >
              <Crop className="w-5 h-5" />
            </button>
          </>
        )}

        {job.status === JobStatus.ERROR && (
          <button
            onClick={() => onRetry(job.id)}
            className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors flex items-center gap-1 px-3 bg-red-50 border border-red-200"
            title="Retry this file"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-xs font-bold">Retry</span>
          </button>
        )}
        
        {job.status === JobStatus.COMPLETED && job.resultHtml && (
          <button
            onClick={() => onPreview(job.resultHtml!)}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Preview HTML"
          >
            <Eye className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={() => onRemove(job.id)}
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          title="Remove"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};