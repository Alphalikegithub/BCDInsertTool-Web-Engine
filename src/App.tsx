import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, 
  Terminal, 
  Binary, 
  FileCheck2, 
  BarChart3, 
  ChevronUp, 
  ChevronDown, 
  Eraser,
  Search
} from 'lucide-react';

import { FrameFileInfo, LogEntry } from './types';
import FileProcessor from './components/FileProcessor';
import HexViewer from './components/HexViewer';
import FrameAnalyzer from './components/FrameAnalyzer';
import StatsDashboard from './components/StatsDashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'hex' | 'analyzer' | 'stats'>('console');
  
  // Loaded file state
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileInfo, setFileInfo] = useState<FrameFileInfo | null>(null);
  const [outputFileName, setOutputFileName] = useState<string>('');
  const [baseTimeStr, setBaseTimeStr] = useState<string>('2025-11-10 10:41:30.841');
  const [frameIntervalMs, setFrameIntervalMs] = useState<number>(25.0);

  // Global search state for Hex and Analyzer tabs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchTrigger, setSearchTrigger] = useState<number>(0);
  const [searchDirection, setSearchDirection] = useState<'next' | 'prev' | null>(null);
  const [searchCurrent, setSearchCurrent] = useState<number>(-1);
  const [searchTotal, setSearchTotal] = useState<number>(0);

  // Operation logging history
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init',
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
      message: 'BCD时标插入工具启动就绪，等待加载遥测原码文件。',
      type: 'success'
    }
  ]);

  // Log append helper
  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        message,
        type
      }
    ]);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('日志已清空', 'info');
  };

  // Callback when raw file loaded
  const handleFileLoaded = (loadedFile: File, buffer: ArrayBuffer, info: FrameFileInfo) => {
    setFile(loadedFile);
    setFileBuffer(buffer);
    setFileInfo(info);
    addLog(`载入原码文件 ${loadedFile.name} 完成，计算共 ${info.totalFrames} 个数据帧。`, 'success');
  };

  // Callback when BCD processing finishes
  const handleProcessed = (processedBuffer: ArrayBuffer, outName: string, info: FrameFileInfo) => {
    setFileBuffer(processedBuffer);
    setOutputFileName(outName);
    setFileInfo(info);
    addLog(`文件已成功处理。当前已自动切换当前缓冲区为处理后带BCD时码的文件: ${outName}`, 'success');
  };

  // Triggers search action
  const handleSearchNav = (direction: 'next' | 'prev') => {
    setSearchDirection(direction);
    setSearchTrigger(t => t + 1);
  };

  const handleSearchMetaChange = (current: number, total: number) => {
    setSearchCurrent(current);
    setSearchTotal(total);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col antialiased">
      {/* Header and Branding */}
      <header className="bg-[#0f172a] text-slate-100 py-4 px-6 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 rounded-xl text-sky-400 border border-slate-700 shadow-inner">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white font-sans">
                  BCD 时标插入与分析工具
                </h1>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
                  v2.0 Web-Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Rocket Telemetry Raw Binary BCD Code Timestamp Multiplexer & Parser
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span>状态: 运行就绪</span>
            </div>
            <span className="text-slate-700">|</span>
            <div>
              <span>系统时间: 2026-07-13 UTC</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 flex flex-col">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-2">
          <nav className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            {/* Control Console */}
            <button
              onClick={() => setActiveTab('console')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === 'console'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              时标插入控制台
            </button>

            {/* Hex Display */}
            <button
              onClick={() => setActiveTab('hex')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === 'hex'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Binary className="w-4 h-4" />
              十六进制原码视图
            </button>

            {/* Frame Analyzer */}
            <button
              onClick={() => setActiveTab('analyzer')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === 'analyzer'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
              子帧数据解析
            </button>

            {/* Stats Dashboard */}
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                activeTab === 'stats'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              遥测统计分析
            </button>
          </nav>

          {/* Search Bar - only displayed when on Hex or Analyzer Tab */}
          {(activeTab === 'hex' || activeTab === 'analyzer') && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-xs w-full md:w-auto">
              <div className="flex items-center gap-2 pl-3 flex-1 md:flex-none">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索十六进制或字符..."
                  className="bg-transparent border-none text-xs focus:outline-hidden w-full md:w-48 text-slate-700"
                />
              </div>

              {searchQuery.trim() && (
                <div className="flex items-center gap-1 border-l border-slate-100 pl-2">
                  <span className="text-[10px] text-slate-400 font-mono pr-1 select-none">
                    {searchTotal > 0 ? `${searchCurrent}/${searchTotal}` : '0/0'}
                  </span>
                  
                  <button
                    onClick={() => handleSearchNav('prev')}
                    disabled={searchTotal === 0}
                    title="查找上一个 (Prev)"
                    className="p-1 hover:bg-slate-50 text-slate-500 hover:text-slate-800 disabled:opacity-40 rounded"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleSearchNav('next')}
                    disabled={searchTotal === 0}
                    title="查找下一个 (Next)"
                    className="p-1 hover:bg-slate-50 text-slate-500 hover:text-slate-800 disabled:opacity-40 rounded"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected File Floating Status Badge */}
        {file && (
          <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="font-semibold text-slate-700 truncate">
                {outputFileName ? `带时标文件: ${outputFileName}` : `当前未处理文件: ${file.name}`}
              </span>
              <span className="text-slate-400">|</span>
              <span className="font-mono text-slate-500">{(file.size / 1024 / 1024).toFixed(3)} MB</span>
              {fileInfo && (
                <>
                  <span className="text-slate-400">|</span>
                  <span className="font-mono text-slate-500">帧数: {fileInfo.totalFrames}</span>
                  <span className="text-slate-400">|</span>
                  <span className="font-mono text-slate-500">单帧: {fileInfo.fullFrameLen} B</span>
                </>
              )}
            </div>

            <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
              * 可以在上方控制台中重新处理或下载此文件
            </span>
          </div>
        )}

        {/* Tab View Transition Router */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'console' && (
              <motion.div
                key="console"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <FileProcessor 
                  onFileLoaded={handleFileLoaded}
                  onProcessed={handleProcessed}
                  addLog={addLog}
                  onParamsChange={(base, interval) => {
                    setBaseTimeStr(base);
                    setFrameIntervalMs(interval);
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'hex' && (
              <motion.div
                key="hex"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <HexViewer 
                  fileBuffer={fileBuffer}
                  fileInfo={fileInfo}
                  searchQuery={searchQuery}
                  searchTrigger={searchTrigger}
                  searchDirection={searchDirection}
                  onSearchMeta={handleSearchMetaChange}
                  addLog={addLog}
                />
              </motion.div>
            )}

            {activeTab === 'analyzer' && (
              <motion.div
                key="analyzer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <FrameAnalyzer 
                  fileBuffer={fileBuffer}
                  fileInfo={fileInfo}
                  baseTimeStr={baseTimeStr}
                  searchQuery={searchQuery}
                  searchTrigger={searchTrigger}
                  searchDirection={searchDirection}
                  onSearchMeta={handleSearchMetaChange}
                  addLog={addLog}
                />
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                <StatsDashboard 
                  fileBuffer={fileBuffer}
                  fileInfo={fileInfo}
                  frameIntervalMs={frameIntervalMs}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Operation logs section (mimicking terminal status area) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              运行控制日志 (QTextDisplay Logging)
            </h3>
            
            <button
              onClick={clearLogs}
              title="清空运行日志"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
              清空日志
            </button>
          </div>

          <div className="h-28 bg-slate-950 text-slate-300 rounded-xl p-3 font-mono text-xs overflow-y-auto space-y-1 select-text shadow-inner">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2.5">
                <span className="text-slate-500">[{log.timestamp}]</span>
                <span className={
                  log.type === 'error' 
                    ? 'text-red-400' 
                    : log.type === 'success' 
                      ? 'text-emerald-400 font-medium' 
                      : 'text-slate-300'
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-500 text-center py-4 text-[10px] font-mono">
        <p>© 2026 BCDInsertTool - BCD时标插入引擎. All telemetry formats comply with Rocket Aerospace Specifications.</p>
      </footer>
    </div>
  );
}
