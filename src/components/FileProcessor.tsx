import { useState, useRef, useEffect } from 'react';
import { Upload, FileCode2, Download, Settings2, Play, Calendar } from 'lucide-react';
import { FrameFileInfo } from '../types';
import { PRECONFIGURED_ROCKETS } from '../data/rockets';
import { processBcdInsertion } from '../utils/bcd';

interface FileProcessorProps {
  onFileLoaded: (file: File, buffer: ArrayBuffer, info: FrameFileInfo) => void;
  onProcessed: (processedBuffer: ArrayBuffer, outputFileName: string, info: FrameFileInfo) => void;
  addLog: (msg: string, type?: 'info' | 'error' | 'success') => void;
  onParamsChange?: (baseTime: string, intervalMs: number) => void;
}

export default function FileProcessor({ onFileLoaded, onProcessed, addLog, onParamsChange }: FileProcessorProps) {
  const [selectedRocket, setSelectedRocket] = useState<string>(PRECONFIGURED_ROCKETS[0].name);
  
  // Parameter form states
  const [childLen, setChildLen] = useState<number>(PRECONFIGURED_ROCKETS[0].childLen);
  const [viceLen, setViceLen] = useState<number>(PRECONFIGURED_ROCKETS[0].viceLen);
  const [frameInterval, setFrameInterval] = useState<number>(PRECONFIGURED_ROCKETS[0].frameIntervalMs);
  const [baseTime, setBaseTime] = useState<string>(PRECONFIGURED_ROCKETS[0].baseTime);
  const [lead8, setLead8] = useState<boolean>(false);
  const [padTail, setPadTail] = useState<boolean>(false);
  
  // File states
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [fileInfo, setFileInfo] = useState<FrameFileInfo | null>(null);
  
  // Output states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [processedBuffer, setProcessedBuffer] = useState<ArrayBuffer | null>(null);
  const [outputName, setOutputName] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Sync initial parameters to parent
  useEffect(() => {
    onParamsChange?.(baseTime, frameInterval);
  }, []);

  // Trigger when rocket preset changes
  const handleRocketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rName = e.target.value;
    setSelectedRocket(rName);
    const preset = PRECONFIGURED_ROCKETS.find(r => r.name === rName);
    if (preset) {
      setChildLen(preset.childLen);
      setViceLen(preset.viceLen);
      setFrameInterval(preset.frameIntervalMs);
      setBaseTime(preset.baseTime);
      onParamsChange?.(preset.baseTime, preset.frameIntervalMs);
      addLog(`已切换预设火箭型号为 [${preset.name}]，参数已重置。`, 'info');
      
      // Recalculate file info if file is loaded
      if (fileBuffer) {
        updateFileInfo(fileBuffer, preset.childLen, preset.viceLen, lead8);
      }
    }
  };

  const updateFileInfo = (buffer: ArrayBuffer, cLen: number, vLen: number, isLead8: boolean) => {
    const lBytes = isLead8 ? 8 : 0;
    const fullFrameLen = lBytes + cLen * vLen;
    const size = buffer.byteLength;
    const totalFrames = fullFrameLen > 0 ? Math.floor(size / fullFrameLen) : 0;
    
    const info: FrameFileInfo = {
      childLen: cLen,
      viceLen: vLen,
      leadBytes: lBytes,
      fullFrameLen,
      fileSize: size,
      totalFrames
    };
    setFileInfo(info);
    return info;
  };

  // Process selected file
  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    addLog(`载入原码文件: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(3)} MB)`, 'info');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      setFileBuffer(buffer);
      setProcessedBuffer(null);
      setOutputName(`add_bcd_${selectedFile.name}`);
      
      const info = updateFileInfo(buffer, childLen, viceLen, lead8);
      onFileLoaded(selectedFile, buffer, info);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Parameter adjustments recalculate info
  const handleParamChange = (
    type: 'childLen' | 'viceLen' | 'lead8' | 'interval' | 'baseTime',
    val: any
  ) => {
    let nextChildLen = childLen;
    let nextViceLen = viceLen;
    let nextLead8 = lead8;
    let nextInterval = frameInterval;
    let nextBaseTime = baseTime;

    if (type === 'childLen') {
      nextChildLen = parseInt(val) || 0;
      setChildLen(nextChildLen);
    } else if (type === 'viceLen') {
      nextViceLen = parseInt(val) || 0;
      setViceLen(nextViceLen);
    } else if (type === 'lead8') {
      nextLead8 = !!val;
      setLead8(nextLead8);
    } else if (type === 'interval') {
      nextInterval = parseFloat(val) || 0;
      setFrameInterval(nextInterval);
    } else if (type === 'baseTime') {
      nextBaseTime = val;
      setBaseTime(nextBaseTime);
    }

    onParamsChange?.(nextBaseTime, nextInterval);

    if (fileBuffer) {
      updateFileInfo(fileBuffer, nextChildLen, nextViceLen, nextLead8);
    }
  };

  // Execute BCD Insertion
  const handleRun = () => {
    if (!fileBuffer || !file) {
      addLog("错误: 请先选择输入文件！", "error");
      return;
    }

    if (childLen <= 0 || viceLen <= 0 || frameInterval <= 0) {
      addLog("错误: 帧配置参数（子帧长度、副帧数量、周期）必须大于 0", "error");
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      addLog(`开始处理文件 [${file.name}]...`, 'info');
      addLog(`配置: 子帧长度=${childLen}B, 副帧数=${viceLen}, 前置=${lead8 ? '8' : '0'}字节, 基准时间=${baseTime}, 周期=${frameInterval}ms`, 'info');

      // Small timeout to let UI show progress bar
      setTimeout(() => {
        try {
          const { outputBuffer, totalFrames, tailBytes } = processBcdInsertion(
            fileBuffer,
            lead8 ? 8 : 0,
            childLen,
            viceLen,
            baseTime,
            frameInterval,
            padTail,
            (pct) => setProgress(pct)
          );

          setProcessedBuffer(outputBuffer);
          setIsProcessing(false);
          addLog(`完成！成功在 ${totalFrames} 帧中插入 BCD 时标。`, 'success');
          if (tailBytes > 0) {
            addLog(`警告: 输入尾部有 ${tailBytes} 字节残余。${padTail ? '已在尾部填充0以满足整帧。' : '未填充，已舍弃。'}`, 'error');
          }

          // Recalculate output info: the subframe length is now (8 + childLen)
          // No lead8 on output? In C++ Qt: BcdWorker: "outSubFrameLen = 8 + childLen"
          // So output full frame length is (8 + childLen) * viceLen
          const outInfo: FrameFileInfo = {
            childLen: 8 + childLen,
            viceLen: viceLen,
            leadBytes: 0, // In C++ output file, it doesn't preserve lead8, each subframe has its 8-byte BCD and is of length childLen + 8
            fullFrameLen: (8 + childLen) * viceLen,
            fileSize: outputBuffer.byteLength,
            totalFrames: totalFrames
          };

          onProcessed(outputBuffer, outputName, outInfo);
        } catch (err: any) {
          setIsProcessing(false);
          addLog(`处理失败: ${err.message}`, 'error');
        }
      }, 50);

    } catch (err: any) {
      setIsProcessing(false);
      addLog(`无法处理: ${err.message}`, 'error');
    }
  };

  const triggerDownload = () => {
    if (!processedBuffer) return;
    const blob = new Blob([processedBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`保存处理后文件: ${outputName}`, 'success');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="file-processor-root">
      {/* File Upload Zone */}
      <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between min-h-[350px]">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <Upload className="w-4 h-4 text-slate-500" />
            遥测原码输入
          </h3>
          
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[180px] ${
              dragActive 
                ? 'border-slate-800 bg-slate-50/50 scale-[0.99]' 
                : file 
                  ? 'border-emerald-200 bg-emerald-50/10 hover:border-emerald-300' 
                  : 'border-slate-200 bg-slate-50/30 hover:border-slate-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <>
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-full mb-3">
                  <FileCode2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-800 max-w-[200px] truncate">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(3)} MB</p>
              </>
            ) : (
              <>
                <div className="p-3 bg-slate-100 text-slate-500 rounded-full mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-700">拖拽文件到此处，或点击浏览</p>
                <p className="text-xs text-slate-400 mt-1">支持任何火箭遥测原始二进制文件 (*.dat, *.bin, *)</p>
              </>
            )}
          </div>
        </div>

        {fileInfo && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span>单帧总长 (Full Frame):</span>
              <span className="font-semibold text-slate-700">{fileInfo.fullFrameLen} B</span>
            </div>
            <div className="flex justify-between">
              <span>原始整帧数 (Total Frames):</span>
              <span className="font-semibold text-slate-700">{fileInfo.totalFrames}</span>
            </div>
            <div className="flex justify-between">
              <span>尾部残留 (Tail Bytes):</span>
              <span className={`font-semibold ${fileInfo.fileSize % fileInfo.fullFrameLen > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                {fileInfo.fileSize % fileInfo.fullFrameLen} B
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Parameter Configuration Panel */}
      <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-500" />
              时标插入配置参数
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>火箭型号预设:</span>
              <select
                value={selectedRocket}
                onChange={handleRocketChange}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-0.5 font-medium text-slate-700 focus:outline-hidden focus:border-slate-400"
              >
                {PRECONFIGURED_ROCKETS.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Child Frame Length */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                子帧有效长度 (childLen, 字节)
                <span className="text-amber-500 ml-1" title="不含8字节BCD时码部分">ⓘ</span>
              </label>
              <input
                type="number"
                value={childLen}
                onChange={(e) => handleParamChange('childLen', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-hidden focus:border-slate-800"
              />
            </div>

            {/* Vice Frame Count */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                全帧包含子帧数 (viceLen)
              </label>
              <input
                type="number"
                value={viceLen}
                onChange={(e) => handleParamChange('viceLen', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-hidden focus:border-slate-800"
              />
            </div>

            {/* Base Time */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                基准时间 (0帧最后子帧时间)
              </label>
              <input
                type="text"
                value={baseTime}
                onChange={(e) => handleParamChange('baseTime', e.target.value)}
                placeholder="YYYY-MM-DD HH:mm:ss.zzz"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-hidden focus:border-slate-800"
              />
            </div>

            {/* Frame Period */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                全帧周期 (毫秒, ms)
              </label>
              <input
                type="number"
                step="0.1"
                value={frameInterval}
                onChange={(e) => handleParamChange('interval', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-hidden focus:border-slate-800"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="flex items-center gap-2 bg-slate-50/50 border border-slate-100 rounded-lg p-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={lead8}
                onChange={(e) => handleParamChange('lead8', e.target.checked)}
                className="rounded border-slate-300 text-slate-800 focus:ring-slate-800"
              />
              <div className="text-left">
                <p className="text-xs font-medium text-slate-700">全帧前置带8字节 (lead8)</p>
                <p className="text-[10px] text-slate-400">勾选表示原始全帧前有8字节前缀（如JD数据）</p>
              </div>
            </label>

            <label className="flex items-center gap-2 bg-slate-50/50 border border-slate-100 rounded-lg p-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={padTail}
                onChange={(e) => setPadTail(e.target.checked)}
                className="rounded border-slate-300 text-slate-800 focus:ring-slate-800"
              />
              <div className="text-left">
                <p className="text-xs font-medium text-slate-700">自动填充不满帧的尾部 (pad-tail)</p>
                <p className="text-[10px] text-slate-400">如果尾部不满足完整全帧，自动补 0 并按子帧处理</p>
              </div>
            </label>
          </div>
        </div>

        {/* Action Button & Progress */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:flex-1 max-w-sm">
            {isProcessing && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-slate-600">
                  <span>时标插入处理中...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-slate-800 h-full rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            
            {processedBuffer && !isProcessing && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                <span>已生成 BCD 时标文件: {outputName}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            {processedBuffer && (
              <button
                type="button"
                onClick={triggerDownload}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm transition-all duration-150"
              >
                <Download className="w-4 h-4" />
                下载结果文件
              </button>
            )}

            <button
              type="button"
              disabled={!fileBuffer || isProcessing}
              onClick={handleRun}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 font-medium rounded-xl text-sm transition-all duration-150 ${
                !fileBuffer || isProcessing
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
              }`}
            >
              <Play className="w-4 h-4" />
              {isProcessing ? '正在处理...' : '插入时标 (运行)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
