const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const publicRoot = process.cwd();
const privateRoot = path.join(publicRoot, 'private-source');
const outputRoot = path.join(publicRoot, '_site');

const functionalFiles = new Set([
  'index.html',
  'ico.svg',
  'auth.js',
  'auth.html',
  'preview.html'
]);

const ignoredNames = new Set([
  '.git',
  '.github',
  '.DS_Store',
  'node_modules',
  '_summary.txt'
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function getShanghaiDay() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    day: 'numeric'
  }).formatToParts(new Date());
  return parts.find(part => part.type === 'day').value;
}

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function encryptHtml(html, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(html, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(Buffer.concat([encrypted, tag]))
  };
}

function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]*>/g, '').trim() : '验证';
}

function makeEncryptedPage(html) {
  const payload = encryptHtml(html, getShanghaiDay());
  const title = extractTitle(html);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/ico.svg" type="image/svg+xml">
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-gray-50 h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-xs">
    <input
      type="password"
      id="decrypt-password"
      autofocus
      class="w-full p-4 text-center border-b-2 border-gray-300 bg-transparent text-xl outline-none focus:border-blue-500 transition-all font-mono"
    >
    <p id="decrypt-error" class="text-red-500 text-sm text-center mt-2 opacity-0 transition-opacity">ERROR</p>
  </div>
  <script>
    const encryptedPayload = ${JSON.stringify(payload)};
    const authStorageKey = 'auth_expiry_timestamp';
    const daysToExpiry = 2;
    const input = document.getElementById('decrypt-password');
    const error = document.getElementById('decrypt-error');

    function fromBase64(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    async function deriveKey(password, salt) {
      const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    }

    function markAuthorized() {
      const expiry = Date.now() + daysToExpiry * 24 * 60 * 60 * 1000;
      try {
        localStorage.setItem(authStorageKey, String(expiry));
      } catch (e) {
        sessionStorage.setItem(authStorageKey, String(expiry));
      }
    }

    function showError() {
      input.classList.add('border-red-500');
      error.classList.remove('opacity-0');
      input.value = '';
      setTimeout(() => {
        input.classList.remove('border-red-500');
        error.classList.add('opacity-0');
      }, 3000);
    }

    async function unlock() {
      try {
        const key = await deriveKey(input.value, fromBase64(encryptedPayload.salt));
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(encryptedPayload.iv) },
          key,
          fromBase64(encryptedPayload.data)
        );
        markAuthorized();
        const html = new TextDecoder().decode(decrypted);
        document.open();
        document.write(html);
        document.close();
      } catch (e) {
        showError();
      }
    }

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlock();
    });
  <\/script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shouldSkip(relativePath, entry) {
  if (ignoredNames.has(entry.name)) return true;
  if (!relativePath.includes(path.sep) && functionalFiles.has(entry.name)) return true;
  return false;
}

function copyFunctionalFiles() {
  for (const file of functionalFiles) {
    const source = path.join(publicRoot, file);
    if (!fs.existsSync(source)) continue;
    fs.copyFileSync(source, path.join(outputRoot, file));
  }
}

function processPrivateEntry(sourcePath, relativePath = '') {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
    if (shouldSkip(nextRelative, entry)) continue;

    const source = path.join(sourcePath, entry.name);
    const target = path.join(outputRoot, nextRelative);

    if (entry.isDirectory()) {
      ensureDir(target);
      processPrivateEntry(source, nextRelative);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    ensureDir(path.dirname(target));
    if (extension === '.html') {
      fs.writeFileSync(target, makeEncryptedPage(fs.readFileSync(source, 'utf8')));
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

if (!fs.existsSync(privateRoot)) {
  throw new Error(`Private source checkout not found: ${privateRoot}`);
}

resetDir(outputRoot);
fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '');
copyFunctionalFiles();
processPrivateEntry(privateRoot);
