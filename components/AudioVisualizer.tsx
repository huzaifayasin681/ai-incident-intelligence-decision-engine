
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  color?: string;
  height?: number;
  barWidth?: number;
  gap?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  analyser, 
  color = '#22d3ee', // cyan-400
  height = 40,
  barWidth = 3,
  gap = 2
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;

    const render = () => {
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const bars = Math.floor(canvas.width / (barWidth + gap));
      
      for (let i = 0; i < bars; i++) {
        // Sample frequency data proportionally
        const index = Math.floor((i / bars) * bufferLength * 0.6); 
        const value = dataArray[index];
        const barHeight = (value / 255) * canvas.height;
        
        ctx.fillStyle = color;
        ctx.fillRect(
          i * (barWidth + gap), 
          canvas.height - barHeight, 
          barWidth, 
          barHeight
        );
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [analyser, color, barWidth, gap]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={height} 
      className="w-full h-full block"
    />
  );
};
