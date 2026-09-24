/**
 * The spoken first line is the real hook of a UGC video, and no ad library
 * gives it to you. Optional: set harvest.transcribeVideos = true and
 * OPENAI_API_KEY (Claude reads images, not audio, so this one step uses a
 * speech-to-text API). Videos over 25 MB are skipped.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function transcribe(ctx, videoUrl) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !videoUrl) return null;
  try {
    const vid = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!vid.ok) return null;
    const buf = await vid.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'video/mp4' }), 'ad.mp4');
    form.append('model', ctx.cfg.harvest.transcribeModel);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    return (await res.json()).text || null;
  } catch {
    return null;
  }
}
