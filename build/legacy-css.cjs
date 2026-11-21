const path = require('node:path');
const postcss = require('postcss');
const tailwind = require('tailwindcss-legacy');
const plugin = require('tailwindcss-legacy/plugin');

// Tailwind 4 requires Chromium 111+. Electron 22, the last Windows 7
// runtime, uses Chromium 108. Compile this target with Tailwind 3.4 instead
// of trying to polyfill only one of v4's modern CSS features.
async function compileLegacyCss(source, root) {
  const config = {
    content: [path.join(root, 'index.html'), path.join(root, 'src/**/*.{js,ts,jsx,tsx}')],
    darkMode: 'class',
    theme: {
      extend: {
        // Keep the v4 names used by existing components.
        boxShadow: {
          xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        },
        borderRadius: { xs: '0.125rem', sm: '0.25rem' },
      },
    },
    plugins: [plugin(({ addUtilities }) => {
      addUtilities({ '.outline-hidden': { outline: '2px solid transparent', outlineOffset: '2px' } });
    })],
  };
  const css = source
    .replace('@import "tailwindcss";', '@tailwind base;\n@tailwind components;\n@tailwind utilities;')
    .replace(/@custom-variant dark[^;]+;/, '');
  const result = await postcss([tailwind(config)]).process(css, {
    from: path.join(root, 'src/index.css'), map: false,
  });
  return result.css;
}

function legacyCssPlugin(root) {
  return {
    name: 'mobpos-chromium108-css',
    enforce: 'pre',
    async transform(source, id) {
      if (id.split('?')[0] !== path.join(root, 'src/index.css')) return null;
      return { code: await compileLegacyCss(source, root), map: null };
    },
  };
}

module.exports = { compileLegacyCss, legacyCssPlugin };
