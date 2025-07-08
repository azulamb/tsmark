import type { RefDef, TsmarkNode } from '../types.d.ts';
import {
  decodeEntities,
  escapeHTML,
  indentWidth,
  stripColumns,
  stripIndent,
  stripLazy,
  unescapeMd,
} from '../utils.ts';

export function parseCodeBlock(
  lines: string[],
  start: number,
): { node: TsmarkNode; next: number } | null {
  const line = lines[start];
  const stripped = stripLazy(line);

  const fenceMatch = stripped.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (fenceMatch && indentWidth(fenceMatch[1]) <= 3) {
    const char = fenceMatch[2][0];
    const rest = fenceMatch[3];
    if (!(char === '`' && rest.includes('`'))) {
      const fenceIndent = indentWidth(fenceMatch[1]);
      const fence = fenceMatch[2];
      const info = fenceMatch[3].trim();
      const language = info
        ? decodeEntities(unescapeMd(info.split(/\s+/)[0]))
        : undefined;
      let i = start + 1;
      const codeLines: string[] = [];
      function isClosing(ln: string): boolean {
        if (indentWidth(ln) > 3) return false;
        const trimmed = ln.trimStart();
        if (!trimmed.startsWith(fence[0])) return false;
        let cnt = 0;
        while (cnt < trimmed.length && trimmed[cnt] === fence[0]) cnt++;
        if (cnt < fence.length) return false;
        return trimmed.slice(cnt).trim() === '';
      }
      while (i < lines.length) {
        const ln = stripLazy(lines[i]);
        if (isClosing(ln)) {
          break;
        }
        codeLines.push(stripColumns(ln, fenceIndent));
        i++;
      }
      const closed = i < lines.length && isClosing(stripLazy(lines[i]));
      if (closed) {
        i++;
      } else {
        while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
          codeLines.pop();
        }
      }
      const body = codeLines.join('\n');
      return {
        node: {
          type: 'code_block',
          content: body + (codeLines.length > 0 ? '\n' : ''),
          language,
        },
        next: i,
      };
    }
  }

  if (indentWidth(line) >= 4) {
    let i = start;
    const codeLines: string[] = [];
    while (
      i < lines.length &&
      (indentWidth(lines[i]) >= 4 || stripLazy(lines[i]).trim() === '')
    ) {
      codeLines.push(stripLazy(lines[i]));
      i++;
    }
    while (codeLines.length > 0 && codeLines[0].trim() === '') {
      codeLines.shift();
    }
    while (
      codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === ''
    ) {
      codeLines.pop();
    }
    const content = codeLines.map((l) => stripIndent(l)).join('\n');
    return { node: { type: 'code_block', content: content + '\n' }, next: i };
  }

  return null;
}

export function codeBlockToHTML(
  node: TsmarkNode & { type: 'code_block' },
  _refs?: Map<string, RefDef>,
): string {
  const escaped = escapeHTML(node.content);
  const langClass = node.language
    ? ` class="language-${escapeHTML(node.language)}"`
    : '';
  return `<pre><code${langClass}>${escaped}</code></pre>`;
}
