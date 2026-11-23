// Use a separate Electron 22.3.27 executable, not the modern devDependency.
// ELECTRON22_EXECUTABLE=/path/to/electron xvfb-run -a npm run test:win7
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, cp, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright');

test('production renderer on the actual Electron 22 engine', async () => {
  const executablePath = process.env.ELECTRON22_EXECUTABLE;
  assert.ok(executablePath, 'Set ELECTRON22_EXECUTABLE to an Electron 22.3.27 executable');
  const userData = await mkdtemp(path.join(os.tmpdir(), 'mobpos-win7-test-'));
  const fixture = path.join(userData, 'app');
  await cp(path.resolve(__dirname, '../../electron'), path.join(fixture, 'electron'), { recursive: true });
  await cp(path.resolve(__dirname, '../../dist-win7'), path.join(fixture, 'dist'), { recursive: true });
  await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'mobpos-win7-test', version: '1.0.38', main: 'electron/main.cjs' }));
  const errors = [];
  const app = await electron.launch({ executablePath,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), fixture, `--user-data-dir=${userData}`],
    env: { ...process.env, NODE_ENV: 'test', MOBPOS_ELECTRON_DEV: '0', XDG_CONFIG_HOME: userData, APPDATA: userData },
  });
  try {
    const versions = await app.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
    assert.equal(versions.electron, '22.3.27');
    assert.match(versions.chrome, /^108\./);
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'تفعيل', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.mobpos.isDesktop), true, 'Real sandboxed preload must work');
    assert.equal(await page.evaluate(() => document.querySelector('.mobpos-splash')), null);
    await page.evaluate(() => {
      const samples = ['bg-blue-600', 'bg-blue-500/20', 'bg-gradient-to-b from-blue-900 to-blue-800', 'blur-3xl bg-blue-500', 'shadow-lg', 'focus:outline-hidden'];
      const section = document.createElement('section');
      section.id = 'win7-probes';
      section.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;padding:12px;background:white;color:black';
      for (const className of samples) {
        const item = document.createElement('div');
        item.className = className;
        item.textContent = className;
        item.style.cssText = 'width:260px;height:36px;margin:10px;padding:8px';
        section.appendChild(item);
      }
      document.body.appendChild(section);
    });
    const styles = await page.locator('#win7-probes > div').evaluateAll(elements => elements.map(element => {
      const css = getComputedStyle(element);
      return { background: css.backgroundColor, image: css.backgroundImage, filter: css.filter, shadow: css.boxShadow };
    }));
    assert.notEqual(styles[0].background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(styles[1].background, 'rgba(0, 0, 0, 0)');
    assert.match(styles[2].image, /^linear-gradient/);
    assert.match(styles[3].filter, /^blur\(/);
    assert.notEqual(styles[4].shadow, 'none');
    await page.locator('#win7-probes').evaluate(element => element.remove());
    if (process.env.WIN7_SCREENSHOT) await page.screenshot({ path: process.env.WIN7_SCREENSHOT });
    assert.deepEqual(errors, []);
    // Exercise the independent boot guard with a forced module-start failure.
    await page.evaluate(() => { document.getElementById('root').innerHTML = '<div class="mobpos-splash">loading</div>'; });
    // Production CSP stays enabled: load the guard from the same local server.
    await page.addScriptTag({ url: new URL('/boot-diagnostics.js', page.url()).href });
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic test startup error' })));
    await page.getByText('تعذر تشغيل واجهة MOBPOS', { exact: true }).waitFor();
    assert.match(await page.locator('#root').innerText(), /UI-START/);
    if (process.env.WIN7_SCREENSHOT) await page.screenshot({ path: process.env.WIN7_SCREENSHOT.replace(/\.png$/, '-diagnostic.png') });
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('development-only demo screens on Chromium 108', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ mode: 'win7', server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const app = await electron.launch({ executablePath: process.env.ELECTRON22_EXECUTABLE,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.resolve(__dirname, 'fixtures/win7-demo.cjs')],
    env: { ...process.env, WIN7_DEMO_URL: `${server.resolvedUrls.local[0]}?demo=1` },
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'نقطة البيع', exact: true }).waitFor();
    for (const [label, key] of [['لوحة التحكم','dashboard'], ['المخزون','inventory'], ['نقطة البيع','pos'], ['الإعدادات','settings']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(350);
      assert.ok((await page.locator('#root').innerText()).length > 200, `${key} must render`);
      if (process.env.WIN7_SCREENSHOT) await page.screenshot({ path: process.env.WIN7_SCREENSHOT.replace(/\.png$/, `-${key}.png`) });
    }
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
    await server.close();
  }
});


test('Arabic-Indic digits type into numeric and text fields on Chromium 108', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ mode: 'win7', server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const app = await electron.launch({ executablePath: process.env.ELECTRON22_EXECUTABLE,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), path.resolve(__dirname, 'fixtures/win7-demo.cjs')],
    env: { ...process.env, WIN7_DEMO_URL: `${server.resolvedUrls.local[0]}?demo=1` },
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'نقطة البيع', exact: true }).waitFor();
    await page.getByRole('button', { name: 'المخزون', exact: true }).click();
    await page.locator('button[title="تعديل"]').first().click();
    const modal = page.locator('.modal-overlay > div');
    // Arabic keyboards on Windows emit Eastern Arabic digits (٠-٩). Chromium
    // silently rejects them in type=number fields (deletes work, typing does
    // nothing) and stores them unsearchable in text fields. The global
    // beforeinput fix must normalize them to ASCII before React sees them.
    const numInput = modal.locator('input[type="number"]').first();
    await numInput.click({ force: true });
    await numInput.fill('150');
    await numInput.press('ControlOrMeta+a');
    await page.keyboard.insertText('٢٧٥٫٥');
    assert.equal(await numInput.inputValue(), '275.5');
    const barcodeInput = modal.locator('input[placeholder="امسح أو اكتب الباركود..."]');
    await barcodeInput.click({ force: true });
    await barcodeInput.fill('');
    await page.keyboard.insertText('٦٢٢١٢٣٤٥');
    assert.equal(await barcodeInput.inputValue(), '62212345');
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
    await server.close();
  }
});

test('legacy CSS transform accepts normalized and Windows module IDs', async () => {
  const { readFile } = require('node:fs/promises');
  const { legacyCssPlugin } = require('../../build/legacy-css.cjs');
  const root = path.resolve(__dirname, '../..');
  const source = await readFile(path.join(root, 'src/index.css'), 'utf8');
  const plugin = legacyCssPlugin(root);
  const id = path.join(root, 'src/index.css');
  for (const candidate of [id.replaceAll('\\', '/'), id.replaceAll('/', '\\')]) {
    const output = await plugin.transform(source, candidate + '?direct');
    assert.ok(output, 'Legacy compiler must not silently skip Windows paths');
    assert.match(output.code, /\.blur-3xl/);
    assert.doesNotMatch(output.code, /color-mix\(|@property\b/);
  }
});
