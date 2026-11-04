export function retimeScenes(items, duration) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 6) throw new RangeError('A project must contain between 1 and 6 scenes.');
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('Duration must be a positive number.');
  return items.map((scene, i) => ({
    ...scene,
    start: +(i * duration / items.length).toFixed(3),
    end: +((i + 1) * duration / items.length).toFixed(3),
  }));
}

export function invalidateSceneImage(images, index) {
  if (!Array.isArray(images) || !Number.isInteger(index) || index < 0 || index >= images.length) throw new RangeError('Scene image index is out of range.');
  return images.map((image, i) => i === index ? null : image);
}
