import type { RefDef, TsmarkNode } from './types.d.ts';
import { parseATXHeading } from './nodes/heading.ts';
import { parseParagraph } from './nodes/paragraph.ts';
import { parseCodeBlock } from './nodes/code_block.ts';
import { parseList } from './nodes/list.ts';
import { parseBlockquote } from './nodes/blockquote.ts';
import { parseThematicBreak } from './nodes/thematic_break.ts';
import { parseHtmlBlock } from './nodes/html.ts';
import {
  indentWidth,
  isValidLabel,
  normalizeLabel,
  stripLazy,
  unescapeMd,
} from './utils.ts';

function parseBlocks(md: string, refs: Map<string, RefDef>): TsmarkNode[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const nodes: TsmarkNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = stripLazy(line);

    const tbNode = parseThematicBreak(stripped);
    if (tbNode) {
      nodes.push(tbNode);
      i++;
      continue;
    }

    const bqResult = parseBlockquote(lines, i, (src) => parseBlocks(src, refs));
    if (bqResult) {
      nodes.push(bqResult.node);
      i = bqResult.next;
      continue;
    }

    const listResult = parseList(lines, i, (src) => parseBlocks(src, refs));
    if (listResult) {
      nodes.push(listResult.node);
      i = listResult.next;
      continue;
    }

    const codeResult = parseCodeBlock(lines, i);
    if (codeResult) {
      nodes.push(codeResult.node);
      i = codeResult.next;
      continue;
    }

    const atxNode = parseATXHeading(stripped);
    if (atxNode) {
      nodes.push(atxNode);
      i++;
      continue;
    }

    const htmlResult = parseHtmlBlock(lines, i);
    if (htmlResult) {
      nodes.push(htmlResult.node);
      i = htmlResult.next;
      continue;
    }

    if (stripped.trim() !== '') {
      const result = parseParagraph(lines, i);
      if (result) {
        nodes.push(result.node);
        i = result.next;
        continue;
      }
    }

    i++;
  }

  return nodes;
}

export function parse(
  md: string,
): { nodes: TsmarkNode[]; refs: Map<string, RefDef> } {
  const startDef = /^ {0,3}\[((?:\\.|[^\\\[\]])+)\]:\s*(.*)$/;
  const titlePattern =
    /^(<[^>]*>|[^\s<>]+)(?:\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?\s*$/s;
  const refs = new Map<string, RefDef>();
  const filtered: string[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let prevWasDef = false;
  function canStartDef(idx: number): boolean {
    if (idx === 0) return true;
    const prev = lines[idx - 1];
    if (prev.trim() === '') return true;
    if (prevWasDef) return true;
    if (startDef.test(prev)) return true;
    if (/^ {0,3}\[$/.test(prev)) return true;
    if (/^ {0,3}#{1,6}\s/.test(prev)) return true;
    if (/^ {0,3}>/.test(prev)) return true;
    if (/^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:\s|$)/.test(prev)) return true;
    if (/^ {0,3}(`{3,}|~{3,})/.test(prev)) return true;
    if (
      /^ {0,3}(?:\*\s*){3,}$/.test(prev) ||
      /^ {0,3}(?:-\s*){3,}$/.test(prev) ||
      /^ {0,3}(?:_\s*){3,}$/.test(prev)
    ) return true;
    if (indentWidth(prev) >= 4) return true;
    return false;
  }
  let fence: { char: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    const bq = first.match(/^ {0,3}>[ \t]?(.*)$/);
    const lineForDef = bq ? bq[1] : first;
    const fm = first.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fm) {
      const ch = fm[1][0];
      const len = fm[1].length;
      if (!fence) {
        fence = { char: ch, len };
      } else if (fence.char === ch && fm[1].length >= fence.len) {
        fence = null;
      }
    }
    if (fence) {
      filtered.push(first);
      continue;
    }
    const canStart = canStartDef(i);
    let handled = false;
    const m = canStart ? lineForDef.match(startDef) : null;
    if (m) {
      if (isValidLabel(m[1])) {
        let rest = m[2];
        let j = i;
        while (j + 1 < lines.length) {
          const nxt = lines[j + 1];
          const t = nxt.trimStart();
          const restTrim = rest.trim();
          if (titlePattern.test(restTrim)) {
            const combined = `${restTrim}\n${t}`.trim();
            if (!titlePattern.test(combined)) break;
          }
          if (t === '' || startDef.test(nxt)) break;
          rest += '\n' + t;
          j++;
        }
        const nextIdx = j;
        rest = rest.trim();
        const m2 = rest.match(titlePattern);
        if (m2) {
          let url = m2[1];
          if (url.startsWith('<') && url.endsWith('>')) {
            url = url.slice(1, -1);
          }
          const title = m2[2] || m2[3] || m2[4];
          const key = normalizeLabel(m[1]);
          if (key !== '' && !refs.has(key)) {
            refs.set(key, {
              url: unescapeMd(url),
              title: title ? unescapeMd(title) : undefined,
            });
          }
          if (bq) {
            const prefix = first.slice(0, first.length - lineForDef.length);
            filtered.push(prefix.trimEnd());
          }
          if (key !== '') {
            i = nextIdx;
            handled = true;
            prevWasDef = true;
            continue;
          }
        }
      }
    }
    if (!handled) {
      const open = canStart
        ? lineForDef.match(/^ {0,3}\[((?:\\.|[^\\\[\]])*)$/)
        : null;
      if (open) {
        let label = open[1];
        let j = i;
        let rest = '';
        while (j + 1 < lines.length) {
          j++;
          const ln = lines[j];
          const close = ln.match(/^(.*)\]:\s*(.*)$/);
          if (close) {
            if (label) label += '\n';
            label += close[1];
            rest = close[2];
            break;
          }
          if (label) label += '\n';
          label += ln;
        }
        if (rest !== '') {
          while (j + 1 < lines.length) {
            const nxt = lines[j + 1];
            const t = nxt.trimStart();
            const restTrim = rest.trim();
            if (titlePattern.test(restTrim)) {
              const combined = `${restTrim}\n${t}`.trim();
              if (!titlePattern.test(combined)) break;
            }
            if (t === '' || startDef.test(nxt)) break;
            rest += '\n' + t;
            j++;
          }
          const nextIdx = j;
          rest = rest.trim();
          const m2 = rest.match(titlePattern);
          if (m2 && isValidLabel(label)) {
            let url = m2[1];
            if (url.startsWith('<') && url.endsWith('>')) {
              url = url.slice(1, -1);
            }
            const title = m2[2] || m2[3] || m2[4];
            const key = normalizeLabel(label);
            if (key !== '' && !refs.has(key)) {
              refs.set(key, {
                url: unescapeMd(url),
                title: title ? unescapeMd(title) : undefined,
              });
            }
            if (bq) {
              const prefix = first.slice(0, first.length - lineForDef.length);
              filtered.push(prefix.trimEnd());
            }
            if (key !== '') {
              i = nextIdx;
              handled = true;
              prevWasDef = true;
              continue;
            }
          }
        }
      }
    }
    if (!handled) {
      filtered.push(first);
      prevWasDef = false;
    }
  }
  const nodes = parseBlocks(filtered.join('\n'), refs);
  return { nodes, refs };
}
