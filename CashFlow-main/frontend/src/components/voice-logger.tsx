import { useState, useEffect, useRef } from "react";
import { Mic, Square, X, AlertCircle } from "lucide-react";
import { trackVoiceExpenses } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface VoiceLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (transcript: string, expenses: any[]) => void;
}

export function VoiceLoggerModal({ isOpen, onClose, onSuccess }: VoiceLoggerModalProps) {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      startRecording();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setRecording(false);
    setSeconds(0);
    setError(null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not supported by your browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cleanup();
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: "audio/webm" });
        setLoading(true);
        try {
          const res = await trackVoiceExpenses(blob);
          onSuccess(res.transcript, res.expenses);
          queryClient.invalidateQueries();
          onClose();
        } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to parse voice expense.");
        } finally {
          setLoading(false);
        }
      };

      setMediaRecorder(recorder);
      recorder.start();
      setRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 25) {
            recorder.stop();
            return 25;
          }
          return s + 1;
        });
      }, 1000);

    } catch (err) {
      console.error(err);
      setError("Microphone access was denied. Please check site permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-[32px] border border-slate-100 bg-white p-6 shadow-2xl animate-scale-in">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center mt-4">
          <p className="font-display text-lg font-bold text-slate-800">AI Voice Ledger</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[80%]">
            Speak naturally: "Spent 250 rupees on lunch and 1500 for taxi today."
          </p>

          <div className="my-8 flex h-24 w-24 items-center justify-center rounded-full bg-rose-50/50">
            {recording ? (
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white animate-pulse">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping"></span>
                <Mic className="h-6 w-6 relative z-10" />
              </div>
            ) : loading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Mic className="h-6 w-6" />
              </div>
            )}
          </div>

          {recording && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-rose-600 animate-pulse">Listening...</p>
              <p className="font-mono text-2xl font-bold text-slate-800">
                00:{String(seconds).padStart(2, "0")} <span className="text-xs text-slate-400">/ 00:25</span>
              </p>
              <button 
                onClick={stopRecording}
                className="mt-2 inline-flex items-center space-x-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <Square className="h-3.5 w-3.5 fill-white" />
                <span>Stop Recording</span>
              </button>
            </div>
          )}

          {loading && (
            <div className="space-y-1">
              <p className="text-sm font-bold text-emerald-600 animate-pulse">Processing ledger items...</p>
              <p className="text-xs text-slate-400">Running speech-to-text and AI extraction</p>
            </div>
          )}

          {error && (
            <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/60 p-3 text-left text-xs text-rose-700 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
