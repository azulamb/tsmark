import type {
  BlockNode,
  DocumentNode,
  HeadingLevel,
  ListItemNode,
} from './ast.ts';
import { parseInlines, type ReferenceDefinition } from './parser/inlines.ts';
import { parse as parseBlockStructure } from './tsmark.ts';
import type { RefDef, TsmarkNode } from './types.d.ts';
import { decodeEntities, unescapeMd } from './utils.ts';

function convertReferences(
  references: ReadonlyMap<string, RefDef>,
): ReadonlyMap<string, ReferenceDefinition> {
  return new Map(
    [...references].map(([label, definition]) => [
      label,
      {
        destination: decodeEntities(unescapeMd(definition.url)),
        title: definition.title === undefined
          ? null
          : decodeEntities(unescapeMd(definition.title)),
      },
    ]),
  );
}

function convertListItem(
  node: TsmarkNode & { type: 'list_item' },
  references: ReadonlyMap<string, ReferenceDefinition>,
): ListItemNode {
  return {
    type: 'listItem',
    children: node.children.map((child) => convertBlock(child, references)),
  };
}

function convertBlock(
  node: TsmarkNode,
  references: ReadonlyMap<string, ReferenceDefinition>,
): BlockNode {
  switch (node.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        children: parseInlines(node.content, references),
      };
    case 'heading':
      return {
        type: 'heading',
        level: node.level as HeadingLevel,
        children: parseInlines(node.content, references),
      };
    case 'code_block':
      return {
        type: 'codeBlock',
        value: node.content,
        info: node.info ?? node.language ?? null,
      };
    case 'blockquote':
      return {
        type: 'blockQuote',
        children: node.children.map((child) => convertBlock(child, references)),
      };
    case 'thematic_break':
      return { type: 'thematicBreak' };
    case 'html':
      return { type: 'htmlBlock', value: node.content };
    case 'list': {
      const children = node.items.map((item) => {
        if (item.type !== 'list_item') {
          throw new TypeError(`Expected list_item, received ${item.type}`);
        }
        return convertListItem(item, references);
      });
      if (node.ordered) {
        return {
          type: 'list',
          ordered: true,
          start: node.start ?? 1,
          delimiter: node.delimiter ?? '.',
          tight: !(node.loose ?? false),
          children,
        };
      }
      return {
        type: 'list',
        ordered: false,
        marker: node.marker ?? '-',
        tight: !(node.loose ?? false),
        children,
      };
    }
    case 'list_item':
      throw new TypeError('A list item cannot appear outside a list');
  }
}

/** Parse CommonMark source into the public semantic AST. */
export function parse(source: string): DocumentNode {
  const normalized = source.replace(/\0/g, '\uFFFD');
  const { nodes, refs } = parseBlockStructure(normalized);
  const references = convertReferences(refs);
  return {
    type: 'document',
    children: nodes.map((node) => convertBlock(node, references)),
  };
}
