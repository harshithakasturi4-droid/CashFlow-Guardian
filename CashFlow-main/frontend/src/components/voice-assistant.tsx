import { MessageCircle, Mic, Send, Volume2, X } from "lucide-react";
import { useState } from "react";
import { dataApi, postAudio } from "../lib/api";

export function VoiceAssistant() {
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Ask me about sales, GST, or today's money picture." }
  ]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const speakWithBrowser = (text: string) => {
    if (!window.speechSynthesis) {
      console.warn("Speech synthesis not supported in this browser.");
      return;
    }
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN"; // English (India) pronunciation

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.includes("en-IN") || v.lang.includes("en-GB") || v.lang.includes("en-US")
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;
    const nextHistory = [...history, { role: "user", content }];
    setHistory(nextHistory);
    setDraft("");
    setLoading(true);
    try {
      const response = await dataApi.voiceChat(nextHistory);
      setHistory([...nextHistory, { role: "assistant", content: response.reply }]);
      speakWithBrowser(response.reply);
    } catch {
      const errorReply = "I could not reach the helper service right now. Please try again in a moment.";
      setHistory([...nextHistory, { role: "assistant", content: errorReply }]);
      speakWithBrowser(errorReply);
    } finally {
      setLoading(false);
    }
  };

  const speakLatest = () => {
    const latest = [...history].reverse().find((item) => item.role === "assistant");
    if (!latest) return;
    speakWithBrowser(latest.content);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Microphone access is not supported by your browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setRecording(false);
        setMediaRecorder(null);
        stream.getTracks().forEach((track) => track.stop());

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: "audio/webm" });
        setLoading(true);
        try {
          const response = await postAudio(blob);
          if (response.text) {
            await sendMessage(response.text);
          } else {
            console.warn("Empty transcription received.");
          }
        } catch (err) {
          console.error("Audio upload/transcription failed:", err);
        } finally {
          setLoading(false);
        }
      };

      setMediaRecorder(recorder);
      recorder.start();

      // Auto-stop after 8 seconds of continuous recording to protect user
      const timeoutId = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 8000);

      (recorder as any)._timeoutId = timeoutId;
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Could not start recording. Please grant microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      if ((mediaRecorder as any)._timeoutId) {
        clearTimeout((mediaRecorder as any)._timeoutId);
      }
      mediaRecorder.stop();
    }
  };

  const handleMicClick = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section className="w-[min(24rem,calc(100vw-2rem))] rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-base font-bold text-slate-950">Voice Helper</p>
              <p className="text-xs font-medium text-slate-500">Live replies for cashflow and reminders</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200"
                onClick={speakLatest}
                aria-label="Read latest answer aloud"
              >
                <Volume2 className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                onClick={() => {
                  stopRecording();
                  setOpen(false);
                }}
                aria-label="Close Voice Helper"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mb-3 max-h-44 space-y-2 overflow-auto pr-1">
            {history.slice(-4).map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  item.role === "assistant"
                    ? "bg-slate-100 text-slate-700"
                    : "ml-auto bg-[hsl(var(--primary))] text-white"
                }`}
              >
                {item.content}
              </div>
            ))}
            {loading ? (
              <div className="max-w-[92%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">
                Thinking...
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage(draft);
              }}
              placeholder="Ask: 'how much cash do I have?'"
              className="min-h-11 min-w-0 flex-1 rounded-2xl border border-[hsl(var(--border))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
            />
            <button
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition duration-200 ${
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              onClick={handleMicClick}
              aria-label={recording ? "Stop recording voice question" : "Record voice question"}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-white transition hover:brightness-95 disabled:opacity-50"
              onClick={() => sendMessage(draft)}
              disabled={!draft.trim() || loading}
              aria-label="Send question"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}

      <button
        className="inline-flex h-14 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:bg-slate-800"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open Voice Helper"
        aria-expanded={open}
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Voice Helper</span>
      </button>
    </div>
  );
}
