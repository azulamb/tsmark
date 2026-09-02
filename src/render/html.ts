import type {
  BlockNode,
  DocumentNode,
  ImageNode,
  InlineNode,
  ListItemNode,
  ListNode,
} from '../ast.ts';

/** Render a semantic CommonMark document as its canonical HTML string. */
export function renderHTML(document: DocumentNode): string {
  return renderBlocks(document.children);
}

function renderBlocks(blocks: readonly BlockNode[]): string {
  let html = '';
  for (const block of blocks) html += renderBlock(block);
  return html;
}

function renderBlock(block: BlockNode): string {
  switch (block.type) {
    case 'blockQuote':
      return `<blockquote>\n${renderBlocks(block.children)}</blockquote>\n`;
    case 'codeBlock': {
      const language = block.info === null
        ? ''
        : block.info.trimStart().split(/[\t\n\f\r ]/, 1)[0];
      const classAttribute = language === ''
        ? ''
        : ` class="language-${escapeAttribute(language)}"`;
      return `<pre><code${classAttribute}>${
        escapeHTML(block.value)
      }</code></pre>\n`;
    }
    case 'heading':
      return `<h${block.level}>${
        renderInlines(block.children)
      }</h${block.level}>\n`;
    case 'htmlBlock':
      return block.value.endsWith('\n') ? block.value : `${block.value}\n`;
    case 'list':
      return renderList(block);
    case 'paragraph':
      return `<p>${renderInlines(block.children)}</p>\n`;
    case 'thematicBreak':
      return '<hr />\n';
    default:
      return assertNever(block);
  }
}

function renderList(list: ListNode): string {
  const tag = list.ordered ? 'ol' : 'ul';
  const start = list.ordered && list.start !== 1
    ? ` start="${list.start}"`
    : '';
  let html = `<${tag}${start}>\n`;
  for (const item of list.children) html += renderListItem(item, list.tight);
  return `${html}</${tag}>\n`;
}

function renderListItem(item: ListItemNode, tight: boolean): string {
  let html = '<li>';
  const firstChild = item.children[0];
  if (firstChild !== undefined && (!tight || firstChild.type !== 'paragraph')) {
    html += '\n';
  }
  for (let index = 0; index < item.children.length; index++) {
    const child = item.children[index];
    if (tight && child.type === 'paragraph') {
      html += renderInlines(child.children);
      if (index + 1 < item.children.length) html += '\n';
    } else {
      html += renderBlock(child);
    }
  }
  return `${html}</li>\n`;
}

function renderInlines(inlines: readonly InlineNode[]): string {
  let html = '';
  for (const inline of inlines) html += renderInline(inline);
  return html;
}

function renderInline(inline: InlineNode): string {
  switch (inline.type) {
    case 'code':
      return `<code>${escapeHTML(inline.value)}</code>`;
    case 'emphasis':
      return `<em>${renderInlines(inline.children)}</em>`;
    case 'hardBreak':
      return '<br />\n';
    case 'htmlInline':
      return inline.value;
    case 'image':
      return renderImage(inline);
    case 'link':
      return `<a href="${escapeAttribute(normalizeUrl(inline.destination))}"${
        renderTitle(inline.title)
      }>${renderInlines(inline.children)}</a>`;
    case 'softBreak':
      return '\n';
    case 'strong':
      return `<strong>${renderInlines(inline.children)}</strong>`;
    case 'text':
      return escapeHTML(inline.value);
    default:
      return assertNever(inline);
  }
}

function renderImage(image: ImageNode): string {
  const source = escapeAttribute(normalizeUrl(image.destination));
  const description = escapeAttribute(renderPlainText(image.description));
  return `<img src="${source}" alt="${description}"${
    renderTitle(image.title)
  } />`;
}

function renderTitle(title: string | null): string {
  return title === null ? '' : ` title="${escapeAttribute(title)}"`;
}

/**
 * Render the string content used for an image's alt attribute. Raw HTML is not
 * part of the plain-text description; formatting nodes contribute only their
 * children.
 */
function renderPlainText(inlines: readonly InlineNode[]): string {
  let text = '';
  for (const inline of inlines) {
    switch (inline.type) {
      case 'code':
      case 'text':
        text += inline.value;
        break;
      case 'emphasis':
      case 'link':
      case 'strong':
        text += renderPlainText(inline.children);
        break;
      case 'image':
        text += renderPlainText(inline.description);
        break;
      case 'hardBreak':
      case 'softBreak':
        text += '\n';
        break;
      case 'htmlInline':
        break;
      default:
        assertNever(inline);
    }
  }
  return text;
}

function escapeHTML(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll(
    '>',
    '&gt;',
  ).replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHTML(value);
}

const urlSafeAscii = /^[A-Za-z0-9!#$&'()*+,\-./:;=?@_~]$/;
const hexDigit = /^[0-9A-Fa-f]$/;

/** Percent-encode bytes that CommonMark does not allow verbatim in a URL. */
function normalizeUrl(value: string): string {
  let normalized = '';
  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    if (urlSafeAscii.test(character)) {
      normalized += character;
    } else if (
      character === '%' && index + 2 < value.length &&
      hexDigit.test(value[index + 1]) && hexDigit.test(value[index + 2])
    ) {
      normalized += value.slice(index, index + 3);
      index += 3;
      continue;
    } else {
      const bytes = new TextEncoder().encode(character);
      for (const byte of bytes) {
        normalized += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
    index += character.length;
  }
  return normalized;
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown AST node: ${JSON.stringify(value)}`);
}
