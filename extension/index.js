'use strict';

/**
 * Consulta SMTC Bridge y publica el estado en la Replicant "nowPlaying".
 *
 * Config opcional en cfg/nodecg-smtc-now-playing.json:
 * {
 *   "apiUrl": "http://127.0.0.1:5000/now-playing",
 *   "pollIntervalMs": 1000
 * }
 */
module.exports = function (nodecg) {
  const cfg = nodecg.bundleConfig || {};
  const apiUrl = cfg.apiUrl || 'http://127.0.0.1:5000/now-playing';
  const pollMs = Math.max(250, cfg.pollIntervalMs || 1000);
  const DRIFT_MS = 1500; // tolerancia antes de reenviar solo por la posición

  const nowPlaying = nodecg.Replicant('nowPlaying', {
    persistent: false,
    defaultValue: emptyState(false)
  });

  let lastSent = null;
  let lastSentAt = 0;
  let wasConnected = null;

  function emptyState(connected) {
    return {
      connected,
      active: false,
      app: '',
      title: '',
      artist: '',
      album: '',
      thumbnail: '',
      status: 0, // 4 = PLAYING, 5 = PAUSED
      playing: false,
      rate: 1,
      position: 0, // ms, ya ajustada al momento del sondeo
      duration: 0 // ms
    };
  }

  function normalizeThumbnail(raw) {
    if (!raw || typeof raw !== 'string') return '';
    if (raw.startsWith('data:')) return raw;
    let mime = 'image/png';
    if (raw.startsWith('/9j/')) mime = 'image/jpeg';
    else if (raw.startsWith('R0lGOD')) mime = 'image/gif';
    else if (raw.startsWith('UklGR')) mime = 'image/webp';
    return `data:${mime};base64,${raw}`;
  }

  function pickSession(data) {
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (!sessions.length) return null;
    return (
      sessions.find((s) => s.source_app_id === data.current_session_id) ||
      sessions[0]
    );
  }

  function buildState(data) {
    const session = pickSession(data);
    if (!session) return emptyState(true);

    const props = session.media_properties || {};
    const info = session.playback_info || {};
    const tl = session.timeline_properties || {};

    const status = Number(info.PlaybackStatus) || 0;
    const playing = status === 4;
    const rate = Number(info.PlaybackRate) || 1;
    const start = Number(tl.StartTime) || 0;
    const end = Number(tl.EndTime) || 0;

    // Position es la posición en LastUpdatedTime: la avanzamos hasta "ahora".
    let position = Number(tl.Position) || 0;
    const updated = Date.parse(tl.LastUpdatedTime);
    if (playing && !Number.isNaN(updated)) {
      const elapsed = Date.now() - updated;
      if (elapsed > 0 && elapsed < 6 * 60 * 60 * 1000) {
        position += elapsed * rate;
      }
    }
    const duration = Math.max(0, end - start);
    position = Math.min(Math.max(0, position - start), duration || position);

    return {
      connected: true,
      active: Boolean(props.Title || props.Artist),
      app: session.source_app_id || '',
      title: props.Title || '',
      artist: props.Artist || props.AlbumArtist || '',
      album: props.AlbumTitle || '',
      thumbnail: normalizeThumbnail(props.Thumbnail),
      status,
      playing,
      rate,
      position: Math.round(position),
      duration: Math.round(duration)
    };
  }

  function needsUpdate(next) {
    if (!lastSent) return true;
    const keys = [
      'connected', 'active', 'app', 'title', 'artist', 'album',
      'thumbnail', 'status', 'playing', 'rate', 'duration'
    ];
    if (keys.some((k) => next[k] !== lastSent[k])) return true;

    // Misma pista y mismo estado: solo reenviar si la posición se desvía
    // de lo que la gráfica ya está interpolando (por ejemplo, un seek).
    const expected =
      lastSent.position +
      (lastSent.playing ? (Date.now() - lastSentAt) * lastSent.rate : 0);
    return Math.abs(next.position - expected) > DRIFT_MS;
  }

  function publish(next) {
    if (!needsUpdate(next)) return;
    nowPlaying.value = next;
    lastSent = next;
    lastSentAt = Date.now();
  }

  async function poll() {
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (wasConnected !== true) {
        nodecg.log.info(`Conectado a SMTC Bridge (${apiUrl})`);
        wasConnected = true;
      }
      publish(buildState(data));
    } catch (err) {
      if (wasConnected !== false) {
        nodecg.log.warn(
          `No se pudo conectar a SMTC Bridge en ${apiUrl}: ${err.message}`
        );
        wasConnected = false;
      }
      publish(emptyState(false));
    }
  }

  setInterval(poll, pollMs);
  poll();
};
