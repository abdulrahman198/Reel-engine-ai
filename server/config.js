// Only this codespace's exact origin is trusted, never all of app.github.dev.
export function frontendOrigin(env = process.env) {
  if (env.FRONTEND_ORIGIN?.trim()) {
    try {
      const url = new URL(env.FRONTEND_ORIGIN.trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
    } catch { return ''; }
  }
  if (env.CODESPACES !== 'true') return '';
  const name = env.CODESPACE_NAME || '';
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || '';
  const label = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  const port = Number(env.PORT || 8787);
  if (!label.test(name) || !domain.includes('.') || !domain.split('.').every(part => label.test(part))
      || !Number.isInteger(port) || port < 1 || port > 65535) return '';
  return `https://${name}-${port}.${domain}`;
}
