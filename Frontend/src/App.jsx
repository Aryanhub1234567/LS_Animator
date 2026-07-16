import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Image as ImageIcon, Mic, Play, Pause, Maximize, Download, Monitor, Smartphone, Activity } from 'lucide-react';
import StageCanvas from './components/Canvas/StageCanvas';
import useAudioAnalyser from './hooks/useAudioAnalyser';
import './index.css';

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const buildWaveformPeaks = (channelData, barCount) => {
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));
  const peaks = [];
  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const start = barIndex * samplesPerBar;
    const end = Math.min(start + samplesPerBar, channelData.length);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(channelData[sampleIndex]));
    }
    peaks.push(peak);
  }
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((peak) => peak / maxPeak);
};

function App() {
  const audioRef = useRef(null);
  const previewRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const [audioFile, setAudioFile] = useState(null);
  const [rawAudioFile, setRawAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const [characterFile, setCharacterFile] = useState(null);
  const [rawCharacterFile, setRawCharacterFile] = useState(null);
  const [mouthFile, setMouthFile] = useState(null);
  const [rawMouthFile, setRawMouthFile] = useState(null);

  const [threshold, setThreshold] = useState(15);
  const currentVolume = useAudioAnalyser(audioRef);
  const isSpeaking = currentVolume > threshold;

  const [mouthSize, setMouthSize] = useState(160);
  const [canvasFormat, setCanvasFormat] = useState('16:9');
  const canExport = Boolean(rawAudioFile && audioDuration && rawCharacterFile && rawMouthFile);
  const [isExporting, setIsExporting] = useState(false);

  const [mouthPos, setMouthPos] = useState({ x: 170, y: 260 });

  const previewScale = useMemo(() => {
    if (!isFullscreen) return 1;
    const baseWidth = canvasFormat === '16:9' ? 1024 : 450;
    const baseHeight = canvasFormat === '16:9' ? 576 : 800;
    const playerHeight = audioFile ? 140 : 80;
    const availableWidth = Math.max(viewportSize.width - 32, baseWidth);
    const availableHeight = Math.max(viewportSize.height - playerHeight - 32, baseHeight);
    return Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
  }, [audioFile, canvasFormat, isFullscreen, viewportSize]);

  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(URL.createObjectURL(file));
      setRawAudioFile(file);
      setAudioDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setWaveformPeaks([]);
    }
  };

  const handleCharacterUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCharacterFile(URL.createObjectURL(file));
      setRawCharacterFile(file);
    }
  };

  const handleMouthUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMouthFile(URL.createObjectURL(file));
      setRawMouthFile(file);
    }
  };

  const handlePreviewPlayPause = () => {
    const audio = audioRef.current;
    if (!audioFile || !audio) return;
    if (audio.paused) {
      audio.play().catch((err) => console.warn("Playback blocked:", err));
    } else {
      audio.pause();
    }
  };

  const syncCurrentTime = () => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audio) audio.currentTime = nextTime;
  };

  const handleWaveformSeek = (e) => {
    if (!audioDuration) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (e.clientX - bounds.left) / bounds.width));
    const nextTime = progress * audioDuration;
    setCurrentTime(nextTime);
    if (audioRef.current) audioRef.current.currentTime = nextTime;
  };

  const handleFullscreen = () => {
    const preview = previewRef.current;
    if (!preview) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      preview.requestFullscreen().catch((err) => console.warn("Fullscreen blocked:", err));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === previewRef.current);
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (playbackAnimationRef.current) cancelAnimationFrame(playbackAnimationRef.current);
      syncCurrentTime();
      return;
    }
    const updatePlaybackPosition = () => {
      syncCurrentTime();
      playbackAnimationRef.current = requestAnimationFrame(updatePlaybackPosition);
    };
    playbackAnimationRef.current = requestAnimationFrame(updatePlaybackPosition);
    return () => {
      if (playbackAnimationRef.current) cancelAnimationFrame(playbackAnimationRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!audioFile) return;
    let isCancelled = false;
    const decodeWaveform = async () => {
      try {
        const response = await fetch(audioFile);
        const arrayBuffer = await response.arrayBuffer();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (!isCancelled) {
          setWaveformPeaks(buildWaveformPeaks(audioBuffer.getChannelData(0), 180));
        }
        await audioContext.close();
      } catch (error) {
        console.warn("Waveform generation failed:", error);
        if (!isCancelled) setWaveformPeaks([]);
      }
    };
    decodeWaveform();
    return () => { isCancelled = true; };
  }, [audioFile]);

  const handleExport = async () => {
    if (!canExport) return;
    setIsExporting(true);

    try {
      const formData = new FormData();
      formData.append('canvasFormat', canvasFormat);
      formData.append('duration', audioDuration);
      formData.append('mouthSize', mouthSize);
      formData.append('threshold', threshold);
      formData.append('mouthX', mouthPos.x);
      formData.append('mouthY', mouthPos.y);
      formData.append('audio', rawAudioFile);
      formData.append('background', rawCharacterFile);
      formData.append('mouth', rawMouthFile);

      const response = await fetch('http://localhost:3000/api/export', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.status === 'success' && data.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.downloadUrl.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert(data.message || "Export failed.");
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to connect to the server.");
    } finally {
      setIsExporting(false);
    }
  };

  // INCREASED: padding, gap, and base text size
  const sharedInputClasses = "flex items-center gap-4 py-4 px-5 bg-slate-900 text-slate-50 border border-slate-700 rounded-md cursor-pointer text-base transition-colors hover:border-slate-600";

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-50 font-sans m-0 p-0 overflow-hidden">

      {/* LEFT SIDEBAR - Increased width slightly to accommodate larger text */}
      <div className="w-[340px] min-w-[340px] bg-slate-800 border-r border-slate-700 p-8 flex flex-col">

        <div className="flex items-center gap-3 mb-10">
          <div className="bg-blue-500 p-2.5 rounded-lg">
            <Activity size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-wide">Lip-Sync Editor</h1>
        </div>

        <div className="flex flex-col gap-8 flex-1 overflow-y-auto">

          {/* Settings Section */}
          <div className="flex flex-col gap-6">
            {/* INCREASED: Header text size and icon */}
            <div className="flex items-center gap-2.5 text-slate-400 text-base uppercase font-semibold tracking-wider">
              <Settings size={18} /> Controls
            </div>

            <div>
              {/* INCREASED: Label text size */}
              <div className="flex justify-between mb-2 text-base">
                <label>Audio Sensitivity</label>
                <span className="text-blue-500 font-medium">{threshold}</span>
              </div>
              <input
                type="range" min="1" max="100"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2 text-base">
                <label>Mouth Scale</label>
                <span className="text-blue-500 font-medium">{mouthSize}px</span>
              </div>
              <input
                type="range" min="50" max="600"
                value={mouthSize}
                onChange={(e) => setMouthSize(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          <hr className="border-t border-slate-700 m-0" />

          {/* Assets Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 text-slate-400 text-base uppercase font-semibold tracking-wider">
              <ImageIcon size={18} /> Assets
            </div>

            <label className={sharedInputClasses}>
              {/* INCREASED: Icon size */}
              <ImageIcon size={24} className="text-blue-500 flex-shrink-0" />
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium">Character Body</span>
                {/* INCREASED: Subtitle text size */}
                <span className="text-slate-400 text-sm truncate">
                  {rawCharacterFile ? rawCharacterFile.name : 'No file selected'}
                </span>
              </div>
              <input type="file" accept="image/*" onChange={handleCharacterUpload} className="hidden" />
            </label>

            <label className={sharedInputClasses}>
              <Mic size={24} className="text-blue-500 flex-shrink-0" />
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium">Mouth Animation</span>
                <span className="text-slate-400 text-sm truncate">
                  {rawMouthFile ? rawMouthFile.name : 'No file selected'}
                </span>
              </div>
              <input type="file" accept="video/*,image/*" onChange={handleMouthUpload} className="hidden" />
            </label>
          </div>

          {audioFile && (
            <div className="mt-auto p-5 bg-slate-900 border border-slate-700 rounded-md flex items-center justify-between">
              <span className="text-slate-400 text-base">Input Level</span>
              <div className={`text-2xl font-bold transition-colors duration-100 ${isSpeaking ? 'text-emerald-500' : 'text-slate-50'}`}>
                {Math.round(currentVolume)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 flex flex-col">

        {/* TOP TOOLBAR */}
        <div className="h-[76px] bg-slate-800 border-b border-slate-700 px-8 flex justify-between items-center">

          <div className="flex items-center gap-6 flex-1">
            <label className={`${sharedInputClasses} min-w-[320px] bg-slate-800 !py-2.5`}>
              <Mic size={20} className="text-emerald-500 flex-shrink-0" />
              <span className="font-medium mr-2">Voiceover:</span>
              <span className="text-slate-400 text-base truncate flex-1">
                {rawAudioFile ? rawAudioFile.name : 'Import audio...'}
              </span>
              <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
            </label>

            <audio
              ref={audioRef}
              src={audioFile || ''}
              crossOrigin="anonymous"
              className="hidden"
              onLoadedMetadata={(e) => { setAudioDuration(e.target.duration); setCurrentTime(0); }}
              onPlay={() => setIsPlaying(true)}
              onPause={(e) => { setIsPlaying(false); setCurrentTime(e.target.currentTime); }}
              onEnded={(e) => { setIsPlaying(false); setCurrentTime(e.target.duration); }}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-900 rounded-md p-1 border border-slate-700">
              <button
                onClick={() => setCanvasFormat('16:9')}
                className={`py-2 px-3 flex items-center gap-2 rounded text-sm font-medium transition-colors ${canvasFormat === '16:9' ? 'bg-slate-700 text-slate-50' : 'bg-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Monitor size={16} /> 16:9
              </button>
              <button
                onClick={() => setCanvasFormat('9:16')}
                className={`py-2 px-3 flex items-center gap-2 rounded text-sm font-medium transition-colors ${canvasFormat === '9:16' ? 'bg-slate-700 text-slate-50' : 'bg-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Smartphone size={16} /> 9:16
              </button>
            </div>

            <button
              onClick={handleExport}
              disabled={!canExport || isExporting}
              className={`flex items-center gap-2 py-2.5 px-6 text-[15px] font-semibold rounded-md transition-all ${canExport ? 'bg-blue-500 text-white cursor-pointer hover:bg-blue-600' : 'bg-slate-900 text-slate-400 border border-slate-700 cursor-not-allowed'}`}
            >
              <Download size={18} />
              {isExporting ? 'Processing...' : 'Export MP4'}
            </button>
          </div>
        </div>

        {/* WORKSPACE & CANVAS */}
        <div className="flex-1 bg-slate-900 flex justify-center items-center overflow-hidden p-8">
          <div ref={previewRef} className={`flex flex-col bg-slate-900 overflow-hidden shadow-2xl ${isFullscreen ? 'w-screen h-screen rounded-none border-none' : 'w-auto h-auto rounded-lg border border-slate-700'}`}>

            <div className={`flex justify-center items-center bg-black min-h-0 ${isFullscreen ? 'flex-1 p-4' : 'p-0'}`}>
              <StageCanvas
                isSpeaking={isSpeaking}
                mouthSize={mouthSize}
                canvasFormat={canvasFormat}
                mouthPos={mouthPos}
                setMouthPos={setMouthPos}
                characterSrc={characterFile}
                mouthSrc={mouthFile}
                mouthType={rawMouthFile?.type || ''}
                displayScale={previewScale}
              />
            </div>

            {/* TIMELINE / PLAYER */}
            <div className="min-h-[80px] bg-slate-800 border-t border-slate-700 px-6 grid grid-cols-[100px_1fr_100px] gap-6 items-center">

              <div className="text-slate-400 text-sm font-medium tabular-nums">
                <span className="text-slate-50">{formatTime(currentTime)}</span>
                <span className="mx-1 opacity-50">/</span>
                <span>{formatTime(audioDuration)}</span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handlePreviewPlayPause}
                  disabled={!audioFile}
                  className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${audioFile ? 'bg-blue-500 text-white cursor-pointer hover:bg-blue-600' : 'bg-slate-900 text-slate-400 border border-slate-700 cursor-not-allowed'}`}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                </button>

                <input
                  type="range" min="0" max={audioDuration || 0} step="0.01"
                  value={Math.min(currentTime, audioDuration || 0)}
                  onChange={handleSeek} disabled={!audioFile}
                  className={`flex-1 accent-blue-500 ${audioFile ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                />
              </div>

              <button type="button" onClick={handleFullscreen} className="justify-self-end flex items-center gap-2 p-2 bg-transparent text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
                <Maximize size={20} />
              </button>
            </div>

            {/* WAVEFORM */}
            {audioFile && (
              <div className="h-[70px] bg-slate-900 border-t border-slate-700 py-3 px-6">
                <div onClick={handleWaveformSeek} className="relative h-[46px] flex items-center gap-[2px] cursor-pointer overflow-hidden">

                  {waveformPeaks.length > 0 ? (
                    waveformPeaks.map((peak, index) => (
                      <div
                        key={`${index}-${peak.toFixed(3)}`}
                        className={`flex-1 rounded-[2px] opacity-80 ${peak > 0.74 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ height: `${Math.max(4, peak * 40)}px` }}
                      />
                    ))
                  ) : (
                    <div className="text-slate-400 text-sm">Processing waveform...</div>
                  )}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                    style={{ left: `${audioDuration ? (currentTime / audioDuration) * 100 : 0}%` }}
                  />

                  {/* Threshold Line */}
                  <div
                    className="absolute left-0 right-0 h-[2px] bg-amber-500 shadow-[0_0_8px_#f59e0b] z-10 pointer-events-none transition-all duration-100"
                    style={{ top: `${100 - threshold}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
