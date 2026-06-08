import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'AgentCore Central',
  tagline: 'Everything you need to position, design, and ship agents on Amazon Bedrock AgentCore',
  favicon: 'img/favicon.ico',

  url: 'https://agentcore-central.pages.aws.dev',
  baseUrl: '/',

  organizationName: 'agentcore-gtm',
  projectName: 'agentcore-central',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  headTags: [
    {
      tagName: 'script',
      attributes: {},
      innerHTML: `(function(n,i,v,r,s,c,x,z){x=window.AwsRumClient={q:[],n:n,i:i,v:v,r:r,c:c};window[n]=function(c,p){x.q.push({c:c,p:p});};z=document.createElement('script');z.async=true;z.src=s;document.head.insertBefore(z,document.head.getElementsByTagName('script')[0]);})('cwr','c45f0e37-f598-4635-94d6-7660b7da8aed','1.0.0','us-east-1','https://client.rum.us-east-1.amazonaws.com/1.19.0/cwr.js',{sessionSampleRate:1,identityPoolId:"us-east-1:fe31edca-34bb-4072-8da4-59b354ac9a0a",endpoint:"https://dataplane.rum.us-east-1.amazonaws.com",telemetries:["performance","errors","http"],allowCookies:true,enableXRay:false,signing:true});`,
    },
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: '/',
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'AgentCore Central',
      logo: {
        alt: 'AgentCore Central Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://agentcore-catalog.beta.harmony.a2z.com/',
          label: 'Resources Catalog',
          position: 'right',
        },
        {
          href: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html',
          label: 'AWS Docs',
          position: 'right',
        },
        {
          href: 'https://strandsagents.com',
          label: 'Strands SDK',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Agent Archetypes',
          items: [
            {label: 'Conversational Agents', to: '/archetypes/conversational'},
            {label: 'Event-Driven Agents', to: '/archetypes/event-driven'},
            {label: 'Coding Agents', to: '/archetypes/coding'},
          ],
        },
        {
          title: 'Reference',
          items: [
            {label: 'Architectural Patterns', to: '/patterns/overview'},
            {label: 'Reference Architectures', to: '/reference-architectures'},
          ],
        },
        {
          title: 'Resources',
          items: [
            {label: 'AgentCore Documentation', href: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html'},
            {label: 'Strands SDK', href: 'https://strandsagents.com'},
            {label: 'GitHub', href: 'https://github.com/strands-agents/sdk-python'},
          ],
        },
      ],
      copyright: `AgentCore Central — v1.0 — Built by the AgentCore Team`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'python', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
