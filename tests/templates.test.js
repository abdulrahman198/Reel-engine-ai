import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatorTemplates } from '../client/templates.js';

test('creator templates provide complete localized presets', () => {
  assert.equal(creatorTemplates.length, 4);
  const ids = new Set();
  for (const template of creatorTemplates) {
    assert.ok(template.id && !ids.has(template.id));
    ids.add(template.id);
    assert.ok(['9:16', '16:9'].includes(template.aspect));
    assert.ok([30, 45, 60].includes(template.duration));
    assert.ok(template.style);
    for (const locale of ['ar', 'de', 'en']) {
      assert.ok(template.label[locale]);
      assert.ok(template.description[locale]);
      assert.ok(template.topic[locale]);
    }
  }
});
