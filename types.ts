export enum JobStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface ImageJob {
  id: string;
  file: File;
  previewUrl: string;
  status: JobStatus;
  resultHtml?: string;
  solutionHtml?: string; // Stores the AI generated detailed solution
  error?: string;
}

export interface GenerationConfig {
  apiKey: string;
}