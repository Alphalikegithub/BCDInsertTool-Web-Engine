/**
 * Get UTC day of year (1..366)
 */
export function getUTCDayOfYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const diffMs = date.getTime() - start;
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.floor(diffMs / oneDayMs) + 1;
}

/**
 * Parses space-separated date strings or ISO date strings in UTC
 */
export function parseDateTimeStr(s: string): number {
  const trimmed = s.trim();
  // Support yyyy-MM-dd hh:mm:ss.zzz format
  const regex = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;
  const match = trimmed.match(regex);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);
    let msStr = match[7] || "0";
    if (msStr.length < 3) msStr = msStr.padEnd(3, '0');
    // Keep decimal precision for sub-millisecond calculation
    const msVal = parseFloat("0." + msStr) * 1000;
    return Date.UTC(year, month, day, hour, minute, second) + msVal;
  }
  
  const d = new Date(trimmed.replace(' ', 'T'));
  if (!isNaN(d.getTime())) {
    return d.getTime();
  }
  throw new Error(`无法解析日期格式: ${s}`);
}

/**
 * Encodes a high-precision decimal epoch-millisecond timestamp to 8 BCD bytes.
 * Layout:
 *   b1..b6: BCD/bits time (low address to high address)
 *   b7: subframeIndex
 *   b8: reserved
 */
export function encodeBcd8FromMs(epochMs: number, subframeIndex: number, reserved: number = 0): Uint8Array {
  // Round to nearest 0.1ms (100 microseconds)
  const roundedMs = Math.round(epochMs * 10) / 10;
  const date = new Date(roundedMs);
  
  const dayOfYear = getUTCDayOfYear(date);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  
  const msecTotal = Math.floor(roundedMs % 1000);
  const ms_tenths = Math.round((roundedMs * 10) % 10); // 0..9 (0.1ms digit)
  
  const ms_hundreds = Math.floor(msecTotal / 100) & 0x0f;
  const ms_tens     = Math.floor((msecTotal / 10) % 10) & 0x0f;
  const ms_ones     = msecTotal % 10;

  // b1: ms_ones (high 4) | ms_tenths (low 4)
  const b1 = ((ms_ones & 0x0f) << 4) | (ms_tenths & 0x0f);
  // b2: ms_hundreds (high 4) | ms_tens (low 4)
  const b2 = ((ms_hundreds & 0x0f) << 4) | (ms_tens & 0x0f);

  // b3: second (tens << 4 | ones)
  const b3 = ((Math.floor(second / 10) & 0x0f) << 4) | (second % 10);
  // b4: minute (tens << 4 | ones)
  const b4 = ((Math.floor(minute / 10) & 0x0f) << 4) | (minute % 10);

  // Day of year representation:
  // day_hundreds (2bit), day_tens (4bit), day_units (split: units_high2 in b6 bits 1-0, units_low2 in b5 bits 7-6)
  const day_hundreds = Math.floor(dayOfYear / 100) & 0x03;
  const day_tens     = Math.floor((dayOfYear / 10) % 10) & 0x0f;
  const day_units    = dayOfYear % 10;

  const day_units_high2 = (day_units >> 2) & 0x03;
  const day_units_low2  = day_units & 0x03;

  // Hour representation: hour_tens (2bit), hour_ones (4bit)
  const hour_tens = Math.floor(hour / 10) & 0x03;
  const hour_ones = hour % 10;

  // b5: day_units_low2 (bits 7-6) | hour_tens (bits 5-4) | hour_ones (bits 3-0)
  const b5 = ((day_units_low2 & 0x03) << 6) | ((hour_tens & 0x03) << 4) | (hour_ones & 0x0f);
  // b6: day_hundreds (bits 7-6) | day_tens (bits 5-2) | day_units_high2 (bits 1-0)
  const b6 = ((day_hundreds & 0x03) << 6) | ((day_tens & 0x0f) << 2) | (day_units_high2 & 0x03);

  const b7 = subframeIndex & 0xff;
  const b8 = reserved & 0xff;

  return new Uint8Array([b1, b2, b3, b4, b5, b6, b7, b8]);
}

/**
 * Decodes 8 BCD bytes starting at `index` from a Uint8Array back to date and values.
 */
export function decodeBcd8(
  array: Uint8Array,
  index: number,
  referenceYear: number = new Date().getUTCFullYear()
): { date: Date; ms_tenths: number; isValid: boolean; subframeId: number } {
  if (index + 7 >= array.length) {
    return { date: new Date(0), ms_tenths: 0, isValid: false, subframeId: 0 };
  }

  const b1 = array[index];
  const b2 = array[index + 1];
  const b3 = array[index + 2];
  const b4 = array[index + 3];
  const b5 = array[index + 4];
  const b6 = array[index + 5];
  const b7 = array[index + 6]; // subframe Index
  // b8 is reserved

  // day of year
  const day_hundreds = (b6 >> 6) & 0x03;
  const day_tens     = (b6 >> 2) & 0x0f;
  const day_units    = ((b6 & 0x03) << 2) | ((b5 >> 6) & 0x03);
  const dayOfYear = 100 * day_hundreds + 10 * day_tens + day_units;

  // hour
  const hour = 10 * ((b5 >> 4) & 0x03) + (b5 & 0x0f);

  // minute / second
  const minute = 10 * ((b4 >> 4) & 0x0f) + (b4 & 0x0f);
  const second = 10 * ((b3 >> 4) & 0x0f) + (b3 & 0x0f);

  // millisecond
  const ms_hundreds = (b2 >> 4) & 0x0f;
  const ms_tens     = b2 & 0x0f;
  const ms_ones     = (b1 >> 4) & 0x0f;
  const ms_tenths   = b1 & 0x0f; // tenths of ms

  const msec = 100 * ms_hundreds + 10 * ms_tens + ms_ones;

  // Construct UTC Date
  const date = new Date(Date.UTC(referenceYear, 0, 1, hour, minute, second, msec));
  date.setUTCDate(date.getUTCDate() + (dayOfYear - 1));

  const isValid = 
    dayOfYear >= 1 && dayOfYear <= 366 &&
    hour >= 0 && hour < 24 &&
    minute >= 0 && minute < 60 &&
    second >= 0 && second < 60 &&
    msec >= 0 && msec < 1000;

  return { date, ms_tenths, isValid, subframeId: b7 };
}

/**
 * Format date object into "YYYY-MM-DD HH:mm:ss.zzz" + tenths of millisecond
 */
export function formatUTCDateTime(date: Date, ms_tenths: number = 0): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hr = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const sec = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  
  return `${y}-${m}-${d} ${hr}:${min}:${sec}.${ms}${ms_tenths}`;
}

/**
 * Insert 8-byte BCD timestamps into binary file buffer
 */
export function processBcdInsertion(
  fileBuffer: ArrayBuffer,
  leadBytes: number,
  childLen: number,
  viceLen: number,
  baseTimeStr: string,
  frameIntervalMs: number,
  padTail: boolean,
  onProgress: (percent: number) => void
): { outputBuffer: ArrayBuffer; totalFrames: number; tailBytes: number; originalFrames: number } {
  const inBytes = new Uint8Array(fileBuffer);
  const frameLen = leadBytes + childLen * viceLen;
  const inLen = inBytes.length;
  
  const originalFrames = Math.floor(inLen / frameLen);
  let tailBytes = inLen % frameLen;
  let totalFrames = originalFrames;
  
  let dataBytes = inBytes;
  if (tailBytes > 0 && padTail) {
    const padded = new Uint8Array(inLen + (frameLen - tailBytes));
    padded.set(inBytes);
    // rest is zeroed out by default
    dataBytes = padded;
    totalFrames += 1;
    tailBytes = 0;
  }
  
  const baseEpochMs = parseDateTimeStr(baseTimeStr);
  
  // Each subframe in output has: 8 bytes BCD header + childLen payload bytes
  const outputSubframeLen = 8 + childLen;
  const outputFrameLen = outputSubframeLen * viceLen;
  const outputSize = totalFrames * outputFrameLen;
  
  const outBytes = new Uint8Array(outputSize);
  let outOffset = 0;
  
  const childUsFloat = frameIntervalMs * 1000.0 / viceLen;
  
  for (let n = 0; n < totalFrames; n++) {
    const frameStart = n * frameLen;
    // full frame's last child time is: base + n * frameIntervalMs
    const lastChildTimeMs = baseEpochMs + n * frameIntervalMs;
    
    for (let k = 0; k < viceLen; k++) {
      const idxFromLast = (viceLen - 1) - k;
      const offsUs = Math.round(idxFromLast * childUsFloat);
      const childTimeMs = lastChildTimeMs - (offsUs / 1000.0);
      
      // Encode
      const bcdHeader = encodeBcd8FromMs(childTimeMs, k, 0);
      outBytes.set(bcdHeader, outOffset);
      outOffset += 8;
      
      // Copy subframe payload from original file
      const childPayloadOffset = frameStart + leadBytes + k * childLen;
      if (childPayloadOffset + childLen <= dataBytes.length) {
        const payload = dataBytes.subarray(childPayloadOffset, childPayloadOffset + childLen);
        outBytes.set(payload, outOffset);
      } else {
        const available = Math.max(0, dataBytes.length - childPayloadOffset);
        if (available > 0) {
          const payload = dataBytes.subarray(childPayloadOffset, childPayloadOffset + available);
          outBytes.set(payload, outOffset);
        }
        // zero padding is automatically done because outBytes is initialized to 0
      }
      outOffset += childLen;
    }
    
    if (n % 100 === 0 || n === totalFrames - 1) {
      onProgress(Math.round(((n + 1) / totalFrames) * 100));
    }
  }
  
  return {
    outputBuffer: outBytes.buffer,
    totalFrames,
    tailBytes,
    originalFrames
  };
}

/**
 * Format bytes to a hex line segment
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }
  return hex.trim();
}

/**
 * Helper to check if a value is a valid ASCII char (for hex view print)
 */
export function getAsciiChar(b: number): string {
  return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
}
