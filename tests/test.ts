import * as assert from 'jsr:@std/assert';
import tests from './spec.json' with { type: 'json' };
import { convertToHTML } from '../src/tsmark.ts';

for (const test of tests) {
  const actual = convertToHTML(test.markdown);
  assert.assertEquals(actual, test.html, `Test failed[${test.example}]:`);
}
