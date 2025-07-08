export const LAZY = '\u0001';

export function isHtmlTag(tag: string): boolean {
  const openTag =
    /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>$/s;
  const closeTag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/;
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

export function stripLazy(line: string): string {
  return line.startsWith(LAZY) ? line.slice(1) : line;
}

export function indentWidth(line: string): number {
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

export function stripColumns(line: string, count: number): string {
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

export function stripIndent(line: string): string {
  return stripColumns(line, 4);
}

export function indentWidthFrom(line: string, start: number): number {
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

export function stripColumnsFrom(
  line: string,
  count: number,
  start: number,
): string {
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

export function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

export function encodeHref(url: string): string {
  return encodeURI(url).replace(/%25([0-9a-fA-F]{2})/g, '%$1');
}

export function stripMd(text: string): string {
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

export function unescapeMd(text: string): string {
  return text.replace(/\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g, '$1');
}

export function caseFold(str: string): string {
  return str.toLowerCase().replace(/\u00DF/g, 'ss');
}

export function normalizeLabel(text: string): string {
  return caseFold(text).replace(/\s+/g, ' ').trim();
}

export function isValidLabel(text: string): boolean {
  let depth = 0;
  let hasNonSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      if (depth === 0) {
        return false;
      }
      depth--;
    } else if (ch.trim() !== '') {
      hasNonSpace = true;
    }
  }
  return depth === 0 && hasNonSpace;
}

export const namedEntities: Record<string, string> = {
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

export function decodeEntities(text: string): string {
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
