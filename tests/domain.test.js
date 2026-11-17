import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, scoreAnswers, gradeAnswers, metrics, csv, dateRange } from '../lib/learning-domain.js';

const items = questions([
  { type:'mcq',prompt:'Which key is unique?',topic:'Keys',points:10,options:['Primary','Foreign'],correct:0 },
  { type:'essay',prompt:'Explain normalization.',topic:'Normalization',points:20,rubric:'Definition 10; example 10.' }
]);
test('mixed scoring separates pending essays from incorrect answers', () => {
  const answers = scoreAnswers(items,[1,'A description']);
  assert.equal(answers[0].score,0); assert.equal(answers[1].score,null);
  const result = metrics(items,30,[{answers}]);
  assert.equal(result.pending,1); assert.equal(result.accuracy,0); assert.equal(result.completion,3.3);
});
test('agreed classroom example is 80% complete and 75% accurate', () => {
  const q = [items[0]], submissions = Array.from({length:24},(_,i) => ({ answers:scoreAnswers(q,[i<18 ? 0 : 1]) }));
  assert.equal(metrics(q,30,submissions).completion,80);
  assert.equal(metrics(q,30,submissions).accuracy,75);
  assert.equal(metrics(q,0,[]).accuracy,null);
});
test('manual grades are bounded and cannot replace automatic grades', () => {
  const old = scoreAnswers(items,[0,'Explanation']);
  const graded = gradeAnswers(items,old,[{score:0},{score:15,feedback:'Add an example',needsPractice:true}]);
  assert.equal(graded[0].score,10); assert.equal(graded[1].score,15); assert.equal(old[1].score,null);
  for (const score of [-1,21,'',null]) assert.throws(() => gradeAnswers(items,old,[{}, {score}]));
});
test('reject invalid options, missing answers, and ambiguous dates', () => {
  assert.throws(() => questions([{...items[0],options:['same','same']}]));
  assert.throws(() => scoreAnswers(items,['','text']));
  assert.throws(() => dateRange({from:'2026-02-30'}));
  assert.throws(() => dateRange({from:'2026-04-02',to:'2026-04-01'}));
});
test('CSV quotes delimiters and neutralizes spreadsheet formulas', () => {
  assert.equal(csv([['=SUM(A1)', 'a,"b"', null]]), '"\'=SUM(A1)","a,""b""",""');
});
