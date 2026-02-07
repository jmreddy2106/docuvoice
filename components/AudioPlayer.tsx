import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, FastForward, RotateCcw } from 'lucide-react';
import { PLAYBACK_SPEEDS } from '../constants';

interface AudioPlayerLabels {
  title: string;
  restart: string;
  play: string;
  pause: string;
  speed: string;
  statusPlaying: string;
  statusIdle: string;
}

interface AudioPlayerProps {
  audioBuffer: AudioBuffer | null;
  labels: AudioPlayerLabels;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioBuffer, labels }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [progress, setProgress] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  // Initialize AudioContext
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
      stopAudio();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPlaying(false);
  };

  const updateProgress = useCallback(() => {
    if (!audioContextRef.current || !isPlaying || !audioBuffer) return;

    const currentTime = audioContextRef.current.currentTime;
    // Calculate elapsed time taking speed into account roughly for visualization
    // A more precise way is needed for exact seeking, but for linear playback:
    const elapsed = (currentTime - startTimeRef.current) * playbackSpeed; 
    // Wait, AudioContext time moves forward constantly. 
    // Correct logic: The source plays at a rate.
    
    // We actually need to track how much of the buffer has played.
    // However, since we don't support scrubbing in this simple implementation, 
    // checking context time relative to start is easiest.
    
    // Simplification for this demo:
    // Just loop and check if it's done.
    
    animationFrameRef.current = requestAnimationFrame(updateProgress);
  }, [isPlaying, audioBuffer, playbackSpeed]);


  const playAudio = async () => {
    if (!audioBuffer || !audioContextRef.current) return;

    // If context is suspended (browser policy), resume it
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // Create a new source node (they are one-time use)
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackSpeed;
    
    source.connect(audioContextRef.current.destination);

    // Calculate start time
    // If we were paused, we need to handle offset. 
    // For simplicity in this version, we restart on play or fully stop on pause/stop 
    // to ensure reliability without complex offset math for the "uneducated" user persona who just wants "Play".
    // Let's implement a simple restart-if-finished logic, or resume from 0 if simpler.
    // Actually, let's try to support Pause/Resume correctly.

    const offset = pauseTimeRef.current % audioBuffer.duration;
    
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime - (offset / playbackSpeed);
    
    sourceNodeRef.current = source;
    setIsPlaying(true);

    source.onended = () => {
       // Only reset if we naturally finished, not if we stopped manually
       // But checking manually is hard. 
       // We'll just listen to the state.
       if (audioContextRef.current && (audioContextRef.current.currentTime - startTimeRef.current) * playbackSpeed >= audioBuffer.duration - 0.1) {
          setIsPlaying(false);
          pauseTimeRef.current = 0;
          setProgress(0);
       }
    };

    updateProgress();
  };

  const pauseAudio = () => {
    if (!sourceNodeRef.current || !audioContextRef.current) return;
    
    const elapsed = (audioContextRef.current.currentTime - startTimeRef.current) * playbackSpeed;
    pauseTimeRef.current = elapsed;
    
    sourceNodeRef.current.stop();
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;
    setIsPlaying(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const resetAudio = () => {
    stopAudio();
    pauseTimeRef.current = 0;
    setProgress(0);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setPlaybackSpeed(newSpeed);
    if (isPlaying && sourceNodeRef.current) {
       // We have to restart the source to change speed dynamically accurately without pitch shift usually,
       // but playbackRate.value changes it immediately (with pitch shift).
       // AudioBufferSourceNode.playbackRate changes both speed and pitch.
       // This is acceptable for "reading speed".
       sourceNodeRef.current.playbackRate.setValueAtTime(newSpeed, audioContextRef.current!.currentTime);
    }
  };

  if (!audioBuffer) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-indigo-100">
      <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <span className="bg-indigo-600 text-white p-1 rounded-full">
           <Play size={16} fill="currentColor" />
        </span>
        {labels.title}
      </h3>
      
      <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
        
        {/* Controls */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-center">
          <button
            onClick={resetAudio}
            className="p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            title={labels.restart}
          >
            <RotateCcw size={24} />
          </button>

          <button
            onClick={togglePlay}
            className={`p-4 rounded-full transition-all transform hover:scale-105 shadow-md ${
              isPlaying 
                ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            title={isPlaying ? labels.pause : labels.play}
          >
            {isPlaying ? (
              <Pause size={32} fill="currentColor" />
            ) : (
              <Play size={32} fill="currentColor" className="ml-1" />
            )}
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-center bg-slate-50 p-2 rounded-lg border border-slate-200">
          <FastForward size={20} className="text-slate-400" />
          <label htmlFor="speed" className="text-sm font-medium text-slate-600">{labels.speed}:</label>
          <select
            id="speed"
            value={playbackSpeed}
            onChange={handleSpeedChange}
            className="bg-transparent font-bold text-indigo-700 focus:outline-none cursor-pointer text-lg"
          >
            {PLAYBACK_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <p className="text-center text-slate-400 text-sm mt-4">
        {isPlaying ? labels.statusPlaying : labels.statusIdle}
      </p>
    </div>
  );
};

export default AudioPlayer;