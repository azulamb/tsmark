import type { TsmarkNode } from './types.d.ts';

const LAZY = '\u0001';

const htmlCandidate =
  /<\/?[A-Za-z][^>]*>|<!--(?:[\s\S]*?-->|>|->)|<\?[\s\S]*?\?>|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>/g;

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

function isHtmlTag(tag: string): boolean {
  const openTag =
    /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>$/s;
  const closeTag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/;
  // CommonMark allows HTML comments even if they don't strictly conform to the
  // HTML specification.  The previous implementation tried to validate the
  // comment contents strictly and failed to recognize comments containing
  // sequences like `--` across newlines.  This resulted in raw comments being
  // escaped in the output.  To comply with the CommonMark spec examples, accept
  // any sequence between `<!--` and `-->`.
  const comment = /^<!--[\s\S]*?-->$/;
  const proc = /^<\?[\s\S]*?\?>$/;
  const decl = /^<![A-Z]+\s+[^>]*>$/;
  const cdata = /^<!\[CDATA\[[\s\S]*?\]\]>$/;
  return (
    openTag.test(tag) ||
    closeTag.test(tag) ||
    comment.test(tag) ||
    tag === '<!-->' ||
    tag === '<!--->' ||
    proc.test(tag) ||
    decl.test(tag) ||
    cdata.test(tag)
  );
}

function stripLazy(line: string): string {
  return line.startsWith(LAZY) ? line.slice(1) : line;
}

function indentWidth(line: string): number {
  line = stripLazy(line);
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') {
      col++;
    } else if (ch === '\t') {
      col += 4 - (col % 4);
    } else {
      break;
    }
  }
  return col;
}

function stripColumns(line: string, count: number): string {
  line = stripLazy(line);
  let col = 0;
  let idx = 0;
  let indent = '';
  while (idx < line.length) {
    const ch = line[idx];
    if (ch === ' ') {
      indent += ' ';
      col++;
      idx++;
    } else if (ch === '\t') {
      const width = 4 - (col % 4);
      indent += ' '.repeat(width);
      col += width;
      idx++;
    } else {
      break;
    }
  }

  const rest = line.slice(idx);
  if (count >= indent.length) {
    return rest;
  }
  return indent.slice(count) + rest;
}

function stripIndent(line: string): string {
  return stripColumns(line, 4);
}

function indentWidthFrom(line: string, start: number): number {
  line = stripLazy(line);
  let col = start;
  for (const ch of line) {
    if (ch === ' ') {
      col++;
    } else if (ch === '\t') {
      col += 4 - (col % 4);
    } else {
      break;
    }
  }
  return col - start;
}

function stripColumnsFrom(line: string, count: number, start: number): string {
  line = stripLazy(line);
  let col = start;
  let idx = 0;
  let indent = '';
  while (idx < line.length) {
    const ch = line[idx];
    if (ch === ' ') {
      indent += ' ';
      col++;
      idx++;
    } else if (ch === '\t') {
      const width = 4 - (col % 4);
      indent += ' '.repeat(width);
      col += width;
      idx++;
    } else {
      break;
    }
  }
  const rest = line.slice(idx);
  if (count >= indent.length) {
    return rest;
  }
  return indent.slice(count) + rest;
}

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
    const atx = stripped.match(/^ {0,3}(#{1,6})(.*)$/);
    if (atx) {
      const level = atx[1].length;
      let rest = atx[2];
      if (rest !== '' && !/^\s/.test(rest)) {
        // not a heading if no space after markers
      } else {
        rest = rest.replace(/\s+$/, '');
        rest = rest.replace(/\s+#+\s*$/, '');
        rest = rest.replace(/^\s+/, '');
        const content = rest;
        nodes.push({ type: 'heading', level, content });
        i++;
        continue;
      }
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
          !lines[i].startsWith(LAZY) &&
          /^ {0,3}([-=])+\s*$/.test(stripLazy(lines[i])) &&
          paraLines.length > 0
        ) {
          const level = stripLazy(lines[i]).trim().startsWith('=') ? 1 : 2;
          nodes.push({
            type: 'heading',
            level,
            content: paraLines.join('\n').trimEnd(),
          });
          i++;
          paraLines.length = 0;
          continue main;
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

type RefDef = { url: string; title?: string };

function nodeToHTML(node: TsmarkNode, refs?: Map<string, RefDef>): string {
  if (node.type === 'heading') {
    return `<h${node.level}>${
      inlineToHTML(node.content, refs)
    }</h${node.level}>`;
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

function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function encodeHref(url: string): string {
  return encodeURI(url).replace(/%25([0-9a-fA-F]{2})/g, '%$1');
}

function stripMd(text: string): string {
  text = text.replace(/`+/g, '');
  text = text.replace(/\\([!"#$%&'()*+,\.\/\:;<=>?@\[\]\\^_`{|}~])/g, '$1');
  text = text.replace(/!?\[((?:\\.|[^\]])*)\]\([^\)]*\)/g, (_, p1) => {
    return stripMd(p1);
  });
  text = text.replace(/!?\[((?:\\.|[^\]])*)\](?:\[[^\]]*\])?/g, (_, p1) => {
    return stripMd(p1);
  });
  text = text.replace(/[*_]/g, '');
  return text;
}

function unescapeMd(text: string): string {
  return text.replace(/\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g, '$1');
}

function caseFold(str: string): string {
  return str.toLowerCase().replace(/\u00DF/g, 'ss');
}

function normalizeLabel(text: string): string {
  return caseFold(text).replace(/\s+/g, ' ').trim();
}

const namedEntities: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
  copy: '©',
  AElig: 'Æ',
  Dcaron: 'Ď',
  frac34: '¾',
  HilbertSpace: 'ℋ',
  DifferentialD: 'ⅆ',
  ClockwiseContourIntegral: '∲',
  ngE: '≧̸',
  auml: 'ä',
  ouml: 'ö',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-f]+|[A-Za-z][A-Za-z0-9]*);/gi,
    (_, body: string) => {
      const lower = body.toLowerCase();
      if (lower.startsWith('#x')) {
        const digits = body.slice(2);
        if (digits.length === 0 || digits.length > 6) {
          return `&${body};`;
        }
        const cp = parseInt(digits, 16);
        if (
          Number.isNaN(cp) ||
          cp === 0 ||
          cp > 0x10ffff ||
          (0xd800 <= cp && cp <= 0xdfff)
        ) {
          return '\uFFFD';
        }
        return String.fromCodePoint(cp);
      } else if (lower.startsWith('#')) {
        const digits = body.slice(1);
        if (
          digits.length === 0 ||
          digits.length > 7 ||
          /[^0-9]/.test(digits)
        ) {
          return `&${body};`;
        }
        const cp = parseInt(digits, 10);
        if (
          Number.isNaN(cp) ||
          cp === 0 ||
          cp > 0x10ffff ||
          (0xd800 <= cp && cp <= 0xdfff)
        ) {
          return '\uFFFD';
        }
        return String.fromCodePoint(cp);
      }
      return namedEntities[body] ?? `&${body};`;
    },
  );
}

function inlineToHTML(
  text: string,
  refs?: Map<string, RefDef>,
  placeholders: string[] = [],
): string {
  // store code spans as placeholders before any other processing
  text = text.replace(
    /(?<![\\"'=`])(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g,
    (full, p1, p2, offset, str) => {
      const start = offset;
      const end = offset + full.length;
      const lt = str.lastIndexOf('<', start);
      const gt = str.indexOf('>', start);
      if (lt !== -1 && gt !== -1 && lt < start && gt < end) {
        return full;
      }
      let content = p2.replace(/\n/g, ' ');
      if (
        content.startsWith(' ') &&
        content.endsWith(' ') &&
        content.trim() !== ''
      ) {
        content = content.slice(1, -1);
      }
      const token = `\u0002${placeholders.length}\u0002`;
      placeholders.push(`<code>${escapeHTML(content)}</code>`);
      return token;
    },
  );

  // store autolinks as placeholders before handling escapes
  text = text.replace(
    /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/g,
    (_, p1) => {
      const token = `\u0000${placeholders.length}\u0000`;
      const href = encodeHref(p1);
      placeholders.push(`<a href="${escapeHTML(href)}">${escapeHTML(p1)}</a>`);
      return token;
    },
  );
  text = text.replace(/<([^\s@<>\\]+@[^\s@<>\\]+)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(
      `<a href="mailto:${escapeHTML(p1)}">${escapeHTML(p1)}</a>`,
    );
    return token;
  });

  // store HTML tags as placeholders before processing escapes
  {
    let result = '';
    let idx = 0;
    while (idx < text.length) {
      const lt = text.indexOf('<', idx);
      if (lt === -1) {
        result += text.slice(idx);
        break;
      }
      result += text.slice(idx, lt);

      if (text.startsWith('<!--', lt)) {
        let candidate: string;
        if (text.startsWith('<!-->', lt) || text.startsWith('<!--->', lt)) {
          candidate = text.startsWith('<!--->', lt) ? '<!--->' : '<!-->';
          const end = lt + candidate.length;
          if (
            isHtmlTag(candidate) &&
            (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
          ) {
            const token = `\u0000${placeholders.length}\u0000`;
            placeholders.push(candidate);
            result += token;
          } else {
            result += candidate;
          }
          idx = end;
          continue;
        }
        const end = text.indexOf('-->', lt + 4);
        candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 3);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 3;
        continue;
      } else if (text.startsWith('<?', lt)) {
        const end = text.indexOf('?>', lt + 2);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 2);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 2;
        continue;
      } else if (text.startsWith('<![CDATA[', lt)) {
        const end = text.indexOf(']]>', lt + 9);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 3);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 3;
        continue;
      } else if (text.startsWith('<!', lt)) {
        const end = text.indexOf('>', lt + 2);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 1);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 1;
        continue;
      }

      let i = lt + 1;
      let quote: string | null = null;
      while (i < text.length) {
        const ch = text[i];
        if (quote) {
          if (ch === quote) quote = null;
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          const candidate = text.slice(lt, i + 1);
          if (
            isHtmlTag(candidate) &&
            (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
          ) {
            const token = `\u0000${placeholders.length}\u0000`;
            placeholders.push(candidate);
            result += token;
            idx = i + 1;
          } else {
            result += candidate;
            idx = i + 1;
          }
          break;
        }
        i++;
      }
      if (i >= text.length) {
        result += text.slice(lt);
        break;
      }
    }
    text = result;
  }

  // handle backslash escapes by storing them as placeholders
  text = text.replace(
    /\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g,
    (_, p1) => {
      const token = `\u0001${placeholders.length}\u0001`;
      placeholders.push(escapeHTML(p1));
      return token;
    },
  );

  function restoreEscapes(str: string): string {
    return str.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
  }

  function restoreEscapesForKey(str: string): string {
    return str.replace(/\u0001(\d+)\u0001/g, (_, idx) => {
      return `\\${decodeEntities(placeholders[+idx])}`;
    });
  }

  function restoreEntities(str: string): string {
    return str.replace(/\u0003(\d+)\u0003/g, (_, idx) => placeholders[+idx]);
  }

  // store character references as placeholders so that they do not affect
  // emphasis and other inline processing
  text = text.replace(/&(#x?[0-9a-f]+|[A-Za-z][A-Za-z0-9]*);/gi, (m) => {
    const token = `\u0003${placeholders.length}\u0003`;
    placeholders.push(escapeHTML(decodeEntities(m)));
    return token;
  });

  // inline images (direct)
  text = text.replace(
    /!\[((?:\\.|[^\[\]])*)\]\(<([^>]+)>[ \t\n]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\))?\)/g,
    (m, alt, href, t1, t2, t3) => {
      const title = t1 || t2 || t3;
      const src = encodeHref(
        restoreEntities(restoreEscapes(href)),
      );
      const altPlain = inlineToHTML(alt, refs).replace(/<[^>]*>/g, '');
      let html = `<img src="${src}" alt="${escapeHTML(altPlain)}"`;
      if (title) {
        html += ` title="${
          escapeHTML(restoreEntities(restoreEscapes(title)))
        }"`;
      }
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    },
  );

  text = text.replace(
    /!\[((?:\\.|[^\[\]])*)\]\(((?:\\.|[^()\\]|\([^()\\]*\))*?)\)/g,
    (m, alt, inside) => {
      const m2 = inside.match(
        /^[ \t\n]*([^ \t\n<>]+)(?:[ \t\n]+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t\n]*$/s,
      );
      if (!m2) return m;
      let href = restoreEntities(restoreEscapes(m2[1]));
      const title = m2[2] || m2[3] || m2[4];
      const src = encodeHref(
        restoreEntities(restoreEscapes(href.replace(/^<|>$/g, ''))),
      );
      const altPlain = inlineToHTML(alt, refs).replace(/<[^>]*>/g, '');
      let html = `<img src="${src}" alt="${escapeHTML(altPlain)}"`;
      if (title) {
        html += ` title="${
          escapeHTML(restoreEntities(restoreEscapes(title)))
        }"`;
      }
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    },
  );

  // inline links (direct) with angle brackets around destination
  text = text.replace(
    /\[([^\[\]]*)\]\(<([^\n>]+)>[ \t\n]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\))?\)/g,
    (m, textContent, href, t1, t2, t3) => {
      const title = t1 || t2 || t3;
      const decodedHref = decodeEntities(
        unescapeMd(restoreEntities(restoreEscapes(href))),
      );
      const titleAttr = title
        ? ` title="${
          escapeHTML(
            decodeEntities(unescapeMd(restoreEntities(restoreEscapes(title)))),
          )
        }"`
        : '';
      const inner = inlineToHTML(textContent, refs, placeholders);
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(
        `<a href="${encodeHref(decodedHref)}"${titleAttr}>${inner}</a>`,
      );
      return token;
    },
  );

  // inline links (direct)
  text = text.replace(
    /\[([^\[\]]*)\]\(((?:\\.|[^()\\]|\([^()\\]*\))*?)\)/g,
    (m, textContent, inside) => {
      const m2 = inside.match(
        /^[ \t\n]*([^ \t\n<>]+)(?:[ \t\n]+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t\n]*$/s,
      );
      if (!m2) return m;
      let href = restoreEntities(restoreEscapes(m2[1]));
      const title = m2[2] || m2[3] || m2[4];
      const decodedHref = decodeEntities(unescapeMd(href));
      const titleAttr = title
        ? ` title="${
          escapeHTML(
            decodeEntities(unescapeMd(restoreEntities(restoreEscapes(title)))),
          )
        }"`
        : '';
      const inner = inlineToHTML(textContent, refs, placeholders);
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(
        `<a href="${encodeHref(decodedHref)}"${titleAttr}>${inner}</a>`,
      );
      return token;
    },
  );

  // inline links with empty destination
  text = text.replace(/\[([^\]]*)\]\(\)/g, (_, textContent) => {
    const token = `\u0000${placeholders.length}\u0000`;
    const inner = inlineToHTML(textContent, refs, placeholders);
    placeholders.push(`<a href="">${inner}</a>`);
    return token;
  });

  // handle raw HTML tags that appear inside parentheses but are not part
  // of a valid link destination
  text = text.replace(/\((<[^>]+>)/g, (m, tag) => {
    if (isHtmlTag(tag)) {
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(tag);
      return '(' + token;
    }
    return m;
  });

  // reference-style images
  if (refs) {
    text = text.replace(
      /!\[((?:\\.|[^\\\[\]])*)\]\[((?:\\.|[^\\\[\]])*)\]/g,
      (m, alt, lab) => {
        const label = normalizeLabel(
          restoreEntities(restoreEscapesForKey(lab || alt)),
        );
        const def = refs.get(label);
        if (!def) return m;
        const altPlain = inlineToHTML(alt, refs).replace(/<[^>]*>/g, '');
        let html = `<img src="${encodeHref(def.url)}" alt="${
          escapeHTML(altPlain)
        }"`;
        if (def.title) html += ` title="${escapeHTML(def.title)}"`;
        html += ' />';
        const token = `\u0000${placeholders.length}\u0000`;
        placeholders.push(html);
        return token;
      },
    );

    text = text.replace(
      /!\[((?:\\.|[^\\\[\]])+)\](?!\([^\s)]+(?:\s+"[^"]+")?\))/g,
      (m, alt) => {
        const label = normalizeLabel(
          restoreEntities(restoreEscapesForKey(alt)),
        );
        const def = refs.get(label);
        if (!def) return m;
        const altPlain = inlineToHTML(alt, refs).replace(/<[^>]*>/g, '');
        let html = `<img src="${encodeHref(def.url)}" alt="${
          escapeHTML(altPlain)
        }"`;
        if (def.title) html += ` title="${escapeHTML(def.title)}"`;
        html += ' />';
        const token = `\u0000${placeholders.length}\u0000`;
        placeholders.push(html);
        return token;
      },
    );

    // reference-style links
    text = text.replace(
      /\[((?:\\.|[^\\\[\]])+)\]\[((?:\\.|[^\\\[\]])*)\]/g,
      (m, textContent, lab) => {
        if (/\u0000(\d+)\u0000/.test(textContent)) {
          const matches = [...textContent.matchAll(/\u0000(\d+)\u0000/g)];
          if (
            matches.some((ma) => {
              const ph = placeholders[+ma[1]];
              return typeof ph === 'string' && ph.startsWith('<a ');
            })
          ) {
            return m;
          }
        }
        const key = normalizeLabel(
          restoreEntities(restoreEscapesForKey(lab || textContent)),
        );
        const def = refs.get(key);
        if (!def) return m;
        const token = `\u0000${placeholders.length}\u0000`;
        const titleAttr = def.title
          ? ` title="${escapeHTML(decodeEntities(unescapeMd(def.title)))}"`
          : '';
        const href = encodeHref(decodeEntities(unescapeMd(def.url)));
        const inner = inlineToHTML(textContent, refs, placeholders);
        placeholders.push(
          `<a href="${href}"${titleAttr}>${inner}</a>`,
        );
        return token;
      },
    );

    text = text.replace(
      /\[((?:\\.|[^\\\[\]])+)\](?!\([^\s)]+(?:\s+"[^"]+")?\))/g,
      (m, textContent) => {
        const def = refs.get(
          normalizeLabel(restoreEntities(restoreEscapesForKey(textContent))),
        );
        if (!def) return m;
        const token = `\u0000${placeholders.length}\u0000`;
        const titleAttr = def.title
          ? ` title="${escapeHTML(decodeEntities(unescapeMd(def.title)))}"`
          : '';
        const href = encodeHref(decodeEntities(unescapeMd(def.url)));
        const inner = inlineToHTML(textContent, refs, placeholders);
        placeholders.push(
          `<a href="${href}"${titleAttr}>${inner}</a>`,
        );
        return token;
      },
    );
  }

  let out = escapeHTML(text);

  // backslash at line end creates hard line break
  out = out.replace(/\\\n/g, '<br />\n');

  out = applyEmphasis(out);

  // trim spaces before emphasis at line start
  out = out.replace(/(^|\n)\s+(?=<(?:em|strong)>)/g, '$1');

  if (refs) {
    // reference link placeholders are already handled
  }
  out = out.replace(/ {2,}\n(?!$)/g, '<br />\n');
  out = out.replace(/ +(?=\n)/g, '');
  out = out.replace(/ +$/g, '');

  // restore placeholders
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\u0000(\d+)\u0000/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0002(\d+)\u0002/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0003(\d+)\u0003/g, (_, idx) => placeholders[+idx]);
    if (
      !/\u0000\d+\u0000|\u0001\d+\u0001|\u0002\d+\u0002|\u0003\d+\u0003/.test(
        out,
      )
    ) {
      break;
    }
  }

  return out;
}

function applyEmphasis(text: string): string {
  type Delim = {
    char: string;
    count: number;
    canOpen: boolean;
    canClose: boolean;
    idx: number;
  };

  function isWhitespace(ch: string): boolean {
    return ch === '' || /\s/.test(ch);
  }

  function isPunctuation(ch: string): boolean {
    return /[\p{P}\p{S}]/u.test(ch);
  }

  const tokens: { text: string; delim?: Delim }[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '*' || ch === '_') {
      let j = i;
      while (j < text.length && text[j] === ch) j++;
      const count = j - i;
      const prev = i === 0 ? '' : text[i - 1];
      const next = j >= text.length ? '' : text[j];
      const lf = !isWhitespace(next) && (!isPunctuation(next) ||
        isWhitespace(prev) || isPunctuation(prev));
      const rf = !isWhitespace(prev) && (!isPunctuation(prev) ||
        isWhitespace(next) || isPunctuation(next));
      let canOpen, canClose;
      if (ch === '*') {
        canOpen = lf;
        canClose = rf;
      } else {
        canOpen = lf && (!rf || isPunctuation(prev));
        canClose = rf && (!lf || isPunctuation(next));
      }
      tokens.push({
        text: text.slice(i, j),
        delim: { char: ch, count, canOpen, canClose, idx: tokens.length },
      });
      i = j;
    } else {
      tokens.push({ text: ch });
      i++;
    }
  }

  const stack: Delim[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (!t.delim) continue;
    const d = t.delim;
    if (d.canClose) {
      let openerIndex = -1;
      for (let j = stack.length - 1; j >= 0; j--) {
        const op = stack[j];
        if (op.char !== d.char) continue;
        if (!op.canOpen) continue;
        if (
          (op.canClose || d.canOpen) && ((op.count + d.count) % 3 === 0) &&
          (op.count % 3 !== 0 || d.count % 3 !== 0)
        ) {
          continue;
        }
        openerIndex = j;
        break;
      }
      if (openerIndex !== -1) {
        const opener = stack[openerIndex];
        stack.splice(openerIndex);
        const useStrong = d.count >= 2 && opener.count >= 2 ? 2 : 1;
        opener.count -= useStrong;
        d.count -= useStrong;
        tokens[opener.idx].text = useStrong === 2 ? '<strong>' : '<em>';
        tokens[idx].text = useStrong === 2 ? '</strong>' : '</em>';
        if (opener.count > 0) {
          tokens.splice(opener.idx + 1, 0, {
            text: opener.char.repeat(opener.count),
          });
          idx += 0; // adjust automatically since array length increased
        }
        if (d.count > 0) {
          tokens.splice(idx, 0, { text: d.char.repeat(d.count) });
          idx++; // skip over inserted text
        }
        continue;
      }
    }
    if (d.canOpen) {
      stack.push(d);
    }
  }

  return tokens.map((t) => t.text).join('');
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
        if (!refs.has(key)) {
          refs.set(key, {
            url: unescapeMd(url),
            title: title ? unescapeMd(title) : undefined,
          });
        }
        if (bq) {
          const prefix = first.slice(0, first.length - lineForDef.length);
          filtered.push(prefix.trimEnd());
        }
        i = nextIdx;
        handled = true;
        prevWasDef = true;
        continue;
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
          if (m2) {
            let url = m2[1];
            if (url.startsWith('<') && url.endsWith('>')) {
              url = url.slice(1, -1);
            }
            const title = m2[2] || m2[3] || m2[4];
            const key = normalizeLabel(label);
            if (!refs.has(key)) {
              refs.set(key, {
                url: unescapeMd(url),
                title: title ? unescapeMd(title) : undefined,
              });
            }
            if (bq) {
              const prefix = first.slice(0, first.length - lineForDef.length);
              filtered.push(prefix.trimEnd());
            }
            i = nextIdx;
            handled = true;
            prevWasDef = true;
            continue;
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
