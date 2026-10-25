import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { renderDOM } from '../browser.mod.ts';
import { convertToHTML, parse, renderHTML, toHTML } from '../mod.ts';

class TestNode {
  readonly children: TestNode[] = [];
  readonly attributes: Record<string, string> = {};
  className = '';
  textContent: string | null = null;

  constructor(readonly name: string, readonly value: string | null = null) {}

  appendChild<T>(child: T): T {
    this.children.push(child as TestNode);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

class TestDocument {
  createDocumentFragment(): TestNode {
    return new TestNode('#fragment');
  }

  createElement(name: string): TestNode {
    return new TestNode(name);
  }

  createTextNode(value: string): TestNode {
    return new TestNode('#text', value);
  }
}

Deno.test('parse returns semantic block and inline nodes', () => {
  assertEquals(
    parse('# Hello *world*\n\n```ts extra\nconst x = 1;\n```\n'),
    {
      type: 'document',
      children: [
        {
          type: 'heading',
          level: 1,
          children: [
            { type: 'text', value: 'Hello ' },
            {
              type: 'emphasis',
              children: [{ type: 'text', value: 'world' }],
            },
          ],
        },
        {
          type: 'codeBlock',
          value: 'const x = 1;\n',
          info: 'ts extra',
        },
      ],
    },
  );
});

Deno.test('reference definitions resolve into semantic links', () => {
  assertEquals(parse('[text][id]\n\n[id]: /url "title"\n'), {
    type: 'document',
    children: [{
      type: 'paragraph',
      children: [{
        type: 'link',
        destination: '/url',
        title: 'title',
        children: [{ type: 'text', value: 'text' }],
      }],
    }],
  });
});

Deno.test('HTML entry points all render the semantic AST', () => {
  const source = 'A **strong** result.\n';
  const expected = '<p>A <strong>strong</strong> result.</p>\n';
  assertEquals(renderHTML(parse(source)), expected);
  assertEquals(toHTML(source), expected);
  assertEquals(convertToHTML(source), expected);
});

Deno.test('renderDOM uses the supplied document without a global DOM', () => {
  const ownerDocument = new TestDocument();
  const fragment = renderDOM(
    parse('Hello **world**\n'),
    ownerDocument as unknown as Parameters<typeof renderDOM>[1],
  ) as unknown as TestNode;

  assertEquals(fragment.children[0].name, 'p');
  assertEquals(fragment.children[0].children[0].value, 'Hello ');
  assertEquals(fragment.children[0].children[1].name, 'strong');
  assertEquals(fragment.children[0].children[1].children[0].value, 'world');
});
