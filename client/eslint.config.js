// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  // React Native's <Text> shows an apostrophe as written; escaping is a web concern.
  { rules: { 'react/no-unescaped-entities': 'off' } },
  // jest.mock factories are hoisted above imports, so they reach their module with require().
  { files: ['jest.setup.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['scripts/**'], languageOptions: { globals: globals.node } },
]);
