export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export interface UploadedFile {
  name: string;
  type: string;
  data: string; // Base64 string
}

export enum AppStatus {
  IDLE = 'IDLE',
  TRANSLATING = 'TRANSLATING',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  RESOLVING_LOCATION = 'RESOLVING_LOCATION',
  READY = 'READY',
  ERROR = 'ERROR',
}

export interface AudioState {
  buffer: AudioBuffer | null;
  duration: number;
}

export interface LocationInfo {
  address: string;
  latitude?: number;
  longitude?: number;
  mapUri?: string;
}

export interface OfficialDocInfo {
  isOfficial: boolean;
  goNumber?: string;
  department?: string;
  date?: string;
  subject?: string;
}

export interface Highlight {
  id: string;
  text: string;
  category: 'important' | 'vocabulary' | 'action';
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  fileName: string;
  targetLanguage: string;
  text: string;
  summary?: string;
  actionItems?: string[];
  location?: LocationInfo;
  officialInfo?: OfficialDocInfo;
  highlights?: Highlight[];
}
