
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
  // Global Metadata (Common)
  District?: string;
  ACNo?: string;
  ACName?: string;
  PoliceStation?: string;
  PostOffice?: string;
  PollingStationName?: string;
  PollingStationAddress?: string;
  PartNo?: string;

  // Punjab Specific
  SectionNo?: string;
  SectionName?: string;
  SerialNo?: string;
  VoterID?: string;
  NamePunjabi?: string;
  NameEnglish?: string;
  RelationNamePunjabi?: string;
  RelationNameEnglish?: string;
  RelationType?: string; // Father, Mother, Husband, Other
  HouseNo?: string;
  Age?: string;
  Gender?: string;

  // UP Specific (Hindi)
  NameHindi?: string;          // 6 निर्वाचक का नाम
  RelationTypeHindi?: string;  // 7 संबंधी का प्रकार
  RelationNameHindi?: string;  // 8 संबंधी का नाम
  AddressHindi?: string;       // 9 पता
  GenderHindi?: string;        // 10 लिंग
  DOB?: string;                // 11 जन्म तिथि
  InstitutionHistory?: string; // 12 शिक्षण संस्थान विवरण
}

export interface VoterJob {
  id: string;
  file: File;
  status: JobStatus;
  extractedData: VoterData[];
  mode: 'PUNJAB' | 'UP'; // Track which mode was used
  error?: string;
}
