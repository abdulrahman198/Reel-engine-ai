import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translator } from '../client/i18n.js';

test('scene timeline controls are localized and available in every supported UI language', () => {
  const locales = ['ar', 'de', 'en'];
  const keys = ['addScene', 'moveUp', 'moveDown', 'removeScene', 'templateTitle', 'templateHelp'];
  for (const locale of locales) {
    const t = translator(locale);
    for (const key of keys) assert.ok(t(key) && t(key) !== key, `Missing ${key} in ${locale}`);
  }
  assert.equal(translator('unknown')('addScene'), translator('en')('addScene'));
});
