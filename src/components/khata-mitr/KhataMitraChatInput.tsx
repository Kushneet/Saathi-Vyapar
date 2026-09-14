'use client';

/**
 * src/components/khata-mitr/KhataMitraChatInput.tsx
 * Text + voice (mic recording) input for the Khata Mitra assistant panel.
 * Ported from the standalone Khata-Mitr app's ChatInput.tsx and restyled
 * to match Saathi Vyapar's gold/navy dashboard theme.
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Loader2, MessageSquare, AudioLines } from 'lucide-react';

interface KhataMitraChatInputProps {
  userId: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  isLoading: boolean;
  onStartLoading: () => void;
  onResponseReceived: (userMsgText: string, assistantResponse: string) => void;
  onError: (error: string) => void;
  language: 'hi' | 'en';
}

export default function KhataMitraChatInput({
  userId,
  history,
  isLoading,
  onStartLoading,
  onResponseReceived,
  onError,
  language,
}: KhataMitraChatInputProps) {
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text, inputMode]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const dispatchPayload = async (
    payload:
      | { inputType: 'text'; textPayload: string }
      | { inputType: 'audio'; audioPayload: { mimeType: string; base64Data: string } },
    displayUserMsg: string
  ) => {
    onStartLoading();
    try {
      const response = await fetch('/api/khata-mitr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId, history }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server responded with an error');

      onResponseReceived(displayUserMsg, data.response);
    } catch (err) {
      console.error('Khata Mitra dispatch error:', err);
      onError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const handleTextSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isLoading) return;

    const textPayload = text.trim();
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    dispatchPayload({ inputType: 'text', textPayload }, textPayload);
  };

  const startRecording = async () => {
    if (isLoading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          dispatchPayload(
            { inputType: 'audio', audioPayload: { mimeType, base64Data } },
            language === 'hi' ? '[आवाज़ संदेश]' : '[Voice Message]'
          );
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      recordingTimeoutRef.current = setTimeout(() => stopRecording(), 10000);
    } catch (err) {
      console.error('Error starting recording:', err);
      onError(
        language === 'hi'
          ? 'माइक्रोफ़ोन अनुमति अस्वीकृत या उपलब्ध नहीं है।'
          : 'Microphone permission denied or unavailable.'
      );
    }
  };

  const stopRecording = () => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex bg-[#F5F1E6] p-1 rounded-xl border border-[#C9A24B]/20">
        <button
          type="button"
          onClick={() => {
            if (isRecording) stopRecording();
            setInputMode('text');
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            inputMode === 'text'
              ? 'bg-[#0B1E33] text-white shadow-md'
              : 'text-[#0B1E33]/50 hover:text-[#0B1E33] hover:bg-white/60'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {language === 'hi' ? 'टेक्स्ट मोड' : 'Text Mode'}
        </button>
        <button
          type="button"
          onClick={() => setInputMode('voice')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            inputMode === 'voice'
              ? 'bg-[#0B1E33] text-white shadow-md'
              : 'text-[#0B1E33]/50 hover:text-[#0B1E33] hover:bg-white/60'
          }`}
        >
          <AudioLines className="h-3.5 w-3.5" />
          {language === 'hi' ? 'आवाज़ मोड' : 'Voice Mode'}
        </button>
      </div>

      {inputMode === 'text' ? (
        <form onSubmit={handleTextSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={
              language === 'hi'
                ? 'लिखें (जैसे: "आज 500 की बिक्री हुई")...'
                : 'Type here (e.g., "Sold ₹500 worth today")...'
            }
            className="flex-1 px-3.5 py-3 text-xs border border-[#C9A24B]/25 rounded-xl bg-white text-[#0B1E33] placeholder-[#0B1E33]/40 focus:outline-none focus:ring-2 focus:ring-[#C9A24B]/40 focus:border-[#C9A24B] transition-all resize-none max-h-32 disabled:opacity-60 font-medium"
          />
          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className="h-10 w-10 rounded-xl bg-[#0B1E33] hover:bg-[#162D59] text-white flex items-center justify-center shadow-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 active:scale-95 disabled:scale-100"
          >
            {isLoading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />}
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl p-4">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            className={`h-16 w-16 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all relative cursor-pointer disabled:opacity-50 disabled:scale-100 ${
              isRecording ? 'bg-rose-500 hover:bg-rose-400 text-white animate-pulse' : 'bg-[#C9A24B] hover:bg-[#B8912A] text-white'
            }`}
          >
            {isRecording ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            {isRecording && <span className="absolute inset-0 rounded-full bg-rose-400/30 animate-ping pointer-events-none" />}
          </button>

          <span className="text-[11px] text-[#0B1E33]/60 mt-3 font-semibold tracking-wide">
            {isLoading ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin text-[#C9A24B]" />
                {language === 'hi' ? 'प्रोसेसिंग...' : 'Processing audio...'}
              </span>
            ) : isRecording ? (
              <span className="text-rose-500 animate-pulse">
                {language === 'hi' ? 'बोलिए (अधिकतम 10 सेकेंड)... रोकें' : 'Speaking (max 10s)... Stop'}
              </span>
            ) : language === 'hi' ? (
              'बोलने के लिए बटन दबाएं'
            ) : (
              'Click to start speaking'
            )}
          </span>
        </div>
      )}
    </div>
  );
}
