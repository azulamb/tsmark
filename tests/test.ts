import * as assert from 'jsr:@std/assert';
import tests from './spec.json' with { type: 'json' };
import { convertToHTML } from '../src/html.ts';

const testIds = Deno.args.map((arg) => {
  const id = parseInt(arg, 10);
  return isNaN(id) ? -1 : id;
}).filter((id) => {
  return 0 <= id;
});

const testCases = 0 < testIds.length
  ? tests.filter((_test, index) => {
    return testIds.includes(index);
  })
  : tests;

let id = 0;
for (const test of testCases) {
  const showId = 0 < testIds.length ? testIds[id] : id;
  ++id;
  Deno.test(`test[${showId}]`, () => {
    const actual = convertToHTML(test.markdown);
    assert.assertEquals(actual, test.html, `Test failed[${test.example}]:`);
  });
}
