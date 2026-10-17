// Reproducible icon packaging: preserve the supplied SIA artwork on a white square.
const path = require('node:path');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const frontend = createRequire(path.join(root, 'frontend/package.json'));
const { ImageResponse } = frontend('next/og');
const { createElement } = frontend('react');
(async () => {
  const artwork = 'data:image/jpeg;base64,' + (await fs.readFile(path.join(root, 'frontend/public/logo-sia.jpg'))).toString('base64');
  const output = path.join(root, 'frontend/public/icons');
  await fs.mkdir(output, { recursive: true });
  for (const size of [180, 192, 512]) {
    const response = new ImageResponse(createElement('div', { style: { width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' } },
      createElement('img', { src: artwork, alt: '', width: Math.round(size * 0.9), height: Math.round(size * 0.9 * 437 / 447) })), { width: size, height: size });
    await fs.writeFile(path.join(output, 'sia-' + size + '.png'), Buffer.from(await response.arrayBuffer()));
  }
  require('./sync-pwa-icons.cjs');
  console.log('Packaged SIA installation icons at 180, 192 and 512 pixels.');
})().catch(() => { console.error('PWA icon packaging failed.'); process.exitCode = 1; });
