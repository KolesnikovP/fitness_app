// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const fs = require('node:fs');
const path = require('node:path');

const globals = require('globals');

// Feature-Sliced layers, lowest first (see README "Layout"). A layer imports
// only from layers below it, through each slice's index.ts; slices of one
// layer don't import each other. The one door between entities is @x: an
// entity may import '@/entities/<other>/@x/<itself>', which <other> exports
// for it alone.
const layers = ['shared', 'entities', 'features', 'widgets', 'screens', 'app'];
const DEEP = "Import a slice through its index.ts, e.g. '@/entities/workout'.";

function importRule(files, patterns) {
  return { files, rules: { 'no-restricted-imports': ['error', { patterns }] } };
}

function aboveRule(layer, above) {
  return above.map((other) => ({
    regex: `^@/${other}(/|$)`,
    message: `${layer} can't import from ${other}, a layer above it.`,
  }));
}

const layerRules = layers.flatMap((layer, i) => {
  const above = aboveRule(layer, layers.slice(i + 1));
  if (layer === 'entities') {
    return fs.readdirSync(path.join(__dirname, 'src/entities')).map((slice) =>
      importRule(
        [`src/entities/${slice}/**`],
        [
          ...above,
          {
            regex: `^@/entities(?!/[^/]+/@x/${slice}$)(/|$)`,
            message: `Entities don't import each other; use what the other entity exports for ${slice} in its @x/${slice}.ts.`,
          },
          { regex: `^@/(?!entities/[^/]+/@x/${slice}$)[^/]+/[^/]+/`, message: DEEP },
        ],
      ),
    );
  }
  const sameLayer =
    layer === 'shared' || layer === 'app'
      ? []
      : [
          {
            regex: `^@/${layer}(/|$)`,
            message: `${layer} slices don't import each other; move what they share down a layer.`,
          },
        ];
  return [importRule([`src/${layer}/**`], [...above, ...sameLayer, { regex: '^@/[^/]+/[^/]+/', message: DEEP }])];
});

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  // React Native's <Text> shows an apostrophe as written; escaping is a web concern.
  { rules: { 'react/no-unescaped-entities': 'off' } },
  // jest.mock factories are hoisted above imports, so they reach their module with require().
  { files: ['jest.setup.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['scripts/**', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  ...layerRules,
]);
