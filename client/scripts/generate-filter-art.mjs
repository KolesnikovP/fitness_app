// Generates the art on the Exercises screen's muscle group and equipment
// filter cards: realistic 3D anatomy renders and matching equipment renders,
// on transparent backgrounds (the cards supply the navy).
//
// Usage (from client/, macOS: resizing uses sips):
//   OPENAI_API_KEY=... node scripts/generate-filter-art.mjs
//   ONLY=biceps,barbell OPENAI_API_KEY=... node scripts/generate-filter-art.mjs
//
// Full-size originals go to art-source/exercise-filters (git-ignored); 768px
// copies go to assets/exercise-filters, which the app bundles. Existing
// originals are skipped, so delete one to regenerate it. New files also need
// an entry in src/entities/exercise/filterArt.ts.

import { execFileSync } from 'node:child_process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = path.resolve('art-source/exercise-filters');
const ASSETS = path.resolve('assets/exercise-filters');

const LOOK =
  'Photorealistic 3D anatomical render of an athletic male muscle model with the skin removed. The body is a matte light grey and silver anatomy model with fine visible muscle fiber striations. Soft studio lighting, subtle shadows, very high detail, premium fitness-app art. No text, no labels, no face detail. Transparent background. The body is cropped tightly and may run off the edges of the frame.';

// [camera framing, muscles to highlight]. Biceps and full body were reworded
// after OpenAI's safety filter blocked the first attempts; full body is still
// blocked as of this writing.
const MUSCLES = {
  chest: ['upper torso and arms from a slight three-quarter front angle', 'pectoral (chest) muscles'],
  back: ['upper body seen from behind at a slight three-quarter angle', 'latissimus dorsi, trapezius and rhomboids'],
  shoulders: ['upper torso and shoulders from a three-quarter front angle', 'deltoid (shoulder) muscles'],
  biceps: [
    'head, shoulders and one arm raised in a classic biceps flex, from a three-quarter front angle, cropped at mid-chest so nothing below the chest is visible',
    'biceps',
  ],
  triceps: ['upper body from behind with the arm slightly bent, focused on the back of the upper arm', 'triceps'],
  forearms: ['bent arm from elbow to hand, close-up', 'forearm muscles'],
  abs: ['midsection from the chest down to the hips, front view', 'abdominal muscles (rectus abdominis and obliques)'],
  quads: ['hips and thighs from the front at a slight angle', 'quadriceps on the front of both thighs'],
  hamstrings: ['hips and thighs seen from behind', 'hamstrings on the back of both thighs'],
  glutes: ['hips and upper thighs seen from behind at a three-quarter angle', 'gluteal muscles'],
  calves: ['lower legs from the knees down, seen from behind', 'calf muscles (gastrocnemius and soleus)'],
  full_body: [
    'the whole figure from head to knees, seen from behind at a three-quarter back angle, wearing plain fitted dark grey athletic compression shorts',
    'all major muscle groups',
  ],
};

const EQUIPMENT = {
  barbell: 'a loaded barbell',
  dumbbell: 'a single dumbbell',
  machine: 'a weight-stack gym machine',
  cable: 'a cable pulley station with a handle',
  kettlebell: 'a kettlebell',
  band: 'a looped resistance band',
  other: 'a medicine ball',
};

function musclePrompt([view, target]) {
  return `${LOOK} Show the ${view}. Only the ${target} are colored in realistic deep red-orange muscle tissue; everything else stays grey. Place the subject in the right two-thirds of the frame.`;
}

function equipmentPrompt(object) {
  return `Photorealistic 3D studio render of ${object}, brushed steel and matte dark graphite with one subtle deep red-orange accent, soft studio lighting, subtle shadows, very high detail, premium fitness-app art, three-quarter angle. No text, no logos. Transparent background. The entire object must be fully visible inside the frame, nothing cut off at any edge, with a clear empty margin around it on all sides; for long objects like a barbell, show it at a diagonal angle so both ends fit.`;
}

const BODYWEIGHT = `${LOOK} Show the whole figure in the low position of a push-up, side three-quarter view, with chest, shoulders and triceps in realistic deep red-orange muscle tissue. Place the subject in the right two-thirds of the frame.`;

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY first.');
  process.exit(1);
}

// Use IMAGE_MODEL if set, otherwise the newest gpt-image model this key can see.
async function pickModel() {
  if (process.env.IMAGE_MODEL) return process.env.IMAGE_MODEL;
  const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`listing models: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  const newest = data.filter((m) => m.id.startsWith('gpt-image')).sort((a, b) => b.created - a.created)[0];
  if (!newest) throw new Error('No gpt-image models available for this key.');
  return newest.id;
}

let jobs = [
  ...Object.entries(MUSCLES).map(([value, spec]) => ({ kind: 'muscle', value, prompt: musclePrompt(spec) })),
  ...Object.entries(EQUIPMENT).map(([value, object]) => ({
    kind: 'equipment',
    value,
    prompt: equipmentPrompt(object),
  })),
  { kind: 'equipment', value: 'bodyweight', prompt: BODYWEIGHT },
];
if (process.env.ONLY) {
  const only = new Set(process.env.ONLY.split(','));
  jobs = jobs.filter((j) => only.has(j.value));
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const model = await pickModel();
console.log(`using ${model}`);

async function generate(job) {
  const file = path.join(SOURCE, job.kind, `${job.value}.png`);
  if (await exists(file)) return console.log(`skip ${job.kind}/${job.value}`);
  await mkdir(path.dirname(file), { recursive: true });
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: job.prompt,
      size: '1536x1024',
      quality: 'medium',
      background: 'transparent',
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`${job.kind}/${job.value}: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  await writeFile(file, Buffer.from(data[0].b64_json, 'base64'));
  console.log(`ok   ${job.kind}/${job.value}`);
}

// A few at a time to stay under rate limits.
const failures = [];
for (let i = 0; i < jobs.length; i += 4) {
  const results = await Promise.allSettled(jobs.slice(i, i + 4).map(generate));
  for (const r of results) if (r.status === 'rejected') failures.push(r.reason.message);
}

// Resize every original into the bundled assets.
for (const kind of ['muscle', 'equipment']) {
  const dir = path.join(SOURCE, kind);
  if (!(await exists(dir))) continue;
  await mkdir(path.join(ASSETS, kind), { recursive: true });
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.png'))) {
    execFileSync('sips', ['--resampleWidth', '768', path.join(dir, f), '--out', path.join(ASSETS, kind, f)], {
      stdio: 'ignore',
    });
  }
}

if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nDone.');
