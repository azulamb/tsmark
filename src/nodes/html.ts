import type { RefDef, TsmarkNode } from '../types.d.ts';
import { isHtmlTag, stripLazy } from '../utils.ts';

export const htmlBlockStartRegex =
  /^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/;

export const htmlBlockTags = new Set<string>([
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

export function parseHtmlBlock(
  lines: string[],
  start: number,
): { node: TsmarkNode; next: number } | null {
  const stripped = stripLazy(lines[start]);

  const mHtml = stripped.match(htmlBlockStartRegex);
  if (mHtml && htmlBlockTags.has(mHtml[1].toLowerCase())) {
    const tag = mHtml[1].toLowerCase();
    const htmlLines: string[] = [stripped];
    let i = start + 1;
    if (['pre', 'script', 'style', 'textarea'].includes(tag)) {
      let closed = new RegExp(`</${tag}>`, 'i').test(stripped);
      while (!closed && i < lines.length) {
        const ln = stripLazy(lines[i]);
        htmlLines.push(ln);
        if (new RegExp(`</${tag}>`, 'i').test(ln)) {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        while (
          htmlLines.length > 0 &&
          htmlLines[htmlLines.length - 1].trim() === ''
        ) {
          htmlLines.pop();
        }
      }
    } else {
      while (i < lines.length && stripLazy(lines[i]).trim() !== '') {
        htmlLines.push(stripLazy(lines[i]));
        i++;
      }
    }
    return { node: { type: 'html', content: htmlLines.join('\n') }, next: i };
  }

  if (/^ {0,3}(?:<!--|<\?|<![A-Z]|<!\[CDATA\[)/.test(stripped)) {
    const htmlLines: string[] = [stripped];
    const closing = stripped.trimStart().startsWith('<!--')
      ? /-->/
      : stripped.trimStart().startsWith('<?')
      ? /\?>/
      : stripped.trimStart().startsWith('<![CDATA[')
      ? /\]\]>/
      : />/;
    let i = start + 1;
    if (!closing.test(stripped)) {
      while (i < lines.length) {
        const ln = stripLazy(lines[i]);
        htmlLines.push(ln);
        if (closing.test(ln)) {
          i++;
          break;
        }
        i++;
      }
    }
    return { node: { type: 'html', content: htmlLines.join('\n') }, next: i };
  }

  if (
    isHtmlTag(stripped) &&
    (start === 0 || stripLazy(lines[start - 1]).trim() === '')
  ) {
    const htmlLines: string[] = [stripped];
    let i = start + 1;
    while (i < lines.length && stripLazy(lines[i]).trim() !== '') {
      htmlLines.push(stripLazy(lines[i]));
      i++;
    }
    return { node: { type: 'html', content: htmlLines.join('\n') }, next: i };
  }

  return null;
}

export function htmlToHTML(
  node: TsmarkNode & { type: 'html' },
  _refs?: Map<string, RefDef>,
): string {
  return node.content;
}
