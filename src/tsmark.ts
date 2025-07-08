import type { RefDef, TsmarkNode } from './types.d.ts';
import {
  headingToHTML,
  parseATXHeading,
  parseSetextHeading,
} from './nodes/heading.ts';
import { inlineToHTML } from './nodes/inline.ts';
import {
  caseFold,
  decodeEntities,
  encodeHref,
  escapeHTML,
  indentWidth,
  indentWidthFrom,
  isHtmlTag,
  isValidLabel,
  LAZY,
  normalizeLabel,
  stripColumns,
  stripColumnsFrom,
  stripIndent,
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

    // blockquote
    const bqMatch = stripped.match(/^ {0,3}>(.*)$/);
    if (bqMatch) {
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
          if (prevBlank) break;
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
        } else break;
      }
      // console.log('bqLines', bqLines);
      const children = parse(bqLines.join('\n'));
      nodes.push({ type: 'blockquote', children });
      continue;
    }

    // list (unordered or ordered)
    const bulletMatch = stripped.match(
      /^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/,
    );
    const orderedMatch = stripped.match(
      /^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/,
    );
    if (
      !line.startsWith(LAZY) &&
      (bulletMatch || orderedMatch) &&
      !(/^ {0,3}(\*\s*){3,}$/.test(stripped) ||
        /^ {0,3}(-\s*){3,}$/.test(stripped) ||
        /^ {0,3}(_\s*){3,}$/.test(stripped))
    ) {
      const isOrdered = Boolean(orderedMatch);
      const startNum = isOrdered ? parseInt(orderedMatch![2], 10) : undefined;
      const bulletChar = bulletMatch ? bulletMatch[2] : null;
      const delimChar = orderedMatch ? orderedMatch[3] : null;
      const items: TsmarkNode[] = [];
      while (i < lines.length) {
        const cur = stripLazy(lines[i]);
        const m = isOrdered
          ? cur.match(/^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/)
          : cur.match(/^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/);
        if (
          !m ||
          (!isOrdered && m[2] !== bulletChar) ||
          (isOrdered && m[3] !== delimChar) ||
          /^ {0,3}(\*\s*){3,}$/.test(cur) ||
          /^ {0,3}(-\s*){3,}$/.test(cur) ||
          /^ {0,3}(_\s*){3,}$/.test(cur)
        ) {
          break;
        }
        const after = (isOrdered ? m[4] : m[3]) ?? '';
        const markerBase = indentWidth(m[1]) +
          (isOrdered ? m[2].length + 1 : 1);
        const totalSpaces = indentWidthFrom(after, markerBase);
        const spacesAfter = after.trim() === ''
          ? 1
          : totalSpaces >= 5
          ? 1
          : Math.min(totalSpaces, 4);
        const markerIndent = markerBase + spacesAfter;
        const firstLine = stripColumnsFrom(after, spacesAfter, markerBase);
        const itemLines: string[] = [firstLine];
        let itemLoose = false;
        let fence: { char: string; len: number } | null = null;
        const firstFm = firstLine.match(/^(\s*)(`{3,}|~{3,})/);
        if (firstFm) {
          fence = { char: firstFm[2][0], len: firstFm[2].length };
        }
        i++;
        let prevBlank = false;
        while (i < lines.length) {
          const ind = indentWidth(lines[i]);
          const current = stripLazy(lines[i]);
          const fm = current.match(/^(\s*)(`{3,}|~{3,})/);
          if (fm && indentWidth(fm[1]) <= 3) {
            const ch = fm[2][0];
            const len = fm[2].length;
            if (!fence) {
              fence = { char: ch, len };
            } else if (fence.char === ch && len >= fence.len) {
              fence = null;
            }
            itemLines.push(stripColumns(lines[i], markerIndent));
            i++;
            prevBlank = false;
            continue;
          }
          if (/^\s*$/.test(current)) {
            if (fence) {
              itemLines.push('');
              i++;
              prevBlank = true;
              continue;
            }
            let j = i + 1;
            while (j < lines.length && stripLazy(lines[j]).trim() === '') j++;
            const next = j < lines.length ? stripLazy(lines[j]) : '';
            const nextMatch = isOrdered
              ? next.match(/^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/)
              : next.match(/^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/);
            const sameBullet = nextMatch &&
              ((!isOrdered && nextMatch[2] === bulletChar) ||
                (isOrdered && nextMatch[3] === delimChar));
            const nextInd = j < lines.length ? indentWidth(lines[j]) : -1;
            const atStart = itemLines.every((ln) => ln.trim() === '');
            if (sameBullet && nextInd - indentWidth(m[1]) <= 3) {
              itemLoose = true;
              i = j;
              break;
            }
            if (nextInd >= markerIndent + 4) {
              let k = itemLines.length - 1;
              while (k >= 0 && itemLines[k].trim() === '') k--;
              const prevLine = k >= 0 ? itemLines[k] : '';
              const prevBullet = isOrdered
                ? /^\s*\d+[.)]/.test(prevLine)
                : /^\s*[-+*]/.test(prevLine);
              if (!prevBullet && prevLine.trim() !== '') {
                itemLoose = true;
              }
              itemLines.push('');
              i++;
              prevBlank = true;
              continue;
            }
            if (nextInd >= markerIndent && !atStart) {
              let k2 = itemLines.length - 1;
              while (k2 >= 0 && itemLines[k2].trim() === '') k2--;
              const prevLine = k2 >= 0 ? itemLines[k2] : '';
              const prevBullet = isOrdered
                ? /^\s*\d+[.)]/.test(prevLine)
                : /^\s*[-+*]/.test(prevLine);
              if (!prevBullet) {
                itemLoose = true;
              }
              itemLines.push('');
              i++;
              prevBlank = true;
              continue;
            }
            break;
          } else if (ind >= markerIndent) {
            itemLines.push(stripColumns(lines[i], markerIndent));
            i++;
            prevBlank = false;
          } else if (
            !prevBlank &&
            ind < markerIndent &&
            !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:\*|_|-){3,}\s*$)/.test(current) &&
            !/^(?:\s*)(`{3,}|~{3,})/.test(current) &&
            !/^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:\s|$)/.test(current) &&
            !/^ {0,3}>/.test(current)
          ) {
            itemLines.push(
              LAZY + stripColumns(lines[i], Math.min(ind, markerIndent)),
            );
            i++;
            prevBlank = false;
          } else {
            break;
          }
        }
        const children = parse(itemLines.join('\n'));
        const paraCount = children.filter((c) => c.type === 'paragraph').length;
        if (paraCount > 1) {
          itemLoose = true;
        }
        items.push({ type: 'list_item', children, loose: itemLoose });
      }
      const listLoose = items.some((it) => (it as any).loose);
      const listNode: any = {
        type: 'list',
        ordered: isOrdered,
        items,
        loose: listLoose,
      };
      if (isOrdered && startNum !== 1 && startNum !== undefined) {
        listNode.start = startNum;
      }
      nodes.push(listNode as TsmarkNode);
      continue;
    }

    // fenced code block
    const fenceMatch = stripped.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch && indentWidth(fenceMatch[1]) <= 3) {
      const char = fenceMatch[2][0];
      const rest = fenceMatch[3];
      if (char === '`' && rest.includes('`')) {
        // info string contains fence character - not a fenced code block
      } else {
        const fenceIndent = indentWidth(fenceMatch[1]);
        const fence = fenceMatch[2];
        const info = fenceMatch[3].trim();
        const language = info
          ? decodeEntities(unescapeMd(info.split(/\s+/)[0]))
          : undefined;
        i++;
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
        if (closed) i++; // skip closing fence
        else {
          while (
            codeLines.length > 0 && codeLines[codeLines.length - 1] === ''
          ) {
            codeLines.pop();
          }
        }
        const body = codeLines.join('\n');
        nodes.push({
          type: 'code_block',
          content: body + (codeLines.length > 0 ? '\n' : ''),
          language,
        });
        continue;
      }
    }

    // indented code block (indentation >= 4 spaces)
    if (indentWidth(line) >= 4) {
      const codeLines: string[] = [];
      while (
        i < lines.length &&
        (indentWidth(lines[i]) >= 4 || stripLazy(lines[i]).trim() === '')
      ) {
        codeLines.push(stripLazy(lines[i]));
        i++;
      }

      while (
        codeLines.length > 0 && codeLines[0].trim() === ''
      ) {
        codeLines.shift();
      }

      while (
        codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === ''
      ) {
        codeLines.pop();
      }

      const content = codeLines.map((l) => stripIndent(l)).join('\n');

      nodes.push({ type: 'code_block', content: content + '\n' });
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
            nodes.push(setext);
            i++;
            paraLines.length = 0;
            continue main;
          }
        }
      }
      if (paraLines.length > 0) {
        nodes.push({ type: 'paragraph', content: paraLines.join('\n') });
        continue;
      }
    }

    // blank line
    i++;
  }

  return nodes;
}

function nodeToHTML(node: TsmarkNode, refs?: Map<string, RefDef>): string {
  if (node.type === 'heading') {
    return headingToHTML(node, refs);
  } else if (node.type === 'paragraph') {
    return `<p>${inlineToHTML(node.content, refs)}</p>`;
  } else if (node.type === 'code_block') {
    const escaped = escapeHTML(node.content);
    const langClass = node.language
      ? ` class="language-${escapeHTML(node.language)}"`
      : '';
    return `<pre><code${langClass}>${escaped}</code></pre>`;
  } else if (node.type === 'list') {
    const items = node.items.map((it) => {
      if (it.type === 'list_item') {
        const [first, ...rest] = it.children;
        if (!first) {
          return '<li></li>';
        }
        if (first.type === 'paragraph') {
          const firstHTML = inlineToHTML(first.content, refs);
          const restHTML = rest.map((n) => {
            if (n.type === 'paragraph' && !node.loose) {
              return inlineToHTML(n.content, refs);
            }
            return nodeToHTML(n, refs);
          }).join('\n');
          if (!node.loose) {
            if (rest.length === 0) {
              return `<li>${firstHTML}</li>`;
            }
            return `<li>${firstHTML}\n${restHTML}\n</li>`;
          }
          if (rest.length === 0) {
            return node.loose
              ? `<li>\n<p>${firstHTML}</p>\n</li>`
              : `<li><p>${firstHTML}</p></li>`;
          }
          return `<li>\n<p>${firstHTML}</p>\n${restHTML}\n</li>`;
        }
        const inner = [first, ...rest].map((n) => {
          if (n.type === 'paragraph' && !node.loose) {
            return inlineToHTML(n.content, refs);
          }
          return nodeToHTML(n, refs);
        }).join('\n');
        const trailing =
          it.children[it.children.length - 1]?.type === 'paragraph' &&
            !node.loose
            ? ''
            : '\n';
        return `<li>\n${inner}${trailing}</li>`;
      }
      return `<li>${nodeToHTML(it, refs)}</li>`;
    }).join('\n');
    const tag = node.ordered ? 'ol' : 'ul';
    const attr = node.ordered && (node as any).start !== undefined &&
        (node as any).start !== 1
      ? ` start="${(node as any).start}"`
      : '';
    return `<${tag}${attr}>\n${items}\n</${tag}>`;
  } else if (node.type === 'list_item') {
    return node.children.map((n) => nodeToHTML(n, refs)).join('');
  } else if (node.type === 'blockquote') {
    const inner = node.children.map((n) => nodeToHTML(n, refs)).join('\n');
    return inner === ''
      ? '<blockquote>\n</blockquote>'
      : `<blockquote>\n${inner}\n</blockquote>`;
  } else if (node.type === 'thematic_break') {
    return '<hr />';
  } else if (node.type === 'html') {
    return node.content;
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
