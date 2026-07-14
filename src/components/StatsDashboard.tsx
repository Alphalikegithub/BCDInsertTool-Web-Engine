import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { BarChart3, Database, FileDigit, Cpu, Clock } from 'lucide-react';
import { FrameFileInfo } from '../types';

interface StatsDashboardProps {
  fileBuffer: ArrayBuffer | null;
  fileInfo: FrameFileInfo | null;
  frameIntervalMs: number;
}

export default function StatsDashboard({
  fileBuffer,
  fileInfo,
  frameIntervalMs
}: StatsDashboardProps) {
  
  // Calculate byte frequency distribution of first 64KB to maintain fast performance
  const byteFrequencyData = useMemo(() => {
    if (!fileBuffer) return [];
    
    const bytes = new Uint8Array(fileBuffer);
    const sampleSize = Math.min(65536, bytes.length); // 64KB sample
    
    // Group bytes into 16 bins (0-15, 16-31, ... 240-255)
    const bins = Array(16).fill(0);
    for (let i = 0; i < sampleSize; i++) {
      const byte = bytes[i];
      const binIdx = Math.floor(byte / 16);
      bins[binIdx]++;
    }

    const labels = [
      '00-0F', '10-1F', '20-2F', '30-3F', '40-4F', '50-5F', '60-6F', '70-7F',
      '80-8F', '90-9F', 'A0-AF', 'B0-BF', 'C0-CF', 'D0-DF', 'E0-EF', 'F0-FF'
    ];

    return labels.map((label, idx) => ({
      name: label,
      频率: bins[idx],
      百分比: parseFloat(((bins[idx] / sampleSize) * 100).toFixed(2))
    }));
  }, [fileBuffer]);

  // Subframe timestamp timeline progression simulation
  const timeProgressData = useMemo(() => {
    if (!fileInfo) return [];

    const totalToShow = Math.min(10, fileInfo.totalFrames);
    const data = [];
    const viceLen = fileInfo.viceLen;

    for (let n = 0; n < totalToShow; n++) {
      const frameLastTimeMs = n * frameIntervalMs;
      
      for (let k = 0; k < viceLen; k += Math.max(1, Math.floor(viceLen / 4))) {
        const offsetPct = k / viceLen;
        const subframeTimeMs = frameLastTimeMs - (1 - offsetPct) * frameIntervalMs;
        
        data.push({
          label: `F${n} Sub${k}`,
          相对时间ms: parseFloat(subframeTimeMs.toFixed(3)),
          subframeIndex: k
        });
      }
    }
    return data;
  }, [fileInfo, frameIntervalMs]);

  // Format file size nicely
  const formattedSize = useMemo(() => {
    if (!fileInfo) return '0 B';
    const size = fileInfo.fileSize;
    if (size < 1024) return `${size} Bytes`;
    if (size < 1048576) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / 1048576).toFixed(2)} MB`;
  }, [fileInfo]);

  return (
    <div className="space-y-6" id="stats-dashboard-root">
      {/* Overview stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total File Size */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-700 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">文件总大小</p>
            <p className="text-lg font-bold text-slate-800 font-mono">{formattedSize}</p>
          </div>
        </div>

        {/* Calculated Total Frames */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-700 rounded-lg">
            <FileDigit className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">计算总帧数</p>
            <p className="text-lg font-bold text-slate-800 font-mono">{fileInfo?.totalFrames || 0}</p>
          </div>
        </div>

        {/* Subframe Configuration Block */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-700 rounded-lg">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">单全帧结构 (child*vice)</p>
            <p className="text-lg font-bold text-slate-800 font-mono">
              {fileInfo ? `${fileInfo.childLen}B × ${fileInfo.viceLen}` : '0 × 0'}
            </p>
          </div>
        </div>

        {/* Precision Interval */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-700 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">子帧时标分辨率</p>
            <p className="text-lg font-bold text-slate-800 font-mono">
              {fileInfo && fileInfo.viceLen > 0 
                ? `${(frameIntervalMs / fileInfo.viceLen).toFixed(4)} ms` 
                : '0.000 ms'}
            </p>
          </div>
        </div>
      </div>

      {fileBuffer ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Byte Frequency Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-800">
                文件字节频度分布 (前 64KB 采样)
              </h4>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byteFrequencyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}
                    itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                  />
                  <Bar dataKey="频率" fill="#475569" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subframe time progress chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-800">
                子帧时标递增曲线 (相对时间, 毫秒)
              </h4>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeProgressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}
                    itemStyle={{ color: '#38bdf8', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="相对时间ms" stroke="#0f172a" strokeWidth={2} dot={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Frame structural diagram */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
            <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <span>全帧逻辑布局示意图 (Logical Frame Structure)</span>
            </h4>
            <p className="text-xs text-slate-500 mb-5">
              在时标插入之后，原码文件原有的全帧结构会被重新整理，并在每子帧前添加 8 字节 BCD。
            </p>

            <div className="space-y-4 font-mono text-xs text-slate-600">
              {/* Processed output frame format */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">● 插入时标后的子帧数据包格式 (8B BCD + {fileInfo ? fileInfo.childLen - 8 : 248}B 载荷)</p>
                <div className="flex w-full border border-slate-200 rounded-lg overflow-hidden h-9 text-center leading-9">
                  <div className="w-[12%] bg-blue-500 text-white border-r border-slate-200 font-bold" title="BCD time bits">
                    BCD 时间 (6B)
                  </div>
                  <div className="w-[4%] bg-indigo-500 text-white border-r border-slate-200 font-bold" title="Subframe Index">
                    副ID (1B)
                  </div>
                  <div className="w-[4%] bg-slate-500 text-white border-r border-slate-200 font-bold" title="Reserved byte">
                    保留 (1B)
                  </div>
                  <div className="flex-1 bg-slate-100 text-slate-700 font-medium">
                    原始数据子帧负载 (childLen - 8 字节)
                  </div>
                </div>
              </div>

              {/* Total full frame assembly */}
              <div className="pt-2">
                <p className="text-xs font-semibold text-slate-700 mb-2">● 处理后的完整全帧结构 (包含 {fileInfo?.viceLen || 64} 个上述子帧数据包拼合，不含 lead8)</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {Array.from({ length: Math.min(8, fileInfo?.viceLen || 6) }).map((_, idx) => (
                    <div key={idx} className="flex border border-slate-300 rounded-md p-1 bg-slate-50 gap-1 select-none">
                      <span className="bg-sky-600 text-white px-1 py-0.5 rounded text-[10px]">BCD</span>
                      <span className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">子帧#{idx}负载</span>
                    </div>
                  ))}
                  {(fileInfo?.viceLen || 64) > 8 && (
                    <div className="flex items-center text-slate-400 font-semibold px-2 text-sm">
                      ... 共 {fileInfo?.viceLen || 64} 个子帧 ...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
          <BarChart3 className="w-8 h-8 text-slate-300 animate-pulse" />
          <span className="font-medium text-slate-700">暂无统计数据</span>
          <span className="text-xs text-slate-400">请在上方载入遥测原码二进制文件，处理或浏览后可查看结构与频度统计图。</span>
        </div>
      )}
    </div>
  );
}
