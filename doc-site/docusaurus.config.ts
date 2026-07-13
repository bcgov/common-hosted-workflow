import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Common Hosted Workflow',
  tagline: 'Platform documentation for CHW',
  favicon: 'img/favicon.ico',

  url: process.env.DOCS_URL ?? 'http://localhost',
  baseUrl: process.env.DOCS_BASE_URL ?? '/',

  organizationName: 'bcgov',
  projectName: 'common-hosted-workflow',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [{ from: '/', to: '/development-setup/local-development-environment' }],
      },
    ],
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsDir: '../docs',
        docsRouteBasePath: '/',
        indexBlog: false,
        searchBarShortcut: false,
        searchBarShortcutHint: false,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Common Hosted Workflow',
      logo: {
        alt: 'BC Government Logo',
        src: 'img/logo.png',
        href: '/development-setup/local-development-environment',
      },
      items: [
        {
          href: 'https://github.com/bcgov/common-hosted-workflow',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Government of British Columbia`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['yaml', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
