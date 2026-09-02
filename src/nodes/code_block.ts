import type { TsmarkNode } from '../types.d.ts';
import {
  decodeEntities,
  indentWidth,
  stripColumns,
  stripIndent,
  stripLazy,
  unescapeMd,
} from '../utils.ts';

function isClosingFence(line: string, fence: string): boolean {
  if (indentWidth(line) > 3) return false;
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(fence[0])) return false;
  let count = 0;
  while (count < trimmed.length && trimmed[count] === fence[0]) count++;
  return count >= fence.length && trimmed.slice(count).trim() === '';
}

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
      const decodedInfo = info ? decodeEntities(unescapeMd(info)) : undefined;
      let i = start + 1;
      const codeLines: string[] = [];
      while (i < lines.length) {
        const ln = stripLazy(lines[i]);
        if (isClosingFence(ln, fence)) {
          break;
        }
        codeLines.push(stripColumns(ln, fenceIndent));
        i++;
      }
      const closed = i < lines.length &&
        isClosingFence(stripLazy(lines[i]), fence);
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
          info: decodedInfo,
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
