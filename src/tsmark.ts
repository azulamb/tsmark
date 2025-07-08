import type { TsmarkNode } from './types.d.ts';
import { parseATXHeading } from './nodes/heading.ts';
import { parseParagraph } from './nodes/paragraph.ts';
import { parseCodeBlock } from './nodes/code_block.ts';
import { parseList } from './nodes/list.ts';
import { parseBlockquote } from './nodes/blockquote.ts';
import {
  caseFold,
  encodeHref,
  indentWidth,
  isHtmlTag,
  isValidLabel,
  LAZY,
  normalizeLabel,
  stripLazy,
  stripMd,
  unescapeMd,
} from './utils.ts';

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

export function parse(md: string): TsmarkNode[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const nodes: TsmarkNode[] = [];

  let i = 0;
  main: while (i < lines.length) {
    const line = lines[i];
    const stripped = stripLazy(line);

    // thematic break
    if (
      /^ {0,3}(\*\s*){3,}$/.test(stripped) ||
      /^ {0,3}(-\s*){3,}$/.test(stripped) ||
      /^ {0,3}(_\s*){3,}$/.test(stripped)
    ) {
      nodes.push({ type: 'thematic_break' });
      i++;
      continue;
    }

    const bqResult = parseBlockquote(lines, i, parse);
    if (bqResult) {
      nodes.push(bqResult.node);
      i = bqResult.next;
      continue;
    }

    // list (unordered or ordered)
    const listResult = parseList(lines, i, parse);
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

    // ATX heading
    const atxNode = parseATXHeading(stripped);
    if (atxNode) {
      nodes.push(atxNode);
      i++;
      continue;
    }

    // Setext heading will be handled together with paragraph parsing

    // HTML block
    {
      const mHtml = stripped.match(htmlBlockStartRegex);
      if (mHtml && htmlBlockTags.has(mHtml[1].toLowerCase())) {
        const tag = mHtml[1].toLowerCase();
        const htmlLines: string[] = [stripped];
        i++;
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
        nodes.push({ type: 'html', content: htmlLines.join('\n') });
        continue;
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
        if (!closing.test(stripped)) {
          i++;
          while (i < lines.length) {
            const ln = stripLazy(lines[i]);
            htmlLines.push(ln);
            if (closing.test(ln)) {
              i++;
              break;
            }
            i++;
          }
        } else {
          i++;
        }
        nodes.push({ type: 'html', content: htmlLines.join('\n') });
        continue;
      } else if (
        isHtmlTag(stripped) &&
        (i === 0 || stripLazy(lines[i - 1]).trim() === '')
      ) {
        const htmlLines: string[] = [stripped];
        i++;
        while (i < lines.length && stripLazy(lines[i]).trim() !== '') {
          htmlLines.push(stripLazy(lines[i]));
          i++;
        }
        nodes.push({ type: 'html', content: htmlLines.join('\n') });
        continue;
      }
    }

    // paragraph and setext heading
    if (stripped.trim() !== '') {
      const result = parseParagraph(lines, i);
      if (result) {
        nodes.push(result.node);
        i = result.next;
        continue;
      }
    }

    // blank line
    i++;
  }

  return nodes;
}
