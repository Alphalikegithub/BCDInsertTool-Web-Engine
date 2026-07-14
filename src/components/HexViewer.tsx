import { useState, useEffect, useMemo, useRef } from 'react';
import { Eye, Info } from 'lucide-react';
import { FrameFileInfo } from '../types';
import { getAsciiChar } from '../utils/bcd';

interface HexViewerProps {
  fileBuffer: ArrayBuffer | null;
  fileInfo: FrameFileInfo | null;
  searchQuery: string;
  searchTrigger: number; // Increments to trigger a search navigation
  searchDirection: 'next' | 'prev' | null;
  onSearchMeta: (current: number, total: number) => void;
  addLog: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

interface RenderLine {
  text: string;
  isHeader: boolean;
  frameNo?: number;
}

export default function HexViewer({
  fileBuffer,
  fileInfo,
  searchQuery,
  searchTrigger,
  searchDirection,
  onSearchMeta,
  addLog
}: HexViewerProps) {
  const [frameRangeStr, setFrameRangeStr] = useState<string>('');
  const [renderedLines, setRenderedLines] = useState<RenderLine[]>([]);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [activeMatchIdx, setActiveMatchIdx] = useState<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Keep track of match element references for scrolling
  const matchRefs = useRef<HTMLSpanElement[]>([]);

  // Calculate which frame indexes to display
  const frameIndexesToDisplay = useMemo(() => {
    if (!fileInfo || fileInfo.totalFrames <= 0) return [];
    
    if (!frameRangeStr.trim()) {
      // Default: Head 10 frames + Tail 10 frames
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

    // Parse custom range e.g., "1-10, 50-60, 100"
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
      // Unique & sorted
      return Array.from(new Set(indexes)).sort((a, b) => a - b);
    } catch (err) {
      return [];
    }
  }, [fileInfo, frameRangeStr]);

  // Load and format the hex lines
  const handleReadFrames = () => {
    if (!fileBuffer || !fileInfo) return;
    
    addLog(`正在读取并格式化选定帧...`, 'info');
    const bytes = new Uint8Array(fileBuffer);
    const fullFrameLen = fileInfo.fullFrameLen;
    const lines: RenderLine[] = [];
    
    const timeStr = () => new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');

    frameIndexesToDisplay.forEach((frameNo) => {
      const offset = (frameNo - 1) * fullFrameLen;
      if (offset >= bytes.length) return;
      
      const frameEnd = Math.min(offset + fullFrameLen, bytes.length);
      const frameData = bytes.slice(offset, frameEnd);
      
      // Add Frame header line
      lines.push({
        text: `[${timeStr()}] 第 ${frameNo} 帧 (文件偏移 0x${offset.toString(16).toUpperCase().padStart(8, '0')}, ${frameData.length} 字节)`,
        isHeader: true,
        frameNo
      });

      // Format 16 bytes per line
      const bytesPerLine = 16;
      for (let i = 0; i < frameData.length; i += bytesPerLine) {
        const chunkEnd = Math.min(i + bytesPerLine, frameData.length);
        const chunk = frameData.slice(i, chunkEnd);
        
        // Offset prefix inside frame
        const localOffsetHex = i.toString(16).toUpperCase().padStart(4, '0');
        
        // Hex representation
        let hexPart = '';
        for (let j = 0; j < chunk.length; j++) {
          hexPart += chunk[j].toString(16).toUpperCase().padStart(2, '0') + ' ';
        }
        // Pad hexPart if chunk < 16 bytes
        if (chunk.length < bytesPerLine) {
          hexPart = hexPart.padEnd(bytesPerLine * 3, ' ');
        }

        // ASCII representation
        let asciiPart = '';
        for (let j = 0; j < chunk.length; j++) {
          asciiPart += getAsciiChar(chunk[j]);
        }

        lines.push({
          text: `  0x${localOffsetHex}:  ${hexPart} |  ${asciiPart}`,
          isHeader: false
        });
      }
      
      // Empty separator line
      lines.push({ text: '', isHeader: false });
    });

    setRenderedLines(lines);
    setActiveMatchIdx(-1);
    setMatchCount(0);
    onSearchMeta(-1, 0);
    addLog(`成功格式化并显示 ${frameIndexesToDisplay.length} 个数据帧。`, 'success');
  };

  // Run read automatically when frame index criteria or file changes
  useEffect(() => {
    if (fileBuffer && fileInfo) {
      handleReadFrames();
    }
  }, [fileBuffer, fileInfo, frameIndexesToDisplay]);

  // Search logic within rendered lines
  // We'll parse matches dynamically when renderedLines or searchQuery changes
  const parsedContent = useMemo(() => {
    if (!searchQuery.trim() || renderedLines.length === 0) {
      setMatchCount(0);
      setActiveMatchIdx(-1);
      onSearchMeta(-1, 0);
      return renderedLines.map((l) => ({ ...l, segments: null as any }));
    }

    const query = searchQuery.toLowerCase();
    let totalMatches = 0;
    const matchPositions: { lineIdx: number; charIdx: number }[] = [];

    const parsed = renderedLines.map((line, lineIdx) => {
      const text = line.text;
      if (!text) return { ...line, segments: null };

      const lowerText = text.toLowerCase();
      const segments: { text: string; isMatch: boolean; matchGlobalIdx: number }[] = [];
      let lastIdx = 0;
      let matchIdx = lowerText.indexOf(query);

      while (matchIdx !== -1) {
        // Pre-match segment
        if (matchIdx > lastIdx) {
          segments.push({
            text: text.substring(lastIdx, matchIdx),
            isMatch: false,
            matchGlobalIdx: -1
          });
        }

        // Match segment
        segments.push({
          text: text.substring(matchIdx, matchIdx + query.length),
          isMatch: true,
          matchGlobalIdx: totalMatches
        });

        matchPositions.push({ lineIdx, charIdx: matchIdx });
        totalMatches++;

        lastIdx = matchIdx + query.length;
        matchIdx = lowerText.indexOf(query, lastIdx);
      }

      // Trailing segment
      if (lastIdx < text.length) {
        segments.push({
          text: text.substring(lastIdx),
          isMatch: false,
          matchGlobalIdx: -1
        });
      }

      return {
        ...line,
        segments: segments.length > 0 ? segments : null
      };
    });

    setMatchCount(totalMatches);
    // Reset or set match index
    setActiveMatchIdx(totalMatches > 0 ? 0 : -1);
    onSearchMeta(totalMatches > 0 ? 1 : 0, totalMatches);

    return parsed;
  }, [renderedLines, searchQuery]);

  // Handle Find Next / Prev trigger from parent
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

    // Scroll active match element into view
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
          <Eye className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">
            原码 Hex 十六进制视图
          </h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
            {fileInfo ? `共 ${fileInfo.totalFrames} 帧` : '未载入文件'}
          </span>
        </div>

        {/* Frame Range Selection */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">浏览帧范围:</span>
          <input
            type="text"
            value={frameRangeStr}
            onChange={(e) => setFrameRangeStr(e.target.value)}
            placeholder="例如: 1-10, 50-55 (默认头尾各10帧)"
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono w-full md:w-60 focus:outline-hidden focus:border-slate-400"
          />
        </div>
      </div>

      {/* Hex Content Output */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-slate-900 text-slate-300 font-mono text-xs p-4 rounded-xl overflow-y-auto border border-slate-950 shadow-inner select-text leading-relaxed"
      >
        {fileBuffer ? (
          renderedLines.length > 0 ? (
            <div className="whitespace-pre">
              {parsedContent.map((line, lineIdx) => {
                if (line.isHeader) {
                  return (
                    <div key={lineIdx} className="text-emerald-400 font-semibold py-1 border-b border-slate-800/50 mb-1">
                      {line.segments ? (
                        (line.segments as any[]).map((seg: any, segIdx: number) => (
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
                        line.text
                      )}
                    </div>
                  );
                }

                return (
                  <div key={lineIdx} className="hover:bg-slate-800/40 px-1 py-0.5 rounded-sm transition-colors">
                    {line.segments ? (
                      (line.segments as any[]).map((seg: any, segIdx: number) => (
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
                      line.text
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <Info className="w-5 h-5 text-slate-600" />
              <span>未匹配到可显示的帧，请调整上方帧范围参数</span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
            <Eye className="w-6 h-6 text-slate-700" />
            <span>请在上方载入文件以显示十六进制原码</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex justify-between items-center text-[10px] text-slate-400 font-mono">
        <span>* 注: 支持在右侧文本区域中直接划词选择复制原始数据字节。</span>
        {searchQuery.trim() && (
          <span className="bg-amber-500/10 text-amber-600 font-semibold px-2 py-0.5 rounded">
            查找到 {matchCount} 处匹配 {matchCount > 0 && `(当前第 ${activeMatchIdx + 1} 处)`}
          </span>
        )}
      </div>
    </div>
  );
}
