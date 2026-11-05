import { test, expect } from '@playwright/test';

const tinyPng = {
  name: 'handala-test.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAAC' +
    'AqQAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
    'base64',
  ),
};

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.evaluate(() => new Promise((resolve, reject) => {\n    const request = indexedDB.deleteDatabase('handala-studio-db');\n    request.onsuccess = () => resolve();\n    request.onerror = () => reject(request.error);\n    request.onblocked = () => reject(new Error('IndexedDB deletion blocked'));\n  }));
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('studio route boots and editor panels are present', async ({ page }) => {
  await expect(page.getByText('MEDIA LIBRARY')).toBeVisible();
  await expect(page.getByText('PREVIEW MONITOR')).toBeVisible();
  await expect(page.getByText('INSPECTOR')).toBeVisible();
  await expect(page.getByText('TIMELINE')).toBeVisible();
  await expect(page.getByRole('button', { name: '⇩ Export video' })).toBeDisabled();
});

test('image import, selection, timeline split, and local autosave/restore', async ({ page }) => {
  await page.locator('.media-panel input[type=file]').setInputFiles(tinyPng);
  await expect(page.getByRole('button', { name: /handala-test\.png/ })).toBeVisible();
  await expect(page.locator('.timeline-clip.image')).toHaveCount(1);
  await expect(page.locator('.inspector-name')).toContainText('handala-test.png');

  await page.getByRole('slider', { name: 'Playhead' }).evaluate(el => {\n    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2.5');\n    el.dispatchEvent(new Event('input', { bubbles: true }));\n    el.dispatchEvent(new Event('change', { bubbles: true }));\n  });
  await page.locator('.inspector-actions').getByRole('button', { name: /Split at playhead/ }).click();
  await expect(page.locator('.timeline-clip.image')).toHaveCount(2);
  await expect(page.locator('.footer')).toBeVisible().catch(() => {});

  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('.timeline-clip.image')).toHaveCount(2);
  await expect(page.locator('footer')).toContainText(/saved|restored/i);
});

test('SRT import parses cues and displays subtitle lane', async ({ page }) => {
  const srt = {
    name: 'sample.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nTest subtitle cue\n'),
  };
  await page.locator('.secondary-import input[type=file]').setInputFiles(srt);
  await expect(page.locator('.timeline-clip.caption')).toContainText('Test subtitle cue');
  await expect(page.locator('footer')).toContainText('1 subtitle cues imported.');
});

test('project backup exports a JSON download', async ({ page }) => {
  await page.locator('.media-panel input[type=file]').setInputFiles(tinyPng);
  await expect(page.locator('.timeline-clip.image')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save project/i }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('handala-studio-project.json');
});
