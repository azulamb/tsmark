# tsmark development instructions

## Product goal

Implement a CommonMark 0.31.2 parser in pure TypeScript for Deno.
The parser must use this pipeline:

```text
Markdown source -> semantic AST -> HTML string / browser DOM / custom renderer
```

The AST is the primary product. HTML and DOM output are renderers of that AST;
parser code must never emit HTML fragments.

Normative source: https://spec.commonmark.org/0.31.2/

## Public capabilities

- Parse Markdown into a documented, discriminated-union AST.
- Render an AST to the exact CommonMark HTML output.
- Parse and render Markdown to HTML with one convenience function.
- Render an AST to browser DOM without requiring DOM globals in Deno.
- Let callers implement custom output by traversing the public AST.

See `README.md` for the public API and architecture overview.

## Non-negotiable constraints

- Do not use runtime parsing or rendering libraries.
- Do not copy another library's implementation.
- Use the CommonMark 0.31.2 specification and examples as the authority.
- Keep browser-only APIs out of the parser and HTML-string renderer.
- Do not change `tests/spec.json` or weaken/replace `tests/test.ts`.
- Do not use import maps to change test behavior.
- Preserve exact CommonMark output, including escaping and trailing newlines.
- Use English branch names, identifiers, filenames, and commit messages.

Test-only dependencies used by the existing test harness are not runtime
dependencies and are outside the no-library constraint.

## Architecture rules

- Represent block and inline constructs as semantic nodes, not HTML-shaped
  nodes. For example, a fenced block is `codeBlock`; `<pre><code>` exists only
  in renderers.
- Use discriminated unions with exhaustive switches. Avoid `any`, broad type
  assertions, and optional fields that make invalid node states possible.
- Normalize input once. Preserve source text or source positions only through a
  documented field, never through renderer-specific data.
- Keep block parsing, inline parsing, reference resolution, and rendering in
  separate modules.
- Raw HTML nodes are allowed because CommonMark defines raw HTML; they do not
  make the rest of the AST DOM-shaped.
- Establish extension points around AST transforms and renderers after the core
  node contract is stable. Do not add a speculative plugin framework to the
  parser core.

## Rewrite strategy

The existing implementation currently passes all 652 conformance examples but
does not provide the desired AST architecture. Treat it as a compatibility
baseline, not as the design to extend.

- Build the replacement engine behind a separate internal entry point.
- Work in vertical slices with a typed AST node, parser support, renderer
  support, focused tests, and relevant conformance examples in the same change.
- Keep the current public renderer active until the replacement reaches full
  conformance.
- Switch public exports only when the replacement passes all conformance tests
  and the AST/DOM API tests.
- Delete legacy code only after the replacement is active and verified.

## Allowed changes

- Product code: `src/` and public exports in `mod.ts`.
- New focused tests may be added under `tests/`.
- Project documentation and Codex configuration may be updated when the task is
  specifically about architecture or development workflow.
- Never edit the downloaded CommonMark fixture or the existing conformance
  harness to make a failure pass.

## Verification

After changing TypeScript:

```text
deno fmt
deno lint
deno task test
```

During focused development, individual conformance indexes may be passed to the
test file. Before handoff, run the full suite once; do not retry unchanged
failures. Report the failing CommonMark example number and section.

## Agent workflow

For changes that cross parser stages or require non-obvious specification
interpretation, delegate independent work when useful:

- `commonmark_spec` determines the applicable normative rules and examples.
- `ast_architect` checks the semantic AST and public API boundaries.
- `parser_implementer` owns a bounded implementation slice after its contract
  is clear.
- `conformance_reviewer` independently reviews behavior and regression risk.

The primary agent owns integration and final decisions. Do not have multiple
agents edit the same files concurrently. Small, local, unambiguous changes do
not require delegation.

## Definition of done

- The requested API or parsing behavior is implemented without renderer logic
  leaking into the parser.
- New public behavior has focused tests.
- `deno fmt`, `deno lint`, and all 652 CommonMark tests pass.
- Public types and exports are documented.
- No test fixture, test expectation, or unrelated file was changed.
