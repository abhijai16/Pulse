import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';

// Live microphone distress detector.
//
// Ported from audio-engine-hacquire/src/components/LiveVoiceDistressDetector.tsx.
// The Web Audio API spectrum visualizer + Web Speech API recognition are
// preserved verbatim — that is the IP we want to keep. Tailwind is replaced
// with Pulse CSS classes (card / page-title / --accent / --green / --red)
// and lucide-react icons are dropped in favor of emoji + inline SVG so we
// don't pull in a new icon dep.
//
// Notes:
//  - Web Speech API is Chrome/Edge/Safari only (Firefox has no support).
//    We silently no-op the recognition setup if window.SpeechRecognition
//    is missing, so the spectrum visualizer still works.
//  - The recognizer's `continuous + interimResults` lets us catch keywords
//    in the middle of a sentence ("oh my god FIRE!" → fires on FIRE).
//  - We dedupe detections within a 2.5 s window so a single utterance
//    doesn't create three incidents.

const KEYWORDS = ['HELP', 'FIRE', 'POLICE', 'GUNSHOT', 'EMERGENCY', 'AMBULANCE', 'INTRUDER', 'ATTACK'];

function classifyAgency(kw) {
  const upper = kw.toUpperCase();
  if (upper.includes('FIRE') || upper.includes('SMOKE')) {
    return { agency: 'Fire Station (Dispatch Unit 1)', severity: 'CRITICAL' };
  }
  if (upper.includes('POLICE') || upper.includes('GUNSHOT') || upper.includes('INTRUDER') || upper.includes('ATTACK')) {
    return { agency: 'Police Department & Rapid Response', severity: 'CRITICAL' };
  }
  if (upper.includes('AMBULANCE') || upper.includes('HOSPITAL')) {
    return { agency: 'Campus Hospital & Paramedic Unit', severity: 'HIGH' };
  }
  return { agency: 'Central Emergency Response & Campus Police', severity: 'HIGH' };
}

export default function LiveMicDetector({ sensorLocation, onDetection }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastDetection, setLastDetection] = useState(null);
  const [error, setError] = useState(null);
  // Diagnostic status — surfaces WHY speech recognition is/isn't working.
  // 'unsupported' | 'starting' | 'listening' | 'no-match' | 'denied' | 'errored'
  const [recogStatus, setRecogStatus] = useState('idle');

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastFireRef = useRef({ kw: '', at: 0 });

  // Trigger a backend incident for the detected keyword. The 2.5s
  // dedupe window stops a 3-second "HELP HELP HELP" shout from
  // creating three rows. `onDetection` lets the parent page (AudioSentry)
  // refresh its right-side event log without a full reload.
  async function fireKeyword(kw, text) {
    const now = Date.now();
    if (kw === lastFireRef.current.kw && now - lastFireRef.current.at < 2500) return;
    lastFireRef.current = { kw, at: now };

    const route = classifyAgency(kw);
    const result = {
      keyword: kw.toUpperCase(),
      agency: route.agency,
      severity: route.severity,
      time: new Date().toLocaleTimeString(),
      transcript: text,
    };
    setLastDetection(result);

    try {
      await api.voiceDetect({
        detectedKeyword: kw.toUpperCase(),
        confidenceScore: 0.96,
        audioLevelDb: -14.2,
        sensorLocation: sensorLocation || 'Zone 4 - Academic Quad (Mic Sensor 01)',
        rawTranscript: text,
      });
      onDetection?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function startListening() {
    setError(null);
    try {
      // 1. AudioContext + analyser for the live decibel spectrum.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const micSource = audioCtx.createMediaStreamSource(stream);
      micSource.connect(analyser);
      microphoneRef.current = micSource;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 255) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 2. Web Speech API recognition. Silent no-op on Firefox.
      // We surface every recognition lifecycle event as `recogStatus`
      // so the user can see whether Chrome actually started the
      // recognizer, hit a permissions error, or simply isn't producing
      // transcript events (the most common case on Chrome-on-Linux
      // where the cloud speech backend is unavailable).
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setRecogStatus('unsupported');
      } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setRecogStatus('listening');
        recognition.onaudiostart = () => setRecogStatus('listening');
        recognition.onspeechstart = () => setRecogStatus('listening');
        recognition.onnomatch = () => setRecogStatus('no-match');
        recognition.onresult = (event) => {
          let currentText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentText += event.results[i][0].transcript;
          }
          setTranscript(currentText);
          setRecogStatus('listening');

          const upper = currentText.toUpperCase();
          for (const kw of KEYWORDS) {
            if (upper.includes(kw)) {
              fireKeyword(kw, currentText);
              break;
            }
          }
        };
        recognition.onerror = (e) => {
          // Surface EVERY error (not just the filtered subset) so we
          // can see Chrome's actual code: 'not-allowed', 'service-not-
          // allowed', 'network', 'no-speech'. 'no-speech' is the one
          // that fires constantly when the backend is reachable but the
          // mic hears nothing — keep it visible but quieter.
          const msg = e.error || 'unknown';
          if (msg === 'not-allowed' || msg === 'service-not-allowed') {
            setRecogStatus('denied');
            setError(`Speech recognition blocked (${msg}). Check Chrome site permissions and ensure you're on localhost or https.`);
          } else if (msg === 'network') {
            setRecogStatus('errored');
            setError('Speech recognition network error — Chrome cannot reach its cloud backend (common on Chrome-on-Linux without a Google account, or in offline/restricted networks). Use the Simulate panel below to demo the pipeline.');
          } else {
            setRecogStatus('errored');
            setError(`Speech recognition: ${msg}`);
          }
        };
        recognition.onend = () => {
          // Chrome auto-stops the recognizer after a few seconds of
          // silence. Restart it while the user still wants to listen.
          if (recognitionRef.current === recognition && streamRef.current) {
            try { recognition.start(); } catch {}
          }
        };

        try {
          setRecogStatus('starting');
          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          setRecogStatus('errored');
          setError(`Failed to start recognition: ${e.message}`);
        }
      }

      setIsListening(true);
    } catch (err) {
      setError('Microphone access denied or unavailable.');
    }
  }

  function stopListening() {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

    setIsListening(false);
    setAudioLevel(0);
    setTranscript('');
    setRecogStatus('idle');
  }

  // Cleanup on unmount so navigating away doesn't leak the mic stream.
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return (
    <div className="card">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="live-pill-dot"
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isListening ? 'var(--green)' : 'var(--muted)',
                boxShadow: isListening ? '0 0 8px var(--green)' : 'none',
                animation: isListening ? 'pulse 1.4s ease-in-out infinite' : 'none',
              }}
            />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'var(--accent)',
            }}>
              Live Continuous Acoustic Sentry
            </span>
          </div>
          <h3 style={{ margin: '6px 0 0 0', color: 'var(--text)' }}>
            Real-Time Voice Distress Recognition
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Speak <strong style={{ color: 'var(--text)' }}>HELP</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>FIRE</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>POLICE</strong>,{' '}
            <strong style={{ color: 'var(--text)' }}>GUNSHOT</strong>, or{' '}
            <strong style={{ color: 'var(--text)' }}>AMBULANCE</strong> into the microphone.
          </p>
        </div>

        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          className={isListening ? 'danger' : 'primary'}
          style={{ minWidth: 180 }}
        >
          {isListening ? '⏹ Stop Mic' : '🎙 Start Real-Time Mic'}
        </button>
      </div>

      {/* Recognition status pill — only visible when listening. Makes
          the difference between "Chrome started the recognizer but the
          transcript hasn't come yet" (normal — no speech heard) and
          "Chrome rejected the request" (the speech API isn't usable in
          this browser / network) visible at a glance. */}
      {isListening && (
        <div style={{ marginBottom: 10 }}>
          <RecogStatusPill status={recogStatus} />
        </div>
      )}

      {isListening && (
        <>
          {/* 24-band decibel spectrum. The animation reads as energy +
              motion without us having to draw a real waveform. */}
          <div style={{
            background: 'var(--accent-soft)',
            border: '1px solid rgba(94,177,255,0.25)',
            borderRadius: 12, padding: 12, marginBottom: 10,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6,
            }}>
              <span>🔊 Live Decibel Spectrum</span>
              <span style={{ fontFamily: 'monospace' }}>{audioLevel}% intensity</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 2,
              height: 56, background: 'var(--bg)', padding: 6, borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              {Array.from({ length: 24 }).map((_, i) => {
                const heightPct = Math.min(
                  100,
                  Math.max(8, audioLevel * (0.4 + (i % 6) * 0.15) + Math.sin(i + audioLevel) * 20),
                );
                const color = heightPct > 70 ? 'var(--red)' : heightPct > 40 ? 'var(--amber)' : 'var(--green)';
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1, height: `${heightPct}%`,
                      background: color, borderRadius: 2,
                      transition: 'height 75ms linear',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
              Live transcript
            </div>
            <div style={{ fontStyle: 'italic', minHeight: 24, color: 'var(--text)' }}>
              {transcript
                ? `"${transcript}"`
                : <span style={{ color: 'var(--muted)', fontStyle: 'normal' }}>Listening for distress words…</span>}
            </div>
          </div>
        </>
      )}

      {lastDetection && (
        <div style={{
          marginTop: 14, padding: 14,
          background: 'linear-gradient(90deg, rgba(255,77,77,0.18), rgba(255,77,77,0.04))',
          border: '1px solid rgba(255,77,77,0.4)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 40, height: 40, display: 'grid', placeItems: 'center',
                background: 'rgba(255,77,77,0.25)', color: 'var(--red)', fontSize: 22, borderRadius: 12,
              }}>🚨</div>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: 'var(--red)',
                    background: 'rgba(255,77,77,0.25)', padding: '2px 8px', borderRadius: 6,
                  }}>
                    Keyword match: {lastDetection.keyword}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>{lastDetection.time}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                  Dispatched to: <span style={{ color: 'var(--red)' }}>{lastDetection.agency}</span>
                </div>
                {lastDetection.transcript && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
                    "{lastDetection.transcript}"
                  </div>
                )}
              </div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--green)',
              background: 'rgba(46,204,113,0.18)', padding: '4px 10px', borderRadius: 999,
              border: '1px solid rgba(46,204,113,0.4)',
            }}>
              ✓ Dispatched
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, fontSize: 12, color: 'var(--red)',
          background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.3)',
          padding: 8, borderRadius: 8,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// Status pill — translates the recognizer lifecycle into a human-
// readable state. Most users hit "listening" or "errored (network)".
// 'errored' is the one we'll see on Chrome-on-Linux without a Google
// account — the page must show that path clearly + point at the
// simulator.
function RecogStatusPill({ status }) {
  const map = {
    idle:        { label: 'Idle',                                 color: 'var(--muted)', bg: 'rgba(142,142,147,0.15)' },
    starting:    { label: 'Starting recognizer…',                 color: 'var(--accent)', bg: 'var(--accent-soft)' },
    listening:   { label: 'Listening for speech',                 color: 'var(--green)',  bg: 'rgba(46,204,113,0.15)' },
    'no-match':  { label: 'Heard audio but no speech recognized',color: 'var(--amber)',  bg: 'rgba(245,166,35,0.15)' },
    unsupported: { label: 'Web Speech API not supported — use Simulate below', color: 'var(--amber)', bg: 'rgba(245,166,35,0.15)' },
    denied:      { label: 'Microphone/recognition blocked',       color: 'var(--red)',    bg: 'rgba(255,77,77,0.15)' },
    errored:     { label: 'Recognition errored — use Simulate below', color: 'var(--red)', bg: 'rgba(255,77,77,0.15)' },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: s.color,
      background: s.bg, padding: '4px 10px', borderRadius: 999,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: s.color,
        animation: status === 'listening' || status === 'starting' ? 'pulse 1.4s ease-in-out infinite' : 'none',
      }} />
      {s.label}
    </span>
  );
}
