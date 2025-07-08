import type { RefDef, TsmarkNode } from '../types.d.ts';
import { inlineToHTML } from './inline.ts';
import { parseSetextHeading } from './heading.ts';
import { indentWidth, LAZY, stripColumns, stripLazy } from '../utils.ts';

const htmlBlockStartRegex = /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/;
const htmlBlockTags = new Set([
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'pre',
  'script',
  'search',
  'section',
  'summary',
  'style',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul',
  'textarea',
]);

export function parseParagraph(
  lines: string[],
  start: number,
): { node: TsmarkNode; next: number } | null {
  let i = start;
  const paraLines: string[] = [];
  while (i < lines.length && stripLazy(lines[i]).trim() !== '') {
    if (
      !lines[i].startsWith(LAZY) &&
      /^ {0,3}([-=])+\s*$/.test(stripLazy(lines[i])) &&
      paraLines.length > 0
    ) {
      break;
    }
    if (
      !lines[i].startsWith(LAZY) && (
        /^ {0,3}(\*\s*){3,}$/.test(stripLazy(lines[i])) ||
        /^ {0,3}(-\s*){3,}$/.test(stripLazy(lines[i])) ||
        /^ {0,3}(_\s*){3,}$/.test(stripLazy(lines[i])) ||
        /^ {0,3}>/.test(stripLazy(lines[i])) ||
        /^\s{0,3}[-+*][ \t]+/.test(stripLazy(lines[i])) ||
        (() => {
          const m = stripLazy(lines[i]).match(
            /^ {0,3}(\d{1,9})([.)])[ \t]+/,
          );
          return m && m[1] === '1';
        })() ||
        /^ {0,3}#{1,6}(?:\s|$)/.test(stripLazy(lines[i])) ||
        (() => {
          const m = stripLazy(lines[i]).match(/^(\s*)(`{3,}|~{3,})(.*)$/);
          if (m && indentWidth(m[1]) <= 3) {
            const ch = m[2][0];
            const rest = m[3];
            return !((ch === '`' && rest.includes('`')) ||
              (ch === '~' && rest.includes('~')));
          }
          return false;
        })() ||
        (() => {
          const trimmed = stripLazy(lines[i]);
          const m = trimmed.match(htmlBlockStartRegex);
          if (m && htmlBlockTags.has(m[1].toLowerCase())) {
            if (trimmed.startsWith('</')) {
              const tag = m[1].toLowerCase();
              return !['pre', 'script', 'style', 'textarea'].includes(tag);
            }
            return true;
          }
          return false;
        })()
      )
    ) {
      break;
    }
    const ln = lines[i];
    if (indentWidth(ln) >= 4) {
      paraLines.push(stripColumns(ln, indentWidth(ln)));
    } else {
      const ind = Math.min(indentWidth(ln), 3);
      paraLines.push(stripColumns(ln, ind));
    }
    i++;
    if (
      i < lines.length &&
      !lines[i].startsWith(LAZY)
    ) {
      const setext = parseSetextHeading(
        paraLines,
        stripLazy(lines[i]),
      );
      if (setext) {
        return { node: setext, next: i + 1 };
      }
    }
  }
  if (paraLines.length > 0) {
    return {
      node: { type: 'paragraph', content: paraLines.join('\n') },
      next: i,
    };
  }
  return null;
}

export function paragraphToHTML(
  node: TsmarkNode & { type: 'paragraph' },
  refs?: Map<string, RefDef>,
): string {
  return `<p>${inlineToHTML(node.content, refs)}</p>`;
}
