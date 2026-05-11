import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginImportX from 'eslint-plugin-import-x';
import pluginCommunityNodes from '@n8n/eslint-plugin-community-nodes';
import pluginN8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

const allCredRules = Object.keys(pluginN8nNodesBase.configs.credentials.rules).reduce((acc, rule) => {
  acc[rule] = 'off';
  return acc;
}, {});

const allNodeRules = Object.keys(pluginN8nNodesBase.configs.nodes.rules).reduce((acc, rule) => {
  acc[rule] = 'off';
  return acc;
}, {});

const allCommunityRules = Object.keys(pluginN8nNodesBase.configs.community.rules).reduce((acc, rule) => {
  acc[rule] = 'off';
  return acc;
}, {});

export default tseslint.config(
  { ignores: ['dist'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  pluginCommunityNodes.configs.recommendedWithoutN8nCloudSupport,
  {
    plugins: {
      'import-x': pluginImportX,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
    rules: {
      ...pluginImportX.configs['flat/recommended'].rules,
    },
  },
  {
    plugins: {
      'n8n-nodes-base': pluginN8nNodesBase,
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'prefer-spread': 'off',
      'no-console': 'error',
    },
  },
  {
    files: ['package.json'],
    rules: {
      ...allCommunityRules,
      '@typescript-eslint/no-unused-expressions': 'off',
      '@n8n/community-nodes/package-name-convention': 'off',
      '@n8n/community-nodes/require-community-node-keyword': 'warn',
      '@n8n/community-nodes/valid-peer-dependencies': 'off',
      '@n8n/community-nodes/no-runtime-dependencies': 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        extraFileExtensions: ['.json'],
      },
    },
  },
  {
    files: ['./credentials/**/*.ts'],
    rules: {
      ...allCredRules,
      'import-x/named': 'off',
      '@n8n/community-nodes/credential-test-required': 'off',
    },
  },
  {
    files: ['./nodes/**/*.ts'],
    rules: {
      ...allNodeRules,
      'import-x/named': 'off',
      'import-x/no-unresolved': 'off',
      '@n8n/community-nodes/icon-validation': 'off',
      '@n8n/community-nodes/credential-documentation-url': 'off',
      '@n8n/community-nodes/require-continue-on-fail': 'off',
      '@n8n/community-nodes/require-node-api-error': 'off',
      '@n8n/community-nodes/missing-paired-item': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-console': 'off',
      'import-x/no-unresolved': 'off',
    },
  },
);
