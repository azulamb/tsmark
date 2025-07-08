import type { TsmarkNode } from '../types.d.ts';
import { indentWidth, LAZY, stripColumns, stripLazy } from '../utils.ts';

export function parseBlockquote(
  lines: string[],
  start: number,
  parseFn: (md: string) => TsmarkNode[],
): { node: TsmarkNode; next: number } | null {
  const first = stripLazy(lines[start]);
  if (!/^ {0,3}>/.test(first)) {
    return null;
  }

  let i = start;
  const bqLines: string[] = [];
  let prevBlank = false;
  let fence: { char: string; len: number } | null = null;

  while (i < lines.length) {
    const current = stripLazy(lines[i]);
    const m = current.match(/^ {0,3}>(.*)$/);
    if (m) {
      let rest = m[1];
      if (rest.startsWith(' ')) {
        rest = rest.slice(1);
      } else if (rest.startsWith('\t')) {
        rest = '  ' + rest.slice(1);
      }
      rest = rest.replace(/\t/g, '    ');
      const fm = rest.match(/^(`{3,}|~{3,})/);
      if (fm) {
        const ch = fm[1][0];
        const len = fm[1].length;
        if (!fence) {
          fence = { char: ch, len };
        } else if (fence.char === ch && len >= fence.len) {
          fence = null;
        }
      }
      bqLines.push(rest);
      prevBlank = rest.trim() === '';
      i++;
    } else if (current.trim() === '') {
      break;
    } else if (
      fence === null &&
      indentWidth(lines[i]) <= 3 &&
      !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:\*|_|-){3,}\s*$)/.test(current) &&
      !/^(?:\s*)(`{3,}|~{3,})/.test(current) &&
      !/^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:\s|$)/.test(current)
    ) {
      if (prevBlank) {
        break;
      }
      bqLines.push(
        LAZY + stripColumns(lines[i], Math.min(indentWidth(lines[i]), 3)),
      );
      prevBlank = false;
      i++;
    } else if (
      fence === null &&
      indentWidth(lines[i]) > 3 &&
      !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:\*|_|-){3,}\s*$)/.test(current) &&
      !/^(?:\s*)(`{3,}|~{3,})/.test(current) &&
      !/^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:\s|$)/.test(current) &&
      !prevBlank &&
      indentWidth(stripLazy(bqLines[bqLines.length - 1] ?? '')) <= 3
    ) {
      bqLines.push(
        LAZY + stripColumns(lines[i], Math.min(indentWidth(lines[i]), 3)),
      );
      prevBlank = false;
      i++;
    } else {
      break;
    }
  }

  const children = parseFn(bqLines.join('\n'));
  return { node: { type: 'blockquote', children }, next: i };
}
