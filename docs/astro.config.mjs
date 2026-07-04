import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import remarkGfm from 'remark-gfm'
import starlightLlmsTxt from 'starlight-llms-txt'

// starlight-package-managers is a component library (not a Starlight plugin).
// Import PackageManagers directly in .mdx files when needed:
//   import { PackageManagers } from 'starlight-package-managers'

export default defineConfig({
  site: 'https://rrule.codewithagents.de',
  base: '/',
  // Explicitly enable GFM so markdown tables render in .mdx files.
  markdown: {
    remarkPlugins: [remarkGfm],
  },
  integrations: [
    starlight({
      plugins: [
        starlightLlmsTxt({
          promote: ['getting-started*', 'conformance*'],
        }),
      ],
      title: 'rrule-ts',
      description:
        'RFC 5545 RRULE parser, validator, stringifier, and expander. Temporal-native, zero runtime dependencies.',
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:title',
            content: 'rrule-ts: RFC 5545 RRULE for TypeScript, Temporal-native',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:description',
            content:
              'RFC 5545 RRULE parser, validator, stringifier, and expander. Temporal-native, zero runtime dependencies.',
          },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:title',
            content: 'rrule-ts: RFC 5545 RRULE for TypeScript, Temporal-native',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:description',
            content:
              'RFC 5545 RRULE parser, validator, stringifier, and expander. Temporal-native, zero runtime dependencies.',
          },
        },
      ],
      logo: {
        src: './src/assets/logo-cairn.svg',
        alt: 'rrule-ts',
      },
      favicon: '/favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/codewithagents/rrule',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Footer: './src/components/Footer.astro',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Parsing', slug: 'guides/parsing' },
            { label: 'Validation', slug: 'guides/validation' },
            { label: 'Stringifying', slug: 'guides/stringify' },
            { label: 'Expansion', slug: 'guides/expansion' },
            { label: 'RRuleSet', slug: 'guides/rruleset' },
            { label: 'Timezones and DST', slug: 'guides/timezones-dst' },
            { label: 'BYWEEKNO and year boundaries', slug: 'guides/byweekno' },
            { label: 'toText and fromText', slug: 'guides/totext-fromtext' },
            { label: 'i18n locales', slug: 'guides/i18n-locales' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'API surface', slug: 'reference/api' }],
        },
        {
          label: 'Conformance',
          items: [
            { label: 'Differential conformance suite', slug: 'conformance/differential-suite' },
          ],
        },
      ],
    }),
  ],
})
