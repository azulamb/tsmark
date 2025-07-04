import * as assert from 'jsr:@std/assert';
import tests from './spec.json' with { type: 'json' };
import { convertToHTML } from '../src/tsmark.ts';

const testCases = Deno.args.map((arg) => {
  const id = parseInt(arg, 10);
  return isNaN(id) ? 0 : id;
}).filter((id) => {
  return 0 < id;
});

let id = 0;
for (const test of tests) {
  if (0 < testCases.length) {
    if (!testCases.includes(++id)) {
      continue;
    }
  }
  const actual = convertToHTML(test.markdown);
  assert.assertEquals(actual, test.html, `Test failed[${test.example}]:`);
}
