const crypto = require('crypto');
const { execFileSync } = require('child_process');
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
    const accessPasswordStorageKey = 'zen_access_password';
    const accessDurationMs = 12 * 60 * 60 * 1000;
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

    function clearStoredAccess() {
      try {
        localStorage.removeItem(authStorageKey);
        localStorage.removeItem(accessPasswordStorageKey);
      } catch (e) {}
      try {
        sessionStorage.removeItem(authStorageKey);
        sessionStorage.removeItem(accessPasswordStorageKey);
      } catch (e) {}
    }

    function getStoredAccessPassword() {
      let expiry = 0;
      let password = '';
      try {
        expiry = Number(localStorage.getItem(authStorageKey) || 0);
        password = localStorage.getItem(accessPasswordStorageKey) || '';
      } catch (e) {}

      if (!password) {
        try {
          expiry = Number(sessionStorage.getItem(authStorageKey) || 0);
          password = sessionStorage.getItem(accessPasswordStorageKey) || '';
        } catch (e) {}
      }

      if (!password || !expiry || Date.now() > expiry) {
        clearStoredAccess();
        return '';
      }

      return password;
    }

    function rememberAccessPassword(password) {
      const expiry = Date.now() + accessDurationMs;
      try {
        localStorage.setItem(authStorageKey, String(expiry));
        localStorage.setItem(accessPasswordStorageKey, password);
      } catch (e) {
        sessionStorage.setItem(authStorageKey, String(expiry));
        sessionStorage.setItem(accessPasswordStorageKey, password);
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

    async function decryptWithPassword(password) {
      const key = await deriveKey(password, fromBase64(encryptedPayload.salt));
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(encryptedPayload.iv) },
        key,
        fromBase64(encryptedPayload.data)
      );
      const html = new TextDecoder().decode(decrypted);
      document.open();
      document.write(html);
      document.close();
    }

    async function unlock(password = input.value, shouldRemember = true) {
      try {
        await decryptWithPassword(password);
        if (shouldRemember) rememberAccessPassword(password);
      } catch (e) {
        if (shouldRemember) showError();
        else {
          clearStoredAccess();
          input.focus();
        }
      }
    }

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlock();
    });

    const storedPassword = getStoredAccessPassword();
    if (storedPassword) unlock(storedPassword, false);
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

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function getPathDate(relativePath, sourcePath) {
  const posixPath = toPosixPath(relativePath);
  try {
    const value = execFileSync('git', ['-C', privateRoot, 'log', '-1', '--format=%cI', '--', posixPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (value) return value;
  } catch (e) {
    // Fall back to filesystem metadata when git history is not available.
  }

  return fs.statSync(sourcePath).mtime.toISOString();
}

function readFolderSummary(folderPath) {
  const summaryPath = path.join(folderPath, '_summary.txt');
  if (!fs.existsSync(summaryPath)) return null;
  const summary = fs.readFileSync(summaryPath, 'utf8').trim();
  return summary || null;
}

function buildProjectManifestTree(sourcePath, relativePath = '', tree = {}) {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
    if (shouldSkip(nextRelative, entry)) continue;

    const source = path.join(sourcePath, entry.name);
    if (entry.isDirectory()) {
      buildProjectManifestTree(source, nextRelative, tree);
      items.push({
        type: 'dir',
        name: entry.name,
        path: toPosixPath(nextRelative),
        date: getPathDate(nextRelative, source),
        summary: readFolderSummary(source) || entry.name
      });
      continue;
    }

    if (!entry.isFile()) continue;

    items.push({
      type: 'file',
      name: entry.name,
      path: toPosixPath(nextRelative),
      date: getPathDate(nextRelative, source),
      summary: entry.name
    });
  }

  items.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff) return dateDiff;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  tree[toPosixPath(relativePath)] = items;
  return tree;
}

function writeProjectManifest() {
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tree: buildProjectManifestTree(privateRoot)
  };
  fs.writeFileSync(path.join(outputRoot, 'projects.json'), JSON.stringify(manifest, null, 2));
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
writeProjectManifest();
