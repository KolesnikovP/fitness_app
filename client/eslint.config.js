// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const fs = require('node:fs');
const path = require('node:path');

const globals = require('globals');

// Feature-Sliced layers, lowest first (see README "Layout"). A layer imports
// only from layers below it, through each slice's index.ts (screens through
// the layer's own index.ts), and slices of one layer don't import each other.
// Shared segments may use each other through their index.ts. The one door
// between entities is @x: an entity may import '@/entities/<other>/@x/<itself>',
// which <other> exports for it alone. Zones match the file an import resolves
// to, so relative imports, import() and require() are held to it too.
const LAYERS = ['shared', 'entities', 'features', 'widgets', 'screens', 'app'];
const PUBLIC_API = ['./index.ts', './index.tsx'];

const srcPath = (...parts) => path.join('src', ...parts);

function slicesOf(layer) {
  return fs
    .readdirSync(path.join(__dirname, 'src', layer), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** Where code in layer/slice (or in the app layer, with no slice) may not import from. */
function zonesFor(layer, slice) {
  const target = slice ? srcPath(layer, slice) : srcPath(layer);
  const at = LAYERS.indexOf(layer);
  const zones = LAYERS.slice(at + 1).map((upper) => ({
    target,
    from: srcPath(upper),
    message: `${layer} can't import from ${upper}, a layer above it.`,
  }));
  for (const lower of LAYERS.slice(0, at)) {
    if (lower === 'screens') {
      zones.push({
        target,
        from: srcPath('screens'),
        except: ['./index.ts'],
        message: "Import screens from '@/screens'.",
      });
      continue;
    }
    zones.push({ target, from: srcPath(lower, 'index.ts'), message: `Import a ${lower} slice from its own index.ts.` });
    for (const other of slicesOf(lower)) {
      zones.push({
        target,
        from: srcPath(lower, other),
        except: PUBLIC_API,
        message: `Import ${lower}/${other} through its index.ts: '@/${lower}/${other}'.`,
      });
    }
  }
  if (!slice) return zones;
  zones.push({ target, from: srcPath(layer, 'index.ts'), message: `Import a ${layer} slice from its own index.ts.` });
  for (const other of slicesOf(layer).filter((s) => s !== slice)) {
    if (layer === 'shared') {
      zones.push({
        target,
        from: srcPath(layer, other),
        except: PUBLIC_API,
        message: `Import shared/${other} through its index.ts: '@/shared/${other}'.`,
      });
    } else if (layer === 'entities') {
      zones.push({
        target,
        from: srcPath(layer, other),
        except: [`./@x/${slice}.ts`],
        message: `Entities don't import each other; use what ${other} exports for ${slice} in '@/entities/${other}/@x/${slice}'.`,
      });
    } else {
      zones.push({
        target,
        from: srcPath(layer, other),
        message: `${layer} slices don't import each other; move what they share down a layer.`,
      });
    }
  }
  return zones;
}

const layerZones = LAYERS.flatMap((layer) =>
  layer === 'app' ? zonesFor(layer) : slicesOf(layer).flatMap((slice) => zonesFor(layer, slice)),
);

// expect(queryBy…(…)).not.toBeVisible() passes on null, and queryBy leaves
// hidden elements out by default, so it can never fail. `key` is where the
// query's name sits on its call: a bare queryByText, or screen.queryByText.
function vacuousHiddenAssertion(key) {
  return {
    selector: `CallExpression[callee.property.name='toBeVisible'][callee.object.property.name='not'][callee.object.object.callee.name='expect'][callee.object.object.arguments.0.callee.${key}=/^query(All)?By/]`,
    message:
      'queryBy finds nothing hidden, so .not.toBeVisible() passes on null. Use getBy with { includeHiddenElements: true } to assert something is mounted but hidden, or expect(queryBy…).toBeNull() to assert it is absent.',
  };
}

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  // React Native's <Text> shows an apostrophe as written; escaping is a web concern.
  { rules: { 'react/no-unescaped-entities': 'off' } },
  // jest.mock factories are hoisted above imports, so they reach their module with require().
  { files: ['jest.setup.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['scripts/**', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  { files: ['src/**'], rules: { 'import/no-restricted-paths': ['error', { zones: layerZones }] } },
  {
    files: ['src/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Property[key.name=/^headerLargeTitle(Enabled)?$/]',
          message:
            "Large titles freeze iOS with Screen's layout when pushed from a screen without a top bar (a native layout loop Jest can't see). Pass headerTitle to Screen for the regular top-bar title.",
        },
      ],
    },
  },
  {
    files: ['__tests__/**'],
    rules: {
      'no-restricted-syntax': ['error', ...['name', 'property.name'].map(vacuousHiddenAssertion)],
    },
  },
]);
