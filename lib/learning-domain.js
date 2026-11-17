export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const check = (condition, message, status = 400) => { if (!condition) throw new HttpError(status, message); };
export const id = (value) => {
  const number = Number(value);
  check(Number.isSafeInteger(number) && number > 0, 'Select a valid record.');
  return number;
};
export function textValue(value, label, min = 1, max = 5000) {
  const text = String(value ?? '').trim();
  check(text.length >= min && text.length <= max, `${label} must contain ${min}-${max} characters.`);
  return text;
}
export function questions(input) {
  check(Array.isArray(input) && input.length > 0 && input.length <= 50, 'Add between 1 and 50 questions.');
  return input.map((q) => {
    check(['mcq', 'essay'].includes(q.type), 'Choose multiple choice or essay.');
    const points = Number(q.points);
    check(Number.isFinite(points) && points > 0 && points <= 1000, 'Question points must be greater than zero and at most 1000.');
    const result = { type: q.type, prompt: textValue(q.prompt, 'Question'), topic: textValue(q.topic, 'Topic', 1, 100), points };
    if (q.type === 'mcq') {
      check(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8, 'Provide 2-8 answer options.');
      result.options = q.options.map((v) => textValue(v, 'Option', 1, 1000));
      check(new Set(result.options).size === result.options.length, 'Answer options must be different.');
      result.correct = Number(q.correct);
      check(q.correct !== '' && Number.isInteger(result.correct) && result.correct >= 0 && result.correct < result.options.length, 'Choose a correct answer.');
    } else {
      result.rubric = textValue(q.rubric, 'Scoring rubric');
    }
    return result;
  });
}
export function scoreAnswers(items, input) {
  check(Array.isArray(input) && input.length === items.length, 'Answer every question.');
  return items.map((q, index) => {
    const answer = input[index];
    if (q.type === 'mcq') {
      check(answer !== '' && answer !== null && Number.isInteger(Number(answer)) && Number(answer) >= 0 && Number(answer) < q.options.length, `Choose an answer for question ${index + 1}.`);
      return { answer: Number(answer), score: Number(answer) === q.correct ? q.points : 0, feedback: '', needsPractice: Number(answer) !== q.correct };
    }
    return { answer: textValue(answer, `Answer ${index + 1}`, 1, 20000), score: null, feedback: '', needsPractice: false };
  });
}
export function gradeAnswers(items, previous, input) {
  check(Array.isArray(input) && input.length === items.length, 'Provide a grade for every question.');
  return previous.map((answer, index) => {
    if (items[index].type === 'mcq') return answer;
    const grade = input[index];
    const score = Number(grade?.score);
    check(grade?.score !== '' && grade?.score != null && Number.isFinite(score) && score >= 0 && score <= items[index].points, `Question ${index + 1}: score must be between 0 and ${items[index].points}.`);
    return { ...answer, score, feedback: textValue(grade.feedback, 'Feedback', 0), needsPractice: grade.needsPractice === true };
  });
}
export const percent = (part, total) => total ? Math.round(part / total * 1000) / 10 : null;
export function metrics(items, participants, submissions) {
  let correct = 0, gradedChoices = 0, pending = 0;
  for (const submission of submissions) submission.answers.forEach((answer, index) => {
    if (answer.score === null) pending++;
    if (items[index].type === 'mcq' && answer.score !== null) {
      gradedChoices++;
      if (answer.score === items[index].points) correct++;
    }
  });
  return { participants, submitted: submissions.length, completion: percent(submissions.length, participants), accuracy: percent(correct, gradedChoices), correct, gradedChoices, pending };
}
export function csv(rows) {
  return rows.map((row) => row.map((value) => {
    let cell = String(value ?? '');
    if (/^[=+@\-\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
export function dateRange(query) {
  const result = {};
  for (const key of ['from', 'to']) {
    if (!query[key]) continue;
    const value = String(query[key]);
    check(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Use valid filter dates.');
    result[key] = value;
  }
  check(!result.from || !result.to || result.from <= result.to, 'From date must not be after To date.');
  return result;
}
