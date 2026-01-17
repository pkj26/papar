
export enum JobStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface QuestionGroup {
  id: string;
  name: string; // e.g., "Question 1"
  files: File[];
  previews: string[]; // Blob URLs for previews
  status: JobStatus;
  resultHtml?: string;
  solutionHtml?: string;
  error?: string;
}

// Deprecated but kept for compatibility if needed, though we are moving to QuestionGroup
export interface ImageJob {
  id: string;
  file: File;
  previewUrl: string;
  status: JobStatus;
  resultHtml?: string;
  solutionHtml?: string;
  error?: string;
}

export interface GenerationConfig {
  apiKey: string;
}

export interface VoterData {
  // Global Metadata (From Cover Page or Header)
  District: string;
  ACNo: string;
  ACName: string;
  PoliceStation: string;
  PostOffice: string;
  PollingStationName: string;
  PollingStationAddress: string;
  PartNo: string;

  // Section Metadata (From Page Header)
  SectionNo: string;
  SectionName: string;

  // Voter Details
  SerialNo: string;
  VoterID: string;
  NamePunjabi: string;
  NameEnglish: string;
  RelationNamePunjabi: string;
  RelationNameEnglish: string;
  RelationType: string; // Father, Mother, Husband, Other
  HouseNo: string;
  Age: string;
  Gender: string;
}

export interface VoterJob {
  id: string;
  file: File;
  status: JobStatus;
  extractedData: VoterData[];
  error?: string;
}
