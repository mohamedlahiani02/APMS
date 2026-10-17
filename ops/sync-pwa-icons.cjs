// Plesk can serve image extensions directly from Document Root, before Passenger.
// Keep the two icon directories byte-for-byte identical for that hosting route.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend/public/icons');
const target = path.join(root, 'public/icons');
const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(target, { recursive: true });
for (const size of [180, 192, 512]) {
  const name = 'sia-' + size + '.png';
  const original = fs.readFileSync(path.join(source, name));
  if (original.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      original.readUInt32BE(16) !== size || original.readUInt32BE(20) !== size) {
    throw new Error('Invalid SIA PWA icon: ' + name);
  }
  const destination = path.join(target, name);
  if (!check) fs.copyFileSync(path.join(source, name), destination);
  const served = fs.readFileSync(destination);
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha(original) !== sha(served)) throw new Error('Plesk Document Root icon differs: ' + name);
}
console.log(check ? 'Plesk PWA icon copies verified.' : 'Plesk Document Root icons updated.');
