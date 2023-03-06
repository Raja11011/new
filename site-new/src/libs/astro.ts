import fs from 'node:fs'
import path from 'node:path'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import type { AstroIntegration } from 'astro'
import autoImport from 'astro-auto-import'
import type { Element } from 'hast'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { getConfig } from './config'
import { rehypeBsTable } from './rehype'
import { remarkBsConfig, remarkBsDocsref } from './remark'
import { configurePrism } from './prism'

// TODO(HiDeoo) Fix path when moving to `site`
// The docs directory path relative to the root of the project.
const docsDirectory = 'site-new'

// A list of directories in `src/components` that contains components that will be auto imported in all pages for
// convenience.
// Note: adding a new component to one of the existing directories requires a restart of the dev server.
const autoImportedComponentDirectories = ['shortcodes']

// A list of static file paths that will be aliased to a different path.
const staticFileAliases = {
  '/docs/[version]/assets/img/favicons/apple-touch-icon.png': '/apple-touch-icon.png',
  '/docs/[version]/assets/img/favicons/favicon.ico': '/favicon.ico',
}

// A list of pages that will be excluded from the sitemap.
const sitemapExcludes = ['/404', '/docs', `/docs/${getConfig().docs_version}`]

const headingsRangeRegex = new RegExp(`^h[${getConfig().anchors.min}-${getConfig().anchors.max}]$`)

export function bootstrap(): AstroIntegration[] {
  const sitemapExcludedUrls = sitemapExcludes.map((url) => `${getConfig().baseURL}${url}/`)

  configurePrism()

  return [
    bootstrap_auto_import(),
    {
      name: 'bootstrap-integration',
      hooks: {
        'astro:config:setup': ({ addWatchFile, updateConfig }) => {
          // Reload the config when the integration is modified.
          addWatchFile(path.join(getDocsPath(), 'src/libs/astro.ts'))

          // Add the remark and rehype plugins.
          updateConfig({
            markdown: {
              rehypePlugins: [
                rehypeHeadingIds,
                [
                  rehypeAutolinkHeadings,
                  {
                    behavior: 'append',
                    content: [{ type: 'text', value: ' ' }],
                    properties: { class: 'anchor-link' },
                    test: (element: Element) => element.tagName.match(headingsRangeRegex),
                  },
                ],
                rehypeBsTable,
              ],
              remarkPlugins: [remarkBsConfig, remarkBsDocsref],
            },
          })
        },
        'astro:config:done': ({}) => {
          cleanPublicDirectory()
          copyBootstrap()
          copyStatic()
          aliasStatic()
        },
      },
    },
    mdx(),
    sitemap({
      filter: (page) => sitemapFilter(page, sitemapExcludedUrls),
    }),
  ]
}

function bootstrap_auto_import() {
  const autoImportedComponents: string[] = []

  for (const autoImportedComponentDirectory of autoImportedComponentDirectories) {
    const components = fs.readdirSync(path.join(getDocsPath(), 'src/components', autoImportedComponentDirectory), {
      withFileTypes: true,
    })

    for (const component of components) {
      if (component.isFile()) {
        autoImportedComponents.push(
          `./${path.posix.join(docsDirectory, 'src/components', autoImportedComponentDirectory, component.name)}`
        )
      }
    }
  }

  return autoImport({
    imports: autoImportedComponents,
  })
}

function cleanPublicDirectory() {
  fs.rmSync(getDocsPublicPath(), { force: true, recursive: true })
}

// Copy the `dist` folder from the root of the repo containing the latest version of Bootstrap to make it available from
// the `/docs/${docs_version}/dist` URL.
function copyBootstrap() {
  const source = path.join(process.cwd(), 'dist')
  const destination = path.join(getDocsPublicPath(), 'docs', getConfig().docs_version, 'dist')

  fs.mkdirSync(destination, { recursive: true })
  fs.cpSync(source, destination, { recursive: true })
}

// Copy the content as-is of the `static` folder to make it available from the `/` URL.
// A folder named `[version]` will automatically be renamed to the current version of the docs extracted from the
// `config.yml` file.
function copyStatic() {
  const source = getDocsStaticPath()
  const destination = path.join(getDocsPublicPath())

  copyStaticRecursively(source, destination)
}

// Alias (copy) some static files to different paths.
function aliasStatic() {
  const source = getDocsStaticPath()
  const destination = path.join(getDocsPublicPath())

  for (const [aliasSource, aliasDestination] of Object.entries(staticFileAliases)) {
    fs.cpSync(path.join(source, aliasSource), path.join(destination, aliasDestination))
  }
}

// See `copyStatic()` for more details.
function copyStaticRecursively(source: string, destination: string) {
  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isFile()) {
      fs.cpSync(path.join(source, entry.name), replacePathVersionPlaceholder(path.join(destination, entry.name)))
    } else if (entry.isDirectory()) {
      fs.mkdirSync(replacePathVersionPlaceholder(path.join(destination, entry.name)), { recursive: true })

      copyStaticRecursively(path.join(source, entry.name), path.join(destination, entry.name))
    }
  }
}

function replacePathVersionPlaceholder(name: string) {
  return name.replace('[version]', getConfig().docs_version)
}

export function getDocsStaticPath() {
  return path.join(getDocsPath(), 'static')
}

function getDocsPublicPath() {
  return path.join(getDocsPath(), 'public')
}

function getDocsPath() {
  return path.join(process.cwd(), docsDirectory)
}

function sitemapFilter(page: string, excludedUrls: string[]) {
  if (excludedUrls.includes(page)) {
    return false
  }

  return true
}