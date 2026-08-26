'use client'

import type { ReactNode } from 'react'

/** Turn common LaTeX dumps into plain readable text. */
export function stripLatex(input: string): string {
  let s = input
  // Display math \[ ... \] and $$ ... $$
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => latexToPlain(body))
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, body: string) => latexToPlain(body))
  // Inline \( ... \) — keep $ amounts like $48 alone (not math)
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => latexToPlain(body))
  return s
}

function latexToPlain(raw: string): string {
  let s = raw.trim()
  s = s.replace(/\\text\{([^}]*)\}/g, '$1')
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1')
  s = s.replace(/\\mathbf\{([^}]*)\}/g, '$1')
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)')
  s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
  s = s.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']')
  s = s.replace(/\\times/g, '×')
  s = s.replace(/\\div/g, '÷')
  s = s.replace(/\\approx/g, '≈')
  s = s.replace(/\\cdot/g, '·')
  s = s.replace(/\\,/g, ' ')
  s = s.replace(/\\;/g, ' ')
  s = s.replace(/\\ /g, ' ')
  s = s.replace(/\\\\/g, '\n')
  s = s.replace(/[{}]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // **bold**, *italic*, `code`, [link](url)
  const re =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) != null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index))
    }
    const token = m[0]
    const k = `${keyPrefix}-${i++}`
    if (token.startsWith('**')) {
      nodes.push(<strong key={k}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      nodes.push(<em key={k}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={k}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) {
        nodes.push(
          <a
            key={k}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {link[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    } else {
      nodes.push(token)
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    if (line.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push({
        type: 'h',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      })
      i++
      continue
    }

    if (line.startsWith('> ')) {
      const parts: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        parts.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'quote', text: parts.join('\n') })
      continue
    }

    if (/^\|.+\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      const splitRow = (row: string) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const headers = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|.+\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    const parts: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^> /.test(lines[i]) &&
      !lines[i].startsWith('```') &&
      !/^\|.+\|/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      parts.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', text: parts.join('\n') })
  }

  return blocks
}

export function AssistantMarkdown({
  text,
}: {
  text: string
  tone?: 'assistant' | 'user'
}) {
  const cleaned = stripLatex(text)
  const blocks = parseBlocks(cleaned)

  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {blocks.map((block, idx) => {
        const key = `b-${idx}`
        switch (block.type) {
          case 'h': {
            const cls =
              block.level === 1
                ? 'text-base font-semibold tracking-tight'
                : block.level === 2
                  ? 'text-sm font-semibold tracking-tight'
                  : 'text-sm font-semibold'
            return (
              <p key={key} className={cls}>
                {renderInline(block.text, key)}
              </p>
            )
          }
          case 'p':
            return (
              <p key={key} className="whitespace-pre-wrap">
                {renderInline(block.text, key)}
              </p>
            )
          case 'ul':
            return (
              <ul key={key} className="list-disc space-y-1 ps-5">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key} className="list-decimal space-y-1 ps-5">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            )
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-s-2 border-current/30 ps-3 italic opacity-90"
              >
                {renderInline(block.text, key)}
              </blockquote>
            )
          case 'code':
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg bg-black/10 px-3 py-2 font-mono text-xs"
              >
                <code>{block.text}</code>
              </pre>
            )
          case 'table':
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-current/15">
                <table className="w-full min-w-[280px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-current/15 bg-black/5">
                      {block.headers.map((h, j) => (
                        <th key={`${key}-h-${j}`} className="px-2.5 py-1.5 font-semibold">
                          {renderInline(h, `${key}-h-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r-${r}`} className="border-b border-current/10 last:border-0">
                        {row.map((cell, c) => (
                          <td key={`${key}-r-${r}-c-${c}`} className="px-2.5 py-1.5 tabular-nums">
                            {renderInline(cell, `${key}-r-${r}-c-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <hr key={key} className="border-current/20" />
          default:
            return null
        }
      })}
    </div>
  )
}
