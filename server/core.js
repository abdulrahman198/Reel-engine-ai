export class HttpError extends Error {
  constructor(status, code, detail = code) { super(detail); this.status = status; this.code = code; }
}

export function text(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `invalid_${name}`, `${name} must contain 1–${max} characters.`);
  }
  return value.trim();
}

export function aspect(value = '9:16') {
  if (!['9:16', '16:9'].includes(value)) throw new HttpError(400, 'invalid_aspect');
  return value;
}

export function options(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_request');
  const language = body.language ?? 'de', duration = body.duration ?? 30;
  if (!['ar', 'de', 'en'].includes(language)) throw new HttpError(400, 'invalid_language');
  if (![30, 45, 60].includes(duration)) throw new HttpError(400, 'invalid_duration');
  return { topic: text(body.topic, 'topic', 2000), language, duration,
    style: text(body.style ?? 'Cinematic documentary', 'style', 160), aspect: aspect(body.aspect) };
}

export function scenes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) throw new HttpError(400, 'invalid_scenes');
  return value.map((s, i) => {
    if (!s || typeof s !== 'object') throw new HttpError(400, 'invalid_scene');
    return { title: text(s.title || `Scene ${i + 1}`, 'title', 160),
      visualPrompt: text(s.visualPrompt || s.prompt, 'visual_prompt'),
      voiceover: typeof s.voiceover === 'string' ? s.voiceover.slice(0, 8000) : '',
      onScreenText: typeof s.onScreenText === 'string' ? s.onScreenText.slice(0, 160) : '' };
  });
}

export function normalizePlan(plan, input) {
  const script = text(plan?.script, 'script', 8000), items = scenes(plan.scenes);
  return { ...input, script, scenes: items.map((s, i) => ({ ...s,
    start: +(i * input.duration / items.length).toFixed(3), end: +((i + 1) * input.duration / items.length).toFixed(3) })) };
}

// Drafts may contain empty fields while the editor is typing. Rendering still
// uses normalizePlan(), which requires a complete script and visual prompts.
export function draftPlan(value) {
  const input = options(value);
  const field = (v, max) => {
    if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_draft_field');
    return v;
  };
  if (!Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 6) throw new HttpError(400, 'invalid_scenes');
  return { ...input, script: field(value.script, 8000), mode: ['ai', 'demo'].includes(value.mode) ? value.mode : 'manual',
    warning: typeof value.warning === 'string' ? value.warning.slice(0, 1200) : undefined,
    scenes: value.scenes.map((scene, i) => ({ title: field(scene?.title ?? '', 160), voiceover: field(scene?.voiceover ?? '', 8000),
      visualPrompt: field(scene?.visualPrompt ?? scene?.prompt ?? '', 4000), onScreenText: field(scene?.onScreenText ?? '', 160),
      start: +(i * input.duration / value.scenes.length).toFixed(3), end: +((i + 1) * input.duration / value.scenes.length).toFixed(3) })) };
}

export function demoPlan(input) {
  const lines = {
    de: ['Stell dir vor:', 'Wir beginnen mit einem starken Bild.', 'Dann zeigen wir den Kontext und die Details.', 'Zum Schluss bleibt eine klare Idee.'],
    ar: ['تخيّل:', 'نبدأ بصورة قوية.', 'ثم نعرض السياق والتفاصيل خطوة بخطوة.', 'وفي النهاية تبقى فكرة واضحة.'],
    en: ['Imagine:', 'We open with a striking image.', 'Then we reveal the context and the details.', 'We end with one clear idea.'],
  }[input.language];
  const count = input.duration === 60 ? 6 : input.duration === 45 ? 5 : 4;
  const narration = [`${lines[0]} ${input.topic}.`, ...lines.slice(1)];
  while (narration.length < count) narration.splice(narration.length - 1, 0, { de: 'Ein Detail erzählt mehr.', ar: 'تفصيل صغير يحمل معنى كبيرًا.', en: 'One detail tells a bigger story.' }[input.language]);
  const script = narration.join(' ');
  return normalizePlan({ script, scenes: Array.from({ length: count }, (_, i) => ({
    title: ['Hook', 'Context', 'Detail', 'Tension', 'Payoff', 'Closing'][i], voiceover: narration[i],
    visualPrompt: `${input.style}. Scene ${i + 1} about ${input.topic}. ${input.aspect} composition. No baked-in text.`, onScreenText: '',
  })) }, input);
}

export const planSchema = {
  type: 'object', additionalProperties: false, required: ['script', 'scenes'],
  properties: { script: { type: 'string' }, scenes: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['title', 'voiceover', 'visualPrompt', 'onScreenText'],
    properties: Object.fromEntries(['title', 'voiceover', 'visualPrompt', 'onScreenText'].map(k => [k, { type: 'string' }])),
  } } },
};

export function captionsFromAlignment(alignment) {
  const chars = alignment?.characters, starts = alignment?.character_start_times_seconds, ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(chars) || !chars.length || !Array.isArray(starts) || !Array.isArray(ends)
    || chars.length !== starts.length || chars.length !== ends.length) return [];
  const words = [];
  let word = '', start = null, end = 0, previousStart = 0;
  for (let i = 0; i < chars.length; i++) {
    if (typeof chars[i] !== 'string' || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i])
      || starts[i] < previousStart || ends[i] < starts[i]) return [];
    previousStart = starts[i];
    if (/\s/u.test(chars[i])) { if (word) words.push({ text: word, start, end }); word = ''; start = null; }
    else { if (start === null) start = starts[i]; word += chars[i]; end = ends[i]; }
  }
  if (word) words.push({ text: word, start, end });
  const cues = []; let group = [];
  const flush = () => {
    if (group.length) cues.push({ text: group.map(w => w.text).join(' '), start: Math.max(0, group[0].start), end: group.at(-1).end });
    group = [];
  };
  for (const w of words) {
    if (group.length && (group.length >= 5 || group.map(x => x.text).join(' ').length + w.text.length > 46 || w.end - group[0].start > 3.5)) flush();
    group.push(w); if (/[.!?؟]$/u.test(w.text)) flush();
  }
  flush(); return cues.filter(c => c.end > c.start);
}

export function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.replace(/[{}\\<>\r\n]/g, ' ')}\n`).join('\n');
}

export function parseSrt(value) {
  const source = text(value, 'srt', 50000).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = source.split(/\n\s*\n/), cues = [];
  if (blocks.length > 500) throw new HttpError(400, 'too_many_captions');
  const time = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  for (const block of blocks) {
    const match = block.trim().match(/^(?:\d+\n)?(\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3})\n([\s\S]+)$/);
    if (!match) throw new HttpError(400, 'invalid_srt', 'Use an SRT file with numbered cues and HH:MM:SS,mmm timestamps.');
    const start = time(...match.slice(1, 5)), end = time(...match.slice(5, 9));
    if (start < (cues.at(-1)?.end || 0) || end <= start || end > 180) throw new HttpError(400, 'invalid_caption_timing', 'Subtitles must be ordered, not overlap, and end within 180 seconds.');
    cues.push({ start, end, text: text(match[9].replace(/<[^>]*>/g, '').replace(/[{}\\]/g, '').replace(/\s+/g, ' '), 'caption', 500) });
  }
  return cues;
}
