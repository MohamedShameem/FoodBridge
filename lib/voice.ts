type RecognitionResultList = {
  length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: { transcript: string };
  };
};

type RecognitionEvent = { resultIndex: number; results: RecognitionResultList };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor() {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported() {
  return Boolean(recognitionConstructor());
}

export function startDictation(callbacks: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}) {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    callbacks.onError('Voice input is not supported in this browser. You can still type your donation.');
    return null;
  }
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript ?? '';
      if (event.results[index].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    if (interimText.trim()) callbacks.onInterim(interimText.trim());
    if (finalText.trim()) callbacks.onFinal(finalText.trim());
  };
  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'Microphone access is blocked. Allow microphone access in your browser, then try again.'
      : 'I could not hear that clearly. Please try again or type your message.';
    callbacks.onError(message);
  };
  recognition.onend = callbacks.onEnd;
  recognition.start();
  return {
    stop: () => recognition.stop(),
    cancel: () => recognition.abort(),
  };
}

export function speechOutputSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeaking() {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}

function plainSpeech(text: string) {
  return text
    .replace(/READY:[\s\S]*$/i, '')
    .replace(/\*\*|__|`|#{1,6}\s*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string) {
  if (!speechOutputSupported()) return false;
  const clean = plainSpeech(text);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 1.04;
  utterance.pitch = 1;
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith('en'));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}
