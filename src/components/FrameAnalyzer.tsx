import { useState, useEffect, useMemo, useRef } from 'react';
import { Network, Info, AlertTriangle } from 'lucide-react';
import { FrameFileInfo } from '../types';
import { decodeBcd8, formatUTCDateTime, bytesToHex } from '../utils/bcd';

interface FrameAnalyzerProps {
  fileBuffer: ArrayBuffer | null;
  fileInfo: FrameFileInfo | null;
  baseTimeStr: string;
  searchQuery: string;
  searchTrigger: number;
  searchDirection: 'next' | 'prev' | null;
  onSearchMeta: (current: number, total: number) => void;
  addLog: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

interface RenderLine {
  text: string;
  type: 'frame-header' | 'bcd' | 'time' | 'data-header' | 'data-hex' | 'empty';
  subframeNo?: number;
}

export default function FrameAnalyzer({
  fileBuffer,
  fileInfo,
  baseTimeStr,
  searchQuery,
  searchTrigger,
  searchDirection,
  onSearchMeta,
  addLog
}: FrameAnalyzerProps) {
  const [frameRangeStr, setFrameRangeStr] = useState<string>('');
  const [renderedLines, setRenderedLines] = useState<RenderLine[]>([]);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [activeMatchIdx, setActiveMatchIdx] = useState<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Track match element refs
  const matchRefs = useRef<HTMLSpanElement[]>([]);

  // Parse reference year from baseTimeStr
  const referenceYear = useMemo(() => {
    try {
      const year = parseInt(baseTimeStr.trim().substring(0, 4), 10);
      return isNaN(year) ? new Date().getUTCFullYear() : year;
    } catch {
      return new Date().getUTCFullYear();
    }
  }, [baseTimeStr]);

  // Frame selection range calculation
  const frameIndexesToDisplay = useMemo(() => {
    if (!fileInfo || fileInfo.totalFrames <= 0) return [];
    
    if (!frameRangeStr.trim()) {
      // Default: show first 10 and last 10 frames
      const indexes: number[] = [];
      const total = fileInfo.totalFrames;
      
      for (let i = 1; i <= 10 && i <= total; i++) {
        indexes.push(i);
      }
      for (let i = Math.max(11, total - 9); i <= total; i++) {
        indexes.push(i);
      }
      return indexes;
    }

    try {
      const indexes: number[] = [];
      const parts = frameRangeStr.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
          const [startStr, endStr] = trimmed.split('-');
          const start = parseInt(startStr);
          const end = parseInt(endStr);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              if (i >= 1 && i <= fileInfo.totalFrames) {
                indexes.push(i);
              }
            }
          }
        } else {
          const val = parseInt(trimmed);
          if (!isNaN(val) && val >= 1 && val <= fileInfo.totalFrames) {
            indexes.push(val);
          }
        }
      }
      return Array.from(new Set(indexes)).sort((a, b) => a - b);
    } catch (err) {
      return [];
    }
  }, [fileInfo, frameRangeStr]);

  // Read subframes, parse BCD headers and payload
  const handleAnalyzeFrames = () => {
    if (!fileBuffer || !fileInfo) return;

    addLog(`正在解析并还原 BCD 时标数据帧...`, 'info');
    const bytes = new Uint8Array(fileBuffer);
    const leadBytes = fileInfo.leadBytes;
    const childLen = fileInfo.childLen;
    const viceLen = fileInfo.viceLen;
    const fullFrameLen = fileInfo.fullFrameLen;

    const lines: RenderLine[] = [];

    frameIndexesToDisplay.forEach((frameNo) => {
      const frameOffset = (frameNo - 1) * fullFrameLen;
      if (frameOffset >= bytes.length) return;

      const frameEnd = Math.min(frameOffset + fullFrameLen, bytes.length);
      const frameData = bytes.slice(frameOffset, frameEnd);

      for (let k = 0; k < viceLen; k++) {
        const subOffset = leadBytes + k * childLen;
        if (subOffset + 8 > frameData.length) continue;

        const absoluteSubOffset = frameOffset + subOffset;
        const subframeIndexGlobal = (frameNo - 1) * viceLen + k;

        // Extract 8-byte BCD
        const bcdBytes = frameData.slice(subOffset, subOffset + 8);
        const bcdHex = bytesToHex(bcdBytes);

        // Decode BCD to DateTime
        const { date, ms_tenths, isValid } = decodeBcd8(frameData, subOffset, referenceYear);
        const timeFormatted = isValid ? formatUTCDateTime(date, ms_tenths) : 'INVALID_TIME';

        // Extract data payload (excluding the 8-byte BCD)
        const dataBytes = frameData.slice(subOffset + 8, Math.min(subOffset + childLen, frameData.length));

        // Subframe header line
        lines.push({
          text: `遥测原码帧解析： 子帧 #Shadow_${String(subframeIndexGlobal).padStart(6, '0')} (文件偏移 0x${absoluteSubOffset.toString(16).toUpperCase().padStart(8, '0')})`,
          type: 'frame-header',
          subframeNo: subframeIndexGlobal
        });

        // BCD bytes line
        lines.push({
          text: `  BCD(8B): ${bcdHex}`,
          type: 'bcd'
        });

        // TIME line
        lines.push({
          text: `  TIME  : [${timeFormatted}]`,
          type: 'time'
        });

        // DATA header
        lines.push({
          text: `  DATA (${dataBytes.length}B):`,
          type: 'data-header'
        });

        // DATA payload hex (16 bytes per line)
        const bytesPerLine = 16;
        for (let i = 0; i < dataBytes.length; i += bytesPerLine) {
          const chunkEnd = Math.min(i + bytesPerLine, dataBytes.length);
          const chunk = dataBytes.slice(i, chunkEnd);
          const chunkHex = bytesToHex(chunk);
          lines.push({
            text: `    ${chunkHex}`,
            type: 'data-hex'
          });
        }

        // Empty line spacer
        lines.push({ text: '', type: 'empty' });
      }
    });

    setRenderedLines(lines);
    setActiveMatchIdx(-1);
    setMatchCount(0);
    onSearchMeta(-1, 0);
    addLog(`成功解析 ${frameIndexesToDisplay.length} 帧下的 ${frameIndexesToDisplay.length * viceLen} 个子帧的时标及负载数据。`, 'success');
  };

  // Run automatically on triggers
  useEffect(() => {
    if (fileBuffer && fileInfo) {
      handleAnalyzeFrames();
    }
  }, [fileBuffer, fileInfo, frameIndexesToDisplay, referenceYear]);

  // Word Search highlights
  const parsedContent = useMemo(() => {
    if (!searchQuery.trim() || renderedLines.length === 0) {
      setMatchCount(0);
      setActiveMatchIdx(-1);
      onSearchMeta(-1, 0);
      return renderedLines.map((l) => ({ ...l, segments: null }));
    }

    const query = searchQuery.toLowerCase();
    let totalMatches = 0;

    const parsed = renderedLines.map((line) => {
      const text = line.text;
      if (!text) return { ...line, segments: null };

      // Replace #Shadow_ prefix internally with just '#' for nice display
      const displayText = text.replace('#Shadow_', '#');
      const lowerText = displayText.toLowerCase();
      const segments: { text: string; isMatch: boolean; matchGlobalIdx: number }[] = [];
      let lastIdx = 0;
      let matchIdx = lowerText.indexOf(query);

      while (matchIdx !== -1) {
        if (matchIdx > lastIdx) {
          segments.push({
            text: displayText.substring(lastIdx, matchIdx),
            isMatch: false,
            matchGlobalIdx: -1
          });
        }

        segments.push({
          text: displayText.substring(matchIdx, matchIdx + query.length),
          isMatch: true,
          matchGlobalIdx: totalMatches
        });

        totalMatches++;
        lastIdx = matchIdx + query.length;
        matchIdx = lowerText.indexOf(query, lastIdx);
      }

      if (lastIdx < displayText.length) {
        segments.push({
          text: displayText.substring(lastIdx),
          isMatch: false,
          matchGlobalIdx: -1
        });
      }

      return {
        ...line,
        text: displayText,
        segments: segments.length > 0 ? segments : null
      };
    });

    setMatchCount(totalMatches);
    setActiveMatchIdx(totalMatches > 0 ? 0 : -1);
    onSearchMeta(totalMatches > 0 ? 1 : 0, totalMatches);

    return parsed;
  }, [renderedLines, searchQuery]);

  // Scroll navigation on search
  useEffect(() => {
    if (matchCount <= 0 || searchTrigger === 0 || !searchDirection) return;

    let nextIdx = activeMatchIdx;
    if (searchDirection === 'next') {
      nextIdx = (activeMatchIdx + 1) % matchCount;
    } else if (searchDirection === 'prev') {
      nextIdx = (activeMatchIdx - 1 + matchCount) % matchCount;
    }

    setActiveMatchIdx(nextIdx);
    onSearchMeta(nextIdx + 1, matchCount);

    setTimeout(() => {
      const activeEl = matchRefs.current[nextIdx];
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 50);

  }, [searchTrigger]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col h-[520px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">
            时标子帧解析与校验
          </h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
            {fileInfo ? `子帧长度: ${fileInfo.childLen}B` : '未载入文件'}
          </span>
        </div>

        {/* Frame Range Selection */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">浏览帧范围:</span>
          <input
            type="text"
            value={frameRangeStr}
            onChange={(e) => setFrameRangeStr(e.target.value)}
            placeholder="例如: 1-5, 20 (默认头尾各10帧)"
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono w-full md:w-60 focus:outline-hidden focus:border-slate-400"
          />
        </div>
      </div>

      {/* Output Screen */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-[#1e293b] text-slate-200 font-mono text-xs p-4 rounded-xl overflow-y-auto border border-slate-950 shadow-inner select-text leading-relaxed"
      >
        {fileBuffer ? (
          renderedLines.length > 0 ? (
            <div className="whitespace-pre">
              {parsedContent.map((line, lineIdx) => {
                const displayText = line.segments ? null : line.text.replace('#Shadow_', '#');
                
                if (line.type === 'frame-header') {
                  return (
                    <div key={lineIdx} className="text-amber-400 font-semibold py-1 mt-2 border-b border-slate-700/50">
                      {line.segments ? (
                        line.segments.map((seg, segIdx) => (
                          <span
                            key={segIdx}
                            ref={(el) => {
                              if (seg.isMatch && el) {
                                matchRefs.current[seg.matchGlobalIdx] = el;
                              }
                            }}
                            className={
                              seg.isMatch
                                ? seg.matchGlobalIdx === activeMatchIdx
                                  ? 'bg-amber-400 text-slate-950 font-bold px-0.5 rounded shadow-xs'
                                  : 'bg-amber-400/30 text-amber-300 px-0.5 rounded'
                                : ''
                            }
                          >
                            {seg.text}
                          </span>
                        ))
                      ) : (
                        displayText
                      )}
                    </div>
                  );
                }

                if (line.type === 'time') {
                  const isInvalid = line.text.includes('INVALID_TIME');
                  return (
                    <div key={lineIdx} className={isInvalid ? 'text-red-400 bg-red-950/20 px-1 py-0.5 rounded-sm' : 'text-emerald-400 hover:bg-slate-800/20 px-1'}>
                      {line.segments ? (
                        line.segments.map((seg, segIdx) => (
                          <span
                            key={segIdx}
                            ref={(el) => {
                              if (seg.isMatch && el) {
                                matchRefs.current[seg.matchGlobalIdx] = el;
                              }
                            }}
                            className={
                              seg.isMatch
                                ? seg.matchGlobalIdx === activeMatchIdx
                                  ? 'bg-amber-400 text-slate-950 font-bold px-0.5 rounded shadow-xs'
                                  : 'bg-amber-400/30 text-amber-300 px-0.5 rounded'
                                : ''
                            }
                          >
                            {seg.text}
                          </span>
                        ))
                      ) : (
                        displayText
                      )}
                      {isInvalid && <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-300 px-1 ml-2 rounded"><AlertTriangle className="w-3 h-3" /> BCD 校验错误</span>}
                    </div>
                  );
                }

                return (
                  <div
                    key={lineIdx}
                    className={`px-1 py-0.2 hover:bg-slate-800/30 rounded-sm transition-colors ${
                      line.type === 'bcd' ? 'text-sky-300' : 'text-slate-300'
                    }`}
                  >
                    {line.segments ? (
                      line.segments.map((seg, segIdx) => (
                        <span
                          key={segIdx}
                          ref={(el) => {
                            if (seg.isMatch && el) {
                              matchRefs.current[seg.matchGlobalIdx] = el;
                            }
                          }}
                          className={
                            seg.isMatch
                              ? seg.matchGlobalIdx === activeMatchIdx
                                ? 'bg-amber-400 text-slate-950 font-bold px-0.5 rounded shadow-xs'
                                : 'bg-amber-400/40 text-amber-200 px-0.5 rounded'
                              : ''
                          }
                        >
                          {seg.text}
                        </span>
                      ))
                    ) : (
                      displayText
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <Info className="w-5 h-5 text-slate-600" />
              <span>所选帧范围无有效子帧数据</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
            <Network className="w-6 h-6 text-slate-700" />
            <span>请在上方选择或处理原码文件以开启子帧时标解析</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex justify-between items-center text-[10px] text-slate-400 font-mono">
        <span>* 注: 本解析器会自动解包8B BCD时码中的微秒/毫秒/天，并对比校验副帧ID与时间连续性。</span>
        {searchQuery.trim() && (
          <span className="bg-amber-500/10 text-amber-600 font-semibold px-2 py-0.5 rounded">
            查找到 {matchCount} 处匹配 {matchCount > 0 && `(当前第 ${activeMatchIdx + 1} 处)`}
          </span>
        )}
      </div>
    </div>
  );
}
