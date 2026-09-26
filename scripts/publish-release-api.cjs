#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');

// 1. Get token
function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const creds = fs.readFileSync(path.join(process.env.HOME, '.git-credentials'), 'utf8');
    const m = creds.match(/https:\/\/[^:]+:([^@]+)@github\.com/);
    if (m) return m[1];
  } catch (e) {}
  throw new Error('No GitHub token found');
}

// 2. Extract release notes
function getReleaseNotes(version) {
  const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  const lines = changelog.split('\n');
  let capturing = false;
  const notes = [];
  for (const line of lines) {
    if (line.startsWith(`## [${version}]`)) {
      capturing = true;
      continue;
    }
    if (capturing && line.startsWith('## [')) {
      break;
    }
    if (capturing) {
      notes.push(line);
    }
  }
  return notes.join('\n').trim();
}

async function main() {
  const token = getToken();
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const tagName = `v${version}`;
  const notes = getReleaseNotes(version);

  console.log(`Publishing GitHub Release for ${tagName}...`);

  // Create Release
  const releasePayload = JSON.stringify({
    tag_name: tagName,
    target_commitish: 'main',
    name: `MOBPOS ${tagName}`,
    body: notes,
    draft: false,
    prerelease: false
  });

  const release = await new Promise((resolve, reject) => {
    const req = https.request('https://api.github.com/repos/msharaf221/MOBPOS-V2/releases', {
      method: 'POST',
      headers: {
        'User-Agent': 'Node-Release-Publisher',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(releasePayload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to create release (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(releasePayload);
    req.end();
  });

  console.log(`Release created successfully! URL: ${release.html_url}`);

  // Upload Asset
  const assetPath = path.join(REPO_ROOT, 'release', `MOBPOS-v${version}-Windows-x64.zip`);
  if (fs.existsSync(assetPath)) {
    const stat = fs.statSync(assetPath);
    console.log(`Uploading asset ${path.basename(assetPath)} (${Math.round(stat.size / 1024 / 1024)} MB)...`);

    const uploadUrl = release.upload_url.replace(/\{(\?name,label)?\}/, '') + `?name=${encodeURIComponent(path.basename(assetPath))}`;
    const uploadStream = fs.createReadStream(assetPath);

    await new Promise((resolve, reject) => {
      const u = new URL(uploadUrl);
      const req = https.request({
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'User-Agent': 'Node-Release-Publisher',
          'Authorization': `token ${token}`,
          'Content-Type': 'application/zip',
          'Content-Length': stat.size
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Asset uploaded successfully!');
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Failed to upload asset (${res.statusCode}): ${data}`));
          }
        });
      });
      req.on('error', reject);
      uploadStream.pipe(req);
    });
  }

  console.log(`\n🎉 Release ${tagName} is published and live!`);
}

main().catch(err => {
  console.error('Error publishing release:', err);
  process.exit(1);
});
