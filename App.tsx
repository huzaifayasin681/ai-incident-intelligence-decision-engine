
import React, { useState, useEffect, useRef } from 'react';
import { analyzeIncident, streamIncidentAnalysis, generateSimulation, generateBriefingAudio } from './services/geminiService';
import { IncidentReport, SeverityColor, GroundingChunk } from './types';
import { NeoCard } from './components/NeoCard';
import { NeoButton } from './components/NeoButton';
import { useLiveVoice } from './hooks/useLiveVoice';

const App: React.FC = () => {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [simulationUrl, setSimulationUrl] = useState<string | null>(null);
  const [budget, setBudget] = useState(24576);
  const [file, setFile] = useState<File | null>(null);
  const [liveThinking, setLiveThinking] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [toolActions, setToolActions] = useState<any[]>([]);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  
  const selectedReport = reports.find(r => r.id === selectedReportId);
  const terminalRef = useRef<HTMLDivElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const debriefAudioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setNeedsApiKey(!hasKey);
      }
    };
    checkKey();
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      );
    }
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [liveThinking]);

  const { isActive: isVoiceActive, isPaused: isVoicePaused, togglePause: toggleVoicePause, start: startVoice, stop: stopVoice } = useLiveVoice((text, type) => {
    if (type === 'model') {
      const cleanText = text.replace(/[*#_`]/g, '');
      setLiveThinking(prev => prev + "\n[COMMS]: " + cleanText);
    }
  });

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setNeedsApiKey(false);
    }
  };

  const handleSimulate = async () => {
    if (!selectedReport) return;
    setIsSimulating(true);
    setSimulationUrl(null);
    try {
      const url = await generateSimulation(selectedReport.analysis.root_cause_analysis);
      setSimulationUrl(url);
    } catch (e: any) {
      console.error(e);
      if (e.message.includes("403") || e.message.includes("permission") || e.message.includes("entity was not found")) {
        setNeedsApiKey(true);
      } else {
        alert("Simulation failed: " + e.message);
      }
    } finally {
      setIsSimulating(false);
    }
  };

  const handleToggleAudioPause = async () => {
    if (!debriefAudioContextRef.current) return;
    if (isAudioPaused) {
      await debriefAudioContextRef.current.resume();
      setIsAudioPaused(false);
    } else {
      await debriefAudioContextRef.current.suspend();
      setIsAudioPaused(true);
    }
  };

  const handlePlayDebrief = async () => {
    if (!selectedReport) return;
    setIsGeneratingAudio(true);
    setIsAudioPaused(false);
    try {
      const b64 = await generateBriefingAudio(selectedReport.analysis);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      
      // Close existing context if any
      if (debriefAudioContextRef.current) {
        await debriefAudioContextRef.current.close();
      }

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      debriefAudioContextRef.current = ctx;

      const buffer = ctx.createBuffer(1, bytes.length / 2, 24000);
      const data = new Int16Array(bytes.buffer);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) channel[i] = data[i] / 32768.0;
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (debriefAudioContextRef.current === ctx) setIsAudioPaused(false);
      };
      source.start();
    } catch (e: any) {
      console.error(e);
      alert("Debrief failed: " + e.message);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim() && !file) return;
    setIsAnalyzing(true);
    setLiveThinking('');
    setToolActions([]);
    
    try {
      let b64 = undefined, mimeType = undefined, mediaUrl = undefined;
      if (file) {
        const reader = new FileReader();
        b64 = await new Promise<string>((res) => {
          reader.onload = () => res((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        mimeType = file.type;
        mediaUrl = URL.createObjectURL(file);
      }

      const streamer = streamIncidentAnalysis(inputText || "Deep Forensics");
      const streamPromise = (async () => {
        for await (const chunk of streamer) {
          const cleanChunk = chunk.replace(/[*#_`]/g, '');
          setLiveThinking(p => p + cleanChunk);
        }
      })();

      const { analysis, grounding, toolCalls } = await analyzeIncident(
        inputText, b64, mimeType, location ? { latitude: location.lat, longitude: location.lng } : undefined, budget
      );
      
      setToolActions(toolCalls);
      await streamPromise;

      const newReport: IncidentReport = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        raw_input: inputText,
        analysis,
        media_url: mediaUrl,
        media_type: mimeType,
        grounding_sources: grounding
      };

      setReports(prev => [newReport, ...prev]);
      setSelectedReportId(newReport.id);
      setInputText('');
      setFile(null);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (needsApiKey) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <NeoCard title="API KEY RE-AUTHORIZATION" bgColor="bg-pink-300" className="max-w-md text-center">
          <p className="font-black mb-6 uppercase">A paid API key is required for Video and TTS. Your current key lacks sufficient permissions.</p>
          <div className="text-xs mb-8 space-y-2">
            <p>Select a key from a billing-enabled GCP project.</p>
            <p>Docs: <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline font-bold">ai.google.dev/gemini-api/docs/billing</a></p>
          </div>
          <NeoButton onClick={handleOpenKeyDialog} variant="white" className="w-full">Select API Key</NeoButton>
        </NeoCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-4 lg:p-12 text-black font-['Public_Sans']">
      <header className="mb-12 flex flex-col xl:flex-row justify-between items-end gap-6 border-b-8 border-black pb-8">
        <div>
          <h1 className="text-6xl lg:text-8xl font-black uppercase leading-none tracking-tighter">
            INTELLIGENCE <br/> <span className="bg-black text-white px-2">COMMANDER</span>
          </h1>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] min-w-[200px]">
            <label className="block text-[10px] font-black mb-1 uppercase">Thinking Budget: {budget}</label>
            <input 
              type="range" min="0" max="24576" step="1024" value={budget} 
              onChange={(e) => setBudget(parseInt(e.target.value))} 
              className="w-full accent-black h-2"
            />
            <div className="flex justify-between text-[8px] font-black mt-1">
              <span>RAPID</span><span>FORENSIC</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {isVoiceActive && (
              <NeoButton 
                onClick={toggleVoicePause} 
                variant={isVoicePaused ? "cyan" : "pink"}
                className="px-4"
              >
                {isVoicePaused ? "▶ RESUME" : "⏸ HOLD"}
              </NeoButton>
            )}
            <NeoButton 
              onClick={isVoiceActive ? stopVoice : () => startVoice(liveVideoRef.current || undefined)} 
              variant={isVoiceActive ? "orange" : "white"}
              className={isVoiceActive && !isVoicePaused ? "animate-pulse" : ""}
            >
              {isVoiceActive ? "⏹ KILL PROBE" : "🎤 OPEN VISUAL PROBE"}
            </NeoButton>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 xl:grid-cols-12 gap-12">
        <div className="xl:col-span-4 space-y-12">
          {isVoiceActive && (
            <NeoCard title="LIVE VISUAL FEED" bgColor="bg-black">
              <div className="relative overflow-hidden border-4 border-white">
                {isVoicePaused && (
                  <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center">
                    <span className="text-white font-black text-2xl tracking-widest animate-pulse uppercase">Signal On Hold</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 pointer-events-none bg-[length:100%_4px,3px_100%] animate-scanlines"></div>
                <video ref={liveVideoRef} autoPlay muted className={`w-full aspect-video grayscale contrast-150 ${isVoicePaused ? 'blur-sm' : ''}`} />
              </div>
            </NeoCard>
          )}

          <NeoCard title="SITUATION INTAKE" bgColor="bg-white">
            <textarea
              className="w-full border-4 border-black p-6 font-black text-lg h-40 focus:outline-none bg-yellow-50"
              placeholder="COMMAND INPUT..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <div className="mt-4 flex flex-col gap-4">
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[10px] font-black uppercase" />
              <NeoButton onClick={handleSubmit} disabled={isAnalyzing} className="w-full py-4 text-2xl">DEPLOY PROBE</NeoButton>
            </div>
          </NeoCard>

          {(isAnalyzing || liveThinking) && (
            <NeoCard title="PATHFINDER TERMINAL" bgColor="bg-black" className="text-cyan-400 relative overflow-hidden">
               <div className="absolute inset-0 bg-[rgba(18,16,16,0.1)] pointer-events-none z-10 animate-pulse"></div>
              <div ref={terminalRef} className="font-mono text-xs h-[250px] overflow-y-auto p-4 leading-relaxed custom-scrollbar whitespace-pre-wrap">
                {isVoicePaused && <div className="text-pink-400 mb-2">[SYSTEM_HOLD] DATA INGESTION SUSPENDED...</div>}
                {liveThinking || "> [SYSTEM] SYNCING_CORES..."}
              </div>
            </NeoCard>
          )}

          {toolActions.length > 0 && (
            <NeoCard title="AUTONOMOUS PROPOSALS" bgColor="bg-green-100">
              <div className="space-y-2">
                {toolActions.map((call, i) => (
                  <div key={i} className="border-2 border-black p-2 bg-white text-[10px] font-black">
                    <span className="text-green-600">[READY]</span> {call.name}: {call.args.action} on {call.args.target}
                  </div>
                ))}
              </div>
            </NeoCard>
          )}
        </div>

        <div className="xl:col-span-8">
          {selectedReport ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <NeoCard title="SEVERITY" bgColor={SeverityColor[selectedReport.analysis.severity]} className="flex items-center justify-center">
                  <span className="text-4xl font-black uppercase italic">{selectedReport.analysis.severity}</span>
                </NeoCard>
                <NeoCard title="RISK" bgColor="bg-white" className="flex items-center justify-center">
                  <span className="text-6xl font-black">{selectedReport.analysis.risk_score}</span>
                </NeoCard>
                <div className="flex flex-col gap-4">
                  <NeoButton onClick={handleSimulate} disabled={isSimulating} variant="cyan" className="h-full">
                    {isSimulating ? "SIMULATING..." : "🎥 SATELLITE SIM"}
                  </NeoButton>
                  <div className="flex gap-2 h-full">
                    <NeoButton 
                      onClick={handlePlayDebrief} 
                      disabled={isGeneratingAudio} 
                      variant="yellow" 
                      className="flex-1"
                    >
                      {isGeneratingAudio ? "..." : "🔊 DEBRIEF"}
                    </NeoButton>
                    {debriefAudioContextRef.current && (
                      <NeoButton onClick={handleToggleAudioPause} variant="pink" className="px-4">
                        {isAudioPaused ? "▶" : "⏸"}
                      </NeoButton>
                    )}
                  </div>
                </div>
              </div>

              {simulationUrl && (
                <NeoCard title="AUTONOMOUS IMPACT SIMULATION" bgColor="bg-black">
                  <video src={simulationUrl} autoPlay loop controls className="w-full border-4 border-white" />
                </NeoCard>
              )}

              <NeoCard title="ROOT CAUSE FORENSICS" bgColor="bg-yellow-50">
                <p className="text-3xl font-black leading-tight uppercase underline decoration-8 decoration-pink-300">
                  {selectedReport.analysis.root_cause_analysis}
                </p>
              </NeoCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <NeoCard title="REMEDIATION PROTOCOL" bgColor="bg-white">
                  <ul className="space-y-4">
                    {selectedReport.analysis.remediation_steps.map((s, i) => (
                      <li key={i} className="flex gap-4 font-black text-xl">
                        <span className="bg-black text-white px-2">0{i+1}</span> {s}
                      </li>
                    ))}
                  </ul>
                </NeoCard>
                <NeoCard title="GROUNDING SOURCES" bgColor="bg-cyan-50">
                  <div className="space-y-4">
                    {selectedReport.grounding_sources?.map((g, i) => (
                      <a key={i} href={g.web?.uri || g.maps?.uri} target="_blank" className="block p-4 border-4 border-black bg-white hover:bg-pink-100 transition-all hover:-translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <div className="text-[10px] font-black uppercase opacity-40">{g.web ? "Web Intelligence" : "Infrastructure Link"}</div>
                        <div className="font-black text-sm underline truncate">{g.web?.title || g.maps?.title}</div>
                      </a>
                    ))}
                  </div>
                </NeoCard>
              </div>

              <NeoCard title="CHAIN OF THOUGHT" bgColor="bg-neutral-900" className="text-white">
                <div className="font-mono text-xs leading-loose opacity-70 whitespace-pre-wrap">
                   {selectedReport.analysis.reasoning_artifacts.replace(/[*#_`]/g, '')}
                </div>
              </NeoCard>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border-8 border-black border-dashed opacity-20 py-40">
              <span className="text-[200px]">📡</span>
              <h2 className="text-4xl font-black uppercase">Sector Scanning...</h2>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: black; border: 2px solid transparent; }
        
        @keyframes scanlines {
          from { background-position: 0 0; }
          to { background-position: 0 100%; }
        }
        .animate-scanlines {
          animation: scanlines 10s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
