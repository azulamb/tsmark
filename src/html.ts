import type { RefDef, TsmarkNode } from './types.d.ts';
import { headingToHTML } from './html/heading.ts';
import { paragraphToHTML } from './html/paragraph.ts';
import { codeBlockToHTML } from './html/code_block.ts';
import { listToHTML } from './html/list.ts';
import { blockquoteToHTML } from './html/blockquote.ts';
import { thematicBreakToHTML } from './html/thematic_break.ts';
import { htmlToHTML } from './html/html.ts';
import {
  indentWidth,
  isValidLabel,
  normalizeLabel,
  unescapeMd,
} from './utils.ts';
import { parse } from './tsmark.ts';

function nodeToHTML(node: TsmarkNode, refs?: Map<string, RefDef>): string {
  if (node.type === 'heading') {
    return headingToHTML(node, refs);
  } else if (node.type === 'paragraph') {
    return paragraphToHTML(node, refs);
  } else if (node.type === 'code_block') {
    return codeBlockToHTML(node, refs);
  } else if (node.type === 'list') {
    return listToHTML(node, (n) => nodeToHTML(n, refs), refs);
  } else if (node.type === 'list_item') {
    return node.children.map((n) => nodeToHTML(n, refs)).join('');
  } else if (node.type === 'blockquote') {
    return blockquoteToHTML(node, (n) => nodeToHTML(n, refs), refs);
  } else if (node.type === 'thematic_break') {
    return thematicBreakToHTML(node);
  } else if (node.type === 'html') {
    return htmlToHTML(node, refs);
  }
  return '';
}

export function convertToHTML(md: string): string {
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
      if (!isValidLabel(m[1])) {
        // not a valid reference label
      } else {
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
          // if key empty, fall through to normal processing
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
            // if key empty, fall through to normal processing
          }
        }
      }
    }
    if (!handled) {
      filtered.push(first);
      prevWasDef = false;
    }
  }
  const nodes = parse(filtered.join('\n'));
  const html = nodes.map((node) => {
    return nodeToHTML(node, refs);
  }).join('\n');
  return html ? html + '\n' : '';
}
