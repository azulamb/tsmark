# tsmark

Deno向けの、依存ライブラリを持たないCommonMark 0.31.2パーサーです。
Markdownを意味論的なASTへ変換し、同じASTからHTML文字列、ブラウザDOM、
または利用者独自の出力を作れます。

準拠仕様: [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)

```text
Markdown source -> semantic AST -> HTML string / browser DOM / custom renderer
```

## 基本的な使い方

`mod.ts` はブラウザDOM型に依存しないため、DenoなどDOMを持たない環境でも
利用できます。

```ts
import { parse, renderHTML, toHTML } from './mod.ts';

const ast = parse('Hello **world**');
const html = renderHTML(ast);
const sameHtml = toHTML('Hello **world**');
```

ブラウザDOMへ出力するときは `browser.mod.ts` を使います。`renderDOM()` は
グローバル変数を参照せず、渡された `Document` が所有する
`DocumentFragment` を返します。

```ts
import { parse, renderDOM } from './browser.mod.ts';

const ast = parse('Hello **world**');
const fragment = renderDOM(ast, document);
document.querySelector('main')?.append(fragment);
```

## AST

`parse()` は、以下の公開されたdiscriminated unionからなる `DocumentNode` を
返します。ノード名はHTMLタグではなくMarkdown上の意味を表します。

- Block nodes: `blockQuote`, `codeBlock`, `heading`, `htmlBlock`, `list`,
  `paragraph`, `thematicBreak`
- Inline nodes: `code`, `emphasis`, `hardBreak`, `htmlInline`, `image`, `link`,
  `softBreak`, `strong`, `text`

段落や見出しは未解析のMarkdownや生成済みHTMLではなく、inline nodeを持ちます。
コードブロックも `codeBlock` として表現され、`<pre><code>` のような出力形式は
レンダラーが決定します。このASTを網羅的に走査することで独自レンダラーを
実装できます。正確な型定義は [`src/ast.ts`](./src/ast.ts) を参照してください。

## ブラウザ向けビルドとデモ

```sh
deno task build
```

script tagから読み込める `docs/tsmark.js` が生成され、グローバル変数
`tsmark` から `parse`, `renderHTML`, `toHTML`, `renderDOM` を利用できます。

```html
<script src="./tsmark.js"></script>
<script>
  const ast = tsmark.parse('Hello **world**');
  const html = tsmark.renderHTML(ast);
</script>
```

`docs/index.html` はGitHub Pages向けの動作サンプルです。リポジトリの
Pages sourceを `/docs` に設定すると、そのまま公開できます。

## raw HTMLの扱い

CommonMarkの仕様に従い、ASTには `htmlBlock` と `htmlInline` が含まれます。
`renderDOM()` の既定値はraw HTMLをブラウザで解析します。信頼できないMarkdownを
扱う場合は `{ rawHTML: 'text' }` または `{ rawHTML: 'omit' }` を指定し、用途に
応じて別途サニタイズしてください。

旧APIの `convertToHTML()` は `toHTML()` の非推奨aliasとして残しています。

## 開発と検証

```sh
deno fmt
deno lint
deno task test
deno task build
```
