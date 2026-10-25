/// <reference lib="dom" />

import type {
  BlockNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
} from '../ast.ts';
import { renderHTML } from './html.ts';

export interface DomRenderOptions {
  /**
   * `parse` preserves CommonMark raw HTML using the browser HTML parser.
   * Use `text` or `omit` for untrusted Markdown unless it is sanitized later.
   */
  readonly rawHTML?: 'parse' | 'text' | 'omit';
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported AST node: ${JSON.stringify(value)}`);
}

function containsRawInline(nodes: readonly InlineNode[]): boolean {
  return nodes.some((node) => {
    switch (node.type) {
      case 'htmlInline':
        return true;
      case 'emphasis':
      case 'strong':
      case 'link':
        return containsRawInline(node.children);
      case 'image':
        return containsRawInline(node.description);
      case 'text':
      case 'softBreak':
      case 'hardBreak':
      case 'code':
        return false;
      default:
        return assertNever(node);
    }
  });
}

function containsRawBlock(nodes: readonly BlockNode[]): boolean {
  return nodes.some((node) => {
    switch (node.type) {
      case 'htmlBlock':
        return true;
      case 'paragraph':
      case 'heading':
        return containsRawInline(node.children);
      case 'blockQuote':
        return containsRawBlock(node.children);
      case 'list':
        return node.children.some((item) => containsRawBlock(item.children));
      case 'codeBlock':
      case 'thematicBreak':
        return false;
      default:
        return assertNever(node);
    }
  });
}

function plainText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
      case 'code':
        return node.value;
      case 'softBreak':
      case 'hardBreak':
        return '\n';
      case 'emphasis':
      case 'strong':
      case 'link':
        return plainText(node.children);
      case 'image':
        return plainText(node.description);
      case 'htmlInline':
        return '';
      default:
        return assertNever(node);
    }
  }).join('');
}

function appendInline(
  parent: Node,
  nodes: readonly InlineNode[],
  ownerDocument: Document,
  rawHTML: 'text' | 'omit',
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'code': {
        if (node.type === 'text') {
          parent.appendChild(ownerDocument.createTextNode(node.value));
        } else {
          const code = ownerDocument.createElement('code');
          code.textContent = node.value;
          parent.appendChild(code);
        }
        break;
      }
      case 'softBreak':
        parent.appendChild(ownerDocument.createTextNode('\n'));
        break;
      case 'hardBreak':
        parent.appendChild(ownerDocument.createElement('br'));
        parent.appendChild(ownerDocument.createTextNode('\n'));
        break;
      case 'emphasis':
      case 'strong': {
        const element = ownerDocument.createElement(
          node.type === 'emphasis' ? 'em' : 'strong',
        );
        appendInline(element, node.children, ownerDocument, rawHTML);
        parent.appendChild(element);
        break;
      }
      case 'link': {
        const link = ownerDocument.createElement('a');
        link.setAttribute('href', node.destination);
        if (node.title !== null) link.setAttribute('title', node.title);
        appendInline(link, node.children, ownerDocument, rawHTML);
        parent.appendChild(link);
        break;
      }
      case 'image': {
        const image = ownerDocument.createElement('img');
        image.setAttribute('src', node.destination);
        image.setAttribute('alt', plainText(node.description));
        if (node.title !== null) image.setAttribute('title', node.title);
        parent.appendChild(image);
        break;
      }
      case 'htmlInline':
        if (rawHTML === 'text') {
          parent.appendChild(ownerDocument.createTextNode(node.value));
        }
        break;
      default:
        assertNever(node);
    }
  }
}

function appendListItem(
  parent: Node,
  item: ListItemNode,
  tight: boolean,
  ownerDocument: Document,
  rawHTML: 'text' | 'omit',
): void {
  const element = ownerDocument.createElement('li');
  for (const block of item.children) {
    if (tight && block.type === 'paragraph') {
      appendInline(element, block.children, ownerDocument, rawHTML);
    } else {
      appendBlock(element, block, ownerDocument, rawHTML);
    }
  }
  parent.appendChild(element);
}

function appendBlock(
  parent: Node,
  node: BlockNode,
  ownerDocument: Document,
  rawHTML: 'text' | 'omit',
): void {
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const element = ownerDocument.createElement(
        node.type === 'paragraph' ? 'p' : `h${node.level}`,
      );
      appendInline(element, node.children, ownerDocument, rawHTML);
      parent.appendChild(element);
      break;
    }
    case 'blockQuote': {
      const element = ownerDocument.createElement('blockquote');
      for (const child of node.children) {
        appendBlock(element, child, ownerDocument, rawHTML);
      }
      parent.appendChild(element);
      break;
    }
    case 'codeBlock': {
      const pre = ownerDocument.createElement('pre');
      const code = ownerDocument.createElement('code');
      const language = node.info?.split(/\s+/, 1)[0];
      if (language) code.className = `language-${language}`;
      code.textContent = node.value;
      pre.appendChild(code);
      parent.appendChild(pre);
      break;
    }
    case 'htmlBlock':
      if (rawHTML === 'text') {
        parent.appendChild(ownerDocument.createTextNode(node.value));
      }
      break;
    case 'thematicBreak':
      parent.appendChild(ownerDocument.createElement('hr'));
      break;
    case 'list': {
      const list = ownerDocument.createElement(node.ordered ? 'ol' : 'ul');
      if (node.ordered && node.start !== 1) {
        list.setAttribute('start', String(node.start));
      }
      for (const item of node.children) {
        appendListItem(list, item, node.tight, ownerDocument, rawHTML);
      }
      parent.appendChild(list);
      break;
    }
    default:
      assertNever(node);
  }
}

/** Render an AST to nodes owned by the supplied browser document. */
export function renderDOM(
  document: DocumentNode,
  ownerDocument: Document,
  options: DomRenderOptions = {},
): DocumentFragment {
  const rawHTML = options.rawHTML ?? 'parse';
  if (rawHTML === 'parse' && containsRawBlock(document.children)) {
    const template = ownerDocument.createElement('template');
    template.innerHTML = renderHTML(document);
    return template.content;
  }

  const fragment = ownerDocument.createDocumentFragment();
  for (const child of document.children) {
    appendBlock(
      fragment,
      child,
      ownerDocument,
      rawHTML === 'parse' ? 'omit' : rawHTML,
    );
  }
  return fragment;
}
