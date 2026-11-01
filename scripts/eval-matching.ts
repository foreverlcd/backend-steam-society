import { DEFAULT_MATCHING_CONFIG } from '../src/modules/matching/domain/matching.config.js';
import { recommend } from '../src/modules/matching/domain/recommend.js';
import {
  EVAL_MENTEES,
  EVAL_MENTORS,
  toEvalCandidate,
  toEvalMentee,
} from './fixtures/matching-eval.js';

const target = Number(process.env.MATCHING_PRECISION_TARGET ?? '0.6');
const candidates = EVAL_MENTORS.map(toEvalCandidate);
let totalPrecision = 0;

for (const evalMentee of EVAL_MENTEES) {
  const results = recommend({
    mentee: toEvalMentee(evalMentee),
    candidates,
    config: DEFAULT_MATCHING_CONFIG,
  });
  const top3 = results.slice(0, 3).map((result) => result.mentorId);
  const expected = new Set(evalMentee.expectedTop3);
  const hits = top3.filter((mentorId) => expected.has(mentorId)).length;
  const precision = hits / evalMentee.expectedTop3.length;
  totalPrecision += precision;

  const invalid = results.some(
    (result) => result.score < 0 || result.score > 100,
  );

  if (invalid) {
    throw new Error(`Score out of range for mentee ${evalMentee.id}`);
  }

  console.log(
    `${evalMentee.id}  precision@3=${precision.toFixed(2)}  top3=${top3.join(',')}  expected=${evalMentee.expectedTop3.join(',')}`,
  );
}

const average = totalPrecision / EVAL_MENTEES.length;
console.log(
  `\nprecision@3 average: ${average.toFixed(3)} (target ${target.toFixed(2)}, mentees ${EVAL_MENTEES.length}, mentors ${EVAL_MENTORS.length})`,
);

if (average < target) {
  process.exitCode = 1;
}
