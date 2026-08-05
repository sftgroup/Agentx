// app/docs/sdk/page.tsx — Live SDK documentation
// Server component renders the repo's sdk/README.md on every request, so the
// docs site always reflects the latest published SDK version. Markdown is
// converted server-side with marked (CJS — avoids the react-markdown ESM
// dependency graph that crashes the Next webpack build on Node 20).
import fs from 'fs'
import path from 'path'
import { marked } from 'marked'
import { AppLayout } from '@/components/layout/AppLayout'

// Re-read the README on every request so users always see the latest content
export const dynamic = 'force-dynamic'

export default function SdkDocsPage() {
  const readmePath = path.join(process.cwd(), '..', 'sdk', 'README.md')
  let content = ''
  try {
    content = fs.readFileSync(readmePath, 'utf8')
  } catch {
    content =
      '# SDK 文档\n\nREADME 未找到。请确认仓库结构包含 `sdk/README.md`，或访问 [GitHub](https://github.com/sftgroup/Agentx/tree/main/sdk) 查看。'
  }

  // The README is first-party content, safe to render as trusted HTML
  const html = marked.parse(content) as string

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="mb-6">
          <h1 className="heading-md">SDK Documentation</h1>
          <p className="body text-text-secondary mt-1">
            Rendered live from <code className="text-[13px] bg-bg-card px-1.5 py-0.5 rounded">sdk/README.md</code> — always reflects the latest npm release. Full source:{' '}
            <a href="https://github.com/sftgroup/Agentx/tree/main/sdk" className="text-accent-purple hover:underline" target="_blank" rel="noreferrer">GitHub</a>
          </p>
        </div>
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </AppLayout>
  )
}
