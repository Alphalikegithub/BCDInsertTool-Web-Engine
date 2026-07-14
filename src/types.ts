export interface RocketConfig {
  name: string;
  childLen: number;
  viceLen: number;
  frameIntervalMs: number;
  baseTime: string; // "YYYY-MM-DD HH:mm:ss.zzz"
}

export interface FrameFileInfo {
  childLen: number;
  viceLen: number;
  leadBytes: number;
  fullFrameLen: number;
  fileSize: number;
  totalFrames: number;
}

export interface SubFrameData {
  index: number;              // Subframe index
  fileOffset: number;         // Offset in binary file
  bcdBytes: Uint8Array;       // 8 BCD bytes
  timeStr: string;            // Formatted date-time string
  isValidTime: boolean;       // If decoding succeeded
  dataBytes: Uint8Array;      // Subframe payload bytes
}

export interface LogEntry {
  id: string;
  timestamp: string;          // "HH:mm:ss.sss"
  message: string;
  type: 'info' | 'error' | 'success';
}

export interface SearchMatch {
  lineIndex: number;
  charIndex: number;
  length: number;
}
