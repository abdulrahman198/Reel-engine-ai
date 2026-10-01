const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const url = path => `${API}${path}`;
export async function request(path, init) {
  let response;
  try { response = await fetch(url(path), init); } catch { throw new Error('Cannot reach the server. Check the connection and start npm run server.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Check the server address and restart it.'); }
  if (!response.ok) throw new Error(data.detail || data.error || 'The request failed.');
  return data;
}
export const jsonRequest = (path, body, method = 'POST') => request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function snapshot(doc) {
  return { name: doc.name, project: doc.project, imageIds: doc.images.map(image => image?.id || null), audioId: doc.audio?.id, captionsId: doc.captions?.id, videoJobId: doc.video?.jobId, activeJobId: doc.activeJob?.id, quality: doc.quality, burnCaptions: doc.burnCaptions };
}
export function downloadPlan(doc) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify({ version: '0.7.0', name: doc.name, project: doc.project }, null, 2)], { type: 'application/json' }));
  link.download = 'reel-engine-plan.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
