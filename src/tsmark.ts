import type { TsmarkNode } from './types.d.ts';

const LAZY = '\u0001';

const htmlCandidate =
  /<\/?[A-Za-z][^>\n]*>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>/g;

function isHtmlTag(tag: string): boolean {
  const openTag =
    /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:=(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>$/;
  const closeTag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/;
  const comment = /^(?:<!---->|<!--(?:-?[^>-])(?:[^-]*-+)*?-->)$/s;
  const proc = /^<\?[\s\S]*?\?>$/;
  const decl = /^<![A-Z]+\s+[^>]*>$/;
  const cdata = /^<!\[CDATA\[[\s\S]*?\]\]>$/;
  return (
    openTag.test(tag) ||
    closeTag.test(tag) ||
    comment.test(tag) ||
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
          bqLines.push(rest);
          prevBlank = false;
          i++;
        } else if (current.trim() === '') {
          bqLines.push('');
          prevBlank = true;
          i++;
        } else if (
          indentWidth(lines[i]) <= 3 &&
          !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:\*|_|-){3,}\s*$)/.test(current) &&
          !/^(?:\s*)(`{3,}|~{3,})/.test(current)
        ) {
          if (prevBlank) break;
          bqLines.push(
            LAZY + stripColumns(lines[i], Math.min(indentWidth(lines[i]), 3)),
          );
          prevBlank = false;
          i++;
        } else break;
      }
      const children = parse(bqLines.join('\n'));
      nodes.push({ type: 'blockquote', children });
      continue;
    }

    // list (unordered or ordered)
    const bulletMatch = stripped.match(/^(\s{0,3})([-+*])([ \t]+.*)$/);
    const orderedMatch = stripped.match(
      /^(\s{0,3})(\d{1,9})([.)])([ \t]+.*)$/,
    );
    if (
      (bulletMatch || orderedMatch) &&
      !(/^ {0,3}(\*\s*){3,}$/.test(stripped) ||
        /^ {0,3}(-\s*){3,}$/.test(stripped) ||
        /^ {0,3}(_\s*){3,}$/.test(stripped))
    ) {
      const isOrdered = Boolean(orderedMatch);
      const items: TsmarkNode[] = [];
      while (i < lines.length) {
        const cur = stripLazy(lines[i]);
        const m = isOrdered
          ? cur.match(/^(\s{0,3})(\d{1,9})([.)])([ \t]+.*)$/)
          : cur.match(/^(\s{0,3})([-+*])([ \t]+.*)$/);
        if (
          !m ||
          /^ {0,3}(\*\s*){3,}$/.test(cur) ||
          /^ {0,3}(-\s*){3,}$/.test(cur) ||
          /^ {0,3}(_\s*){3,}$/.test(cur)
        ) {
          break;
        }
        const markerIndent = indentWidth(m[1]) +
          (isOrdered ? m[2].length + 2 : 2);
        const itemLines: string[] = [
          stripColumns(isOrdered ? m[4] : m[3], markerIndent),
        ];
        let itemLoose = false;
        i++;
        while (i < lines.length) {
          const ind = indentWidth(lines[i]);
          const current = stripLazy(lines[i]);
          if (/^\s*$/.test(current)) {
            const nextInd = i + 1 < lines.length
              ? indentWidth(lines[i + 1])
              : -1;
            if (nextInd >= markerIndent) {
              itemLoose = true;
              itemLines.push('');
              i++;
              continue;
            }
            break;
          } else if (ind >= markerIndent) {
            itemLines.push(stripColumns(lines[i], markerIndent));
            i++;
          } else {
            break;
          }
        }
        const children = parse(itemLines.join('\n'));
        items.push({ type: 'list_item', children, loose: itemLoose });
      }
      const listLoose = items.some((it) => (it as any).loose);
      nodes.push({ type: 'list', ordered: isOrdered, items, loose: listLoose });
      continue;
    }

    // fenced code block
    const fenceMatch = stripped.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch && indentWidth(fenceMatch[1]) <= 3) {
      const fenceIndent = indentWidth(fenceMatch[1]);
      const fence = fenceMatch[2];
      const info = fenceMatch[3].trim();
      const language = info
        ? decodeEntities(unescapeMd(info.split(/\s+/)[0]))
        : undefined;
      i++;
      const codeLines: string[] = [];
      while (
        i < lines.length &&
        !stripLazy(lines[i]).trimStart().startsWith(fence)
      ) {
        codeLines.push(stripColumns(stripLazy(lines[i]), fenceIndent));
        i++;
      }
      const closed = i < lines.length && indentWidth(lines[i]) <= 3 &&
        stripLazy(lines[i]).trimStart().startsWith(fence);
      if (closed) i++; // skip closing fence
      else {
        while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
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

    // HTML block (single line)
    {
      const m = stripped.match(/^ {0,3}(<.*>)$/);
      if (m && isHtmlTag(m[1])) {
        nodes.push({ type: 'html', content: m[1] });
        i++;
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
          /^ {0,3}(\*\s*){3,}$/.test(stripLazy(lines[i])) ||
          /^ {0,3}(-\s*){3,}$/.test(stripLazy(lines[i])) ||
          /^ {0,3}(_\s*){3,}$/.test(stripLazy(lines[i])) ||
          /^\s{0,3}[-+*][ \t]+/.test(stripLazy(lines[i])) ||
          /^ {0,3}#{1,6}(?:\s|$)/.test(stripLazy(lines[i]))
        ) {
          break;
        }
        const ln = lines[i];
        if (indentWidth(ln) >= 4) {
          paraLines.push(stripIndent(ln));
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
    const escaped = node.content.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
          const restHTML = rest.map((n) => nodeToHTML(n, refs)).join('\n');
          if (!node.loose) {
            if (rest.length === 0) {
              return `<li>${firstHTML}</li>`;
            }
            if (rest.every((n) => n.type === 'list')) {
              return `<li>${firstHTML}\n${restHTML}\n</li>`;
            }
          }
          if (rest.length === 0) {
            return `<li><p>${firstHTML}</p></li>`;
          }
          return `<li>\n<p>${firstHTML}</p>\n${restHTML}\n</li>`;
        }
        const inner = [first, ...rest].map((n) => nodeToHTML(n, refs)).join(
          '\n',
        );
        return `<li>\n${inner}\n</li>`;
      }
      return `<li>${nodeToHTML(it, refs)}</li>`;
    }).join('\n');
    const tag = node.ordered ? 'ol' : 'ul';
    return `<${tag}>\n${items}\n</${tag}>`;
  } else if (node.type === 'list_item') {
    return node.children.map((n) => nodeToHTML(n, refs)).join('');
  } else if (node.type === 'blockquote') {
    return `<blockquote>\n${
      node.children.map((n) => nodeToHTML(n, refs)).join('')
    }\n</blockquote>`;
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

function stripMd(text: string): string {
  return text.replace(/[*_\[\]`]/g, '');
}

function unescapeMd(text: string): string {
  return text.replace(/\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g, '$1');
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

function inlineToHTML(text: string, refs?: Map<string, RefDef>): string {
  const placeholders: string[] = [];

  // store code spans as placeholders before any other processing
  text = text.replace(/(?<!\\)(`+)([\s\S]*?)\1/g, (_, _p1, p2) => {
    const token = `\u0002${placeholders.length}\u0002`;
    placeholders.push(`<code>${escapeHTML(p2.trim())}</code>`);
    return token;
  });

  // store autolinks as placeholders before handling escapes
  text = text.replace(/<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]*)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<a href="${encodeURI(p1)}">${escapeHTML(p1)}</a>`);
    return token;
  });
  text = text.replace(/<([^\s@<>]+@[^\s@<>]+)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<a href="mailto:${p1}">${escapeHTML(p1)}</a>`);
    return token;
  });

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
    /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g,
    (_, alt, href, title) => {
      const src = encodeURI(
        restoreEntities(restoreEscapes(href.replace(/^<|>$/g, ''))),
      );
      let html = `<img src="${src}" alt="${escapeHTML(stripMd(alt))}"`;
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

  // inline links (direct)
  text = text.replace(
    /\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g,
    (_, textContent, href, title) => {
      const token = `\u0000${placeholders.length}\u0000`;
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
      placeholders.push(
        `<a href="${encodeURI(decodedHref)}"${titleAttr}>${textContent}</a>`,
      );
      return token;
    },
  );

  // reference-style images
  if (refs) {
    text = text.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (m, alt, lab) => {
      const label = (lab || alt).toLowerCase();
      const def = refs.get(label);
      if (!def) return m;
      let html = `<img src="${encodeURI(def.url)}" alt="${
        escapeHTML(stripMd(alt))
      }"`;
      if (def.title) html += ` title="${escapeHTML(def.title)}"`;
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    });

    text = text.replace(/!\[([^\]]+)\](?!\()/g, (m, alt) => {
      const label = alt.toLowerCase();
      const def = refs.get(label);
      if (!def) return m;
      let html = `<img src="${encodeURI(def.url)}" alt="${
        escapeHTML(stripMd(alt))
      }"`;
      if (def.title) html += ` title="${escapeHTML(def.title)}"`;
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    });

    // reference-style links
    text = text.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (m, textContent, lab) => {
      const key = (lab || textContent).toLowerCase();
      const def = refs.get(key);
      if (!def) return m;
      const token = `\u0000${placeholders.length}\u0000`;
      const titleAttr = def.title
        ? ` title="${escapeHTML(decodeEntities(unescapeMd(def.title)))}"`
        : '';
      const href = encodeURI(decodeEntities(unescapeMd(def.url)));
      placeholders.push(
        `<a href="${href}"${titleAttr}>${textContent}</a>`,
      );
      return token;
    });

    text = text.replace(/\[([^\]]+)\](?!\()/g, (m, textContent) => {
      const def = refs.get(textContent.toLowerCase());
      if (!def) return m;
      const token = `\u0000${placeholders.length}\u0000`;
      const titleAttr = def.title
        ? ` title="${escapeHTML(decodeEntities(unescapeMd(def.title)))}"`
        : '';
      const href = encodeURI(decodeEntities(unescapeMd(def.url)));
      placeholders.push(
        `<a href="${href}"${titleAttr}>${textContent}</a>`,
      );
      return token;
    });
  }

  // store HTML tags as placeholders

  text = text.replace(htmlCandidate, (m) => {
    if (isHtmlTag(m)) {
      let html = m;
      if (html.startsWith('<!-->') || html.startsWith('<!--->')) {
        html = html.replace(/>$/, '&gt;');
      }
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    }
    return m;
  });

  let out = escapeHTML(text);

  // backslash at line end creates hard line break
  out = out.replace(/\\\n/g, '<br />\n');

  out = out.replace(
    /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*(?!\*)/g,
    '<strong>$1</strong>',
  );
  out = out.replace(
    /__([^_\s](?:[^_]*[^_\s])?)__(?!_)/g,
    '<strong>$1</strong>',
  );
  out = out.replace(/\*([^*\s](?:[^*]*[^*\s])?)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/_([^_\s](?:[^_]*[^_\s])?)_(?!_)/g, '<em>$1</em>');

  // trim spaces before emphasis at line start
  out = out.replace(/(^|\n)\s+(?=<(?:em|strong)>)/g, '$1');

  if (refs) {
    // reference link placeholders are already handled
  }
  out = out.replace(/ {2}\n/g, '<br />\n');
  out = out.replace(/ (?=\n)/g, '');

  // restore placeholders
  out = out.replace(/\u0000(\d+)\u0000/g, (_, idx) => placeholders[+idx]);
  out = out.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
  out = out.replace(/\u0002(\d+)\u0002/g, (_, idx) => placeholders[+idx]);
  out = out.replace(/\u0003(\d+)\u0003/g, (_, idx) => placeholders[+idx]);

  return out;
}

export function convertToHTML(md: string): string {
  const refDef = /^ {0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]+)")?\s*$/;
  const refs = new Map<string, RefDef>();
  const filtered: string[] = [];
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(refDef);
    if (m) {
      let url = m[2];
      if (url.startsWith('<') && url.endsWith('>')) {
        url = url.slice(1, -1);
      }
      refs.set(m[1].toLowerCase(), {
        url: unescapeMd(url),
        title: m[3] ? unescapeMd(m[3]) : undefined,
      });
    } else {
      filtered.push(line);
    }
  }
  const nodes = parse(filtered.join('\n'));
  return nodes.map((node) => {
    return nodeToHTML(node, refs);
  }).join('\n') + '\n';
}
