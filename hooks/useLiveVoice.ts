
import { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';

export const useLiveVoice = (onTranscript: (text: string, type: 'user' | 'model') => void) => {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  const togglePause = useCallback(() => {
    const newState = !isPausedRef.current;
    isPausedRef.current = newState;
    setIsPaused(newState);
  }, []);

  const stop = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setIsActive(false);
    setIsPaused(false);
    isPausedRef.current = false;
  }, []);

  const start = useCallback(async (videoElement?: HTMLVideoElement) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    setIsActive(true);
    setIsPaused(false);
    isPausedRef.current = false;

    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!videoElement });
    streamRef.current = stream;
    if (videoElement) videoElement.srcObject = stream;

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            // Do not send audio if paused
            if (isPausedRef.current) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) pcm[i] = inputData[i] * 32768;
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
            sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);

          if (videoElement) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            frameIntervalRef.current = window.setInterval(() => {
              // Do not send frames if paused
              if (isPausedRef.current) return;

              canvas.width = videoElement.videoWidth / 4;
              canvas.height = videoElement.videoHeight / 4;
              ctx?.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
              const b64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: b64, mimeType: 'image/jpeg' } }));
            }, 1000);
          }
        },
        onmessage: async (msg) => {
          if (msg.serverContent?.inputTranscription) onTranscript(msg.serverContent.inputTranscription.text, 'user');
          if (msg.serverContent?.outputTranscription) onTranscript(msg.serverContent.outputTranscription.text, 'model');

          const audioB64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioB64) {
            const bytes = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0));
            const dataInt16 = new Int16Array(bytes.buffer);
            const buffer = outputCtx.createBuffer(1, dataInt16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputCtx.destination);
            const startAt = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            source.start(startAt);
            nextStartTimeRef.current = startAt + buffer.duration;
          }
        },
        onerror: (e) => console.error("Live Error", e),
        onclose: () => stop(),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: "You are the Live Intelligence Probe. Analyze frames and audio immediately. When data stops (paused), wait for resumption."
      }
    });

    sessionRef.current = await sessionPromise;
  }, [onTranscript, stop]);

  return { isActive, isPaused, togglePause, start, stop };
};
