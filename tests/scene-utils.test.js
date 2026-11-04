import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retimeScenes, invalidateSceneImage } from '../client/scene-utils.js';

test('retime scenes distributes the full duration evenly without gaps', () => {
  for (const duration of [30, 45, 60]) for (const count of [1, 2, 4, 5, 6]) {
    const input = Array.from({ length: count }, (_, i) => ({ title: `Scene ${i + 1}`, custom: i }));
    const scenes = retimeScenes(input, duration);
    assert.equal(scenes.length, count);
    assert.equal(scenes[0].start, 0);
    assert.equal(scenes.at(-1).end, duration);
    scenes.slice(1).forEach((scene, i) => assert.equal(scene.start, scenes[i].end));
    scenes.forEach((scene, i) => assert.equal(scene.custom, i));
  }
});

test('retime scenes rejects invalid count and duration', () => {
  assert.throws(() => retimeScenes([], 30), RangeError);
  assert.throws(() => retimeScenes(Array.from({ length: 7 }, () => ({})), 30), RangeError);
  assert.throws(() => retimeScenes([{}], 0), RangeError);
});

test('editing one scene visual prompt invalidates only its matching image', () => {
  const images = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const next = invalidateSceneImage(images, 1);
  assert.deepEqual(next, [images[0], null, images[2]]);
  assert.deepEqual(images, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.throws(() => invalidateSceneImage(images, 3), RangeError);
});
