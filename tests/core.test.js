import { test } from 'node:test';
import assert from 'node:assert/strict';
import { options, normalizePlan, demoPlan, captionsFromAlignment, toSrt, srtTime, parseSrt } from '../server/core.js';

test('invalid topics, language, durations and formats are rejected', () => {
  for (const body of [null, [], { topic: {} }, { topic: ' ' }, { topic: 'x', duration: '30' },
    { topic: 'x', duration: -1 }, { topic: 'x', language: 'xx' }, { topic: 'x', aspect: '1:1' }, { topic: 'x'.repeat(2001) }]) {
    assert.throws(() => options(body), error => error.status === 400);
  }
});

test('SRT import preserves Arabic and German and rejects overlapping or unsafe timing', () => {
  const cues = parseSrt('\uFEFF1\r\n00:00:00,100 --> 00:00:01,900\r\nمرحبا Hamburg\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n<b>Hallo</b>');
  assert.equal(cues[0].text, 'مرحبا Hamburg'); assert.equal(cues[1].text, 'Hallo');
  assert.equal(parseSrt(toSrt(cues)).length, 2);
  for (const srt of ['bad', '1\n00:00:02,000 --> 00:00:01,000\nhello', '1\n00:03:00,000 --> 00:03:01,000\nhello', '1\n00:00:00,000 --> 00:00:02,000\none\n\n2\n00:00:01,000 --> 00:00:03,000\ntwo']) assert.throws(() => parseSrt(srt), e => e.status === 400);
});

test('Arabic and German plans cover the whole timeline without gaps', () => {
  for (const language of ['ar', 'de', 'en']) for (const duration of [30, 45, 60]) {
    const plan = demoPlan(options({ topic: 'Hamburg / هامبورغ', language, duration }));
    assert.equal(plan.scenes[0].start, 0); assert.equal(plan.scenes.at(-1).end, duration);
    plan.scenes.slice(1).forEach((s, i) => assert.equal(s.start, plan.scenes[i].end));
    assert.ok(plan.script.length > 20);
  }
  assert.throws(() => normalizePlan({ script: 'Hello', scenes: [{}] }, options({ topic: 'x' })));
});

test('captions use spoken character boundaries, Unicode whitespace and timestamp carry', () => {
  const value = 'Hallo\nغزة\tWelt.';
  const alignment = { characters: [...value], character_start_times_seconds: [...value].map((_, i) => i * .1), character_end_times_seconds: [...value].map((_, i) => (i + 1) * .1) };
  const cues = captionsFromAlignment(alignment);
  assert.equal(cues[0].text, 'Hallo غزة Welt.'); assert.equal(cues[0].start, 0); assert.equal(cues[0].end, value.length * .1);
  assert.ok(toSrt(cues).includes('Hallo غزة Welt.'));
  assert.equal(srtTime(59.9996), '00:01:00,000');
  assert.deepEqual(captionsFromAlignment({ ...alignment, character_end_times_seconds: [1] }), []);
  assert.deepEqual(captionsFromAlignment({ ...alignment, character_start_times_seconds: [...value].map(() => NaN) }), []);
});
