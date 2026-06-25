import { useCallback, useRef, useState } from "preact/hooks";
import type { Room, RemoteTrack } from "livekit-client";

import type { WidgetInitOptions } from "../types";
import type { Strings } from "./i18n";
import { friendlyError, networkErrorMessage, parseErrorBody } from "./errors";

// `livekit-client` is ~130KB gzipped — bigger than the entire widget. Keep it
// OUT of the base bundle and load
// it from a CDN only when a visitor actually starts a voice session. The base
// widget stays unchanged for everyone who never taps the mic. Cached after the
// first load. (`import type` above is erased at build time → zero bundle cost.)
const LIVEKIT_CDN = "https://cdn.jsdelivr.net/npm/livekit-client@2.20.0/+esm";
let _livekit: Promise<typeof import("livekit-client")> | null = null;
const loadLiveKit = (): Promise<typeof import("livekit-client")> =>
(_livekit ??= import(/* @vite-ignore */ LIVEKIT_CDN) as Promise<
  typeof import("livekit-client")
>);

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

/** The agent's conversational phase while live — drives the overlay label so we
 *  don't say "speak now" while the agent is still greeting/thinking. */
export type VoicePhase = "warming" | "speaking" | "thinking" | "listening";

/** One transcription segment from the live voice session — pushed into the chat
 *  message list so the spoken conversation also appears as text. `final=false`
 *  is an interim update for the same `id` (replace it when `final` arrives). */
export type VoiceTranscript = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
};

const stripTrailingSlash = (value: string) =>
  value.endsWith("/") ? value.slice(0, -1) : value;

/**
 * Drives a LiveKit voice session for the widget: fetches a room token from
 * CoreBase, connects, publishes the mic, and plays the agent's audio back.
 * The agent on the other side is the same governed CoreBase assistant the text
 * chat uses. Returns a tiny state machine the UI renders.
 */
export function useVoiceSession(
  options: WidgetInitOptions,
  getBearer: () => Promise<string | undefined>,
  strings: Strings,
  onTranscript?: (segment: VoiceTranscript) => void,
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Live audio level (0–1) for the visualizer + the agent's conversational phase.
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState<VoicePhase>("warming");
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveSince = useRef(0);
  const agentSpoke = useRef(false);

  const stop = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (levelTimer.current) {
      clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
    setLevel(0);
    setPhase("warming");
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current = [];
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* best effort */
      }
    }
    setStatus((s) => (s === "error" ? s : "idle"));
  }, []);

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setError(null);
    setStatus("connecting");
    try {
      const apiBaseUrl = stripTrailingSlash(options.apiBaseUrl);
      const bearer = await getBearer();
      const res = await fetch(`${apiBaseUrl}/api/widget/voice/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.publicId ? { "X-Public-Id": options.publicId } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
      });
      if (!res.ok) {
        // Specific, localized reason (quota / disabled / not set up / …).
        setError(
          friendlyError(res.status, await parseErrorBody(res), strings, "voice"),
        );
        setStatus("error");
        return;
      }
      const { url, token } = (await res.json()) as {
        url: string;
        token: string;
      };

      const { Room, RoomEvent, Track } = await loadLiveKit();
      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          document.body.appendChild(el);
          audioElsRef.current.push(el);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        void stop();
      });

      await room.connect(url, token);

      // Mirror the spoken conversation into the chat as text. LiveKit publishes
      // transcriptions (your speech via STT + the agent's spoken reply) as text
      // streams on the "lk.transcription" topic. Read each stream INCREMENTALLY
      // (not readAll, which only resolves when the segment is complete) so the
      // bubble grows word-by-word as the agent speaks. Same segment_id updates
      // the same bubble.
      if (onTranscript) {
        const localId = room.localParticipant.identity;
        room.registerTextStreamHandler(
          "lk.transcription",
          // reader/participant typed loosely — types come from the CDN module.
          async (reader: any, participant?: { identity?: string }) => {
            const attrs: Record<string, string> =
              reader?.info?.attributes ?? {};
            if (!("lk.transcribed_track_id" in attrs)) return; // not a transcript
            const id =
              attrs["lk.segment_id"] || reader.info?.id || `${Date.now()}`;
            const role =
              participant?.identity && participant.identity !== localId
                ? "assistant"
                : "user";
            let text = "";
            try {
              // TextStreamReader is async-iterable → chunks as they arrive.
              for await (const chunk of reader) {
                text += chunk;
                const t = text.trim();
                if (t) onTranscript({ id, role, text: t, final: false });
              }
            } catch {
              // Fallback if this build's reader isn't iterable.
              const all = (await reader.readAll?.())?.trim?.() ?? "";
              if (all) text = all;
            }
            const finalText = text.trim();
            if (finalText) onTranscript({ id, role, text: finalText, final: true });
          },
        );
      }

      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
      liveSince.current = Date.now();
      agentSpoke.current = false;
      setPhase("warming");
      setStatus("live");

      // Poll the agent's phase + audio levels. Phase comes from the agent's
      // `lk.agent.state` attribute when available (precise: initializing →
      // speaking → listening), so we don't show "speak now" while the greeting
      // is still playing. Fallback: agent audio + a short grace window.
      levelTimer.current = setInterval(() => {
        const r = roomRef.current;
        if (!r) return;
        let agentLevel = 0;
        let state = "";
        r.remoteParticipants?.forEach(
          (p: {
            audioLevel?: number;
            attributes?: Record<string, string>;
          }) => {
            agentLevel = Math.max(agentLevel, p.audioLevel || 0);
            const s = p.attributes?.["lk.agent.state"];
            if (s) state = s;
          },
        );
        const mic = r.localParticipant?.audioLevel || 0;

        let next: VoicePhase;
        if (state) {
          next =
            state === "speaking"
              ? "speaking"
              : state === "thinking"
                ? "thinking"
                : state === "listening"
                  ? "listening"
                  : "warming"; // initializing / idle
        } else {
          // No agent-state attribute: infer from audio, with a grace window so
          // a configured greeting isn't pre-empted by a premature "speak now".
          const sp = agentLevel > 0.015;
          if (sp) agentSpoke.current = true;
          const elapsed = Date.now() - liveSince.current;
          next = sp
            ? "speaking"
            : agentSpoke.current || elapsed > 2500
              ? "listening"
              : "warming";
        }
        setPhase(next);
        const speaking = next === "speaking";
        setLevel(Math.min(1, (speaking ? agentLevel : mic) * 4));
      }, 90);
    } catch (e) {
      // Network / LiveKit connect failures → friendly, localized; never the raw
      // browser message ("NetworkError when attempting to fetch resource.").
      setError(networkErrorMessage(e, strings, "voice"));
      setStatus("error");
      await stop();
    }
  }, [options, getBearer, strings, stop, onTranscript]);

  const toggle = useCallback(() => {
    if (roomRef.current) void stop();
    else void start();
  }, [start, stop]);

  return { status, error, level, phase, start, stop, toggle };
}
