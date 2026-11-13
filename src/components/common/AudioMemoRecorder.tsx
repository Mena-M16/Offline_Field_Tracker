import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Pause, Trash2, Volume2 } from 'lucide-react';

interface AudioMemoRecorderProps {
  audioUrl?: string | null;
  onAudioChange: (url: string | null) => void;
}

export const AudioMemoRecorder: React.FC<AudioMemoRecorderProps> = ({
  audioUrl,
  onAudioChange,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Audio recording is not supported in this browser environment.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          onAudioChange(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setErrorMsg('Microphone permission denied or no recording device detected.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current && audioUrl) {
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => setIsPlaying(false);
    }

    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause();
        setIsPlaying(false);
      } else {
        audioPlayerRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const clearAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlaying(false);
    onAudioChange(null);
  };

  return (
    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-amber-500" />
          <span>Field Audio Voice Memo</span>
        </label>
        <span className="text-[10px] text-slate-400 font-mono">Max 60s · Offline Safe</span>
      </div>

      {audioUrl ? (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition-colors shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Audio Note Recorded</p>
              <p className="text-[10px] text-slate-400 font-mono">Saved in local IndexedDB</p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearAudio}
            className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
            title="Delete Voice Note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop ({recordingSeconds}s)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-slate-700 hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                <span>Record Voice Memo</span>
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            {isRecording ? 'Listening...' : 'Optional voice description'}
          </span>
        </div>
      )}

      {errorMsg && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium pt-1">
          {errorMsg}
        </p>
      )}
    </div>
  );
};
