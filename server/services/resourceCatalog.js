// resourceCatalog – the single source of truth for built-in meditation tracks and exercises.
// Seeding is idempotent and race-safe (stable slugs + unique index + upserts). Earlier seed records are
// adopted (keeping their _id) and leftover duplicates from the old count-then-insert race are DEACTIVATED,
// never deleted.
const Meditation = require('../models/Meditation');
const Exercise = require('../models/Exercise');
const generatedTracks = require('../config/meditationTracks.json');

const EXERCISES = [
  // Breathing Exercises
  { slug: 'box-breathing', legacyTitle: 'Box Breathing', title: 'Box Breathing', category: 'Breathing Exercises', duration: 240, difficulty: 'Beginner', icon: 'Square',
    description: 'Breathe in, hold, breathe out and hold again for equal counts of four to steady your nervous system.',
    instructions: ['Sit upright with both feet on the floor.', 'Inhale through your nose for a count of four.', 'Hold your breath gently for four.', 'Exhale slowly through your mouth for four.', 'Hold empty for four, then repeat.'] },
  { slug: 'breathing-4-7-8', title: '4-7-8 Relaxing Breath', category: 'Breathing Exercises', duration: 180, difficulty: 'Intermediate', icon: 'Wind',
    description: 'A long, slow exhale encourages the body’s relaxation response. Useful before sleep or after a stressful moment.',
    instructions: ['Rest the tip of your tongue behind your upper front teeth.', 'Inhale quietly through your nose for four counts.', 'Hold for seven counts.', 'Exhale fully through your mouth for eight counts.', 'Repeat four cycles, then breathe normally. Skip the hold if you feel light-headed.'] },
  { slug: 'diaphragmatic-breathing', legacyTitle: 'Deep Breathing', title: 'Belly (Diaphragmatic) Breathing', category: 'Breathing Exercises', duration: 180, difficulty: 'Beginner', icon: 'Waves',
    description: 'Slow belly breathing that lowers physical arousal by engaging the diaphragm instead of the chest.',
    instructions: ['Place one hand on your chest and one on your belly.', 'Inhale through your nose so the belly hand rises more than the chest hand.', 'Exhale slowly, making the exhale longer than the inhale.', 'Continue at a gentle, comfortable pace.'] },
  // Grounding Techniques
  { slug: 'grounding-5-4-3-2-1', legacyTitle: 'Grounding', title: '5-4-3-2-1 Senses', category: 'Grounding Techniques', duration: 300, difficulty: 'Beginner', icon: 'Eye',
    description: 'Bring your mind back to the present by naming what you notice with each of your senses.',
    instructions: ['Name five things you can see.', 'Name four things you can feel or touch.', 'Name three things you can hear.', 'Name two things you can smell.', 'Name one thing you can taste, then take a slow breath.'] },
  { slug: 'anchor-object', title: 'Anchor Object', category: 'Grounding Techniques', duration: 180, difficulty: 'Beginner', icon: 'Anchor',
    description: 'Use a small object you can hold as an anchor to the here-and-now when feelings run high.',
    instructions: ['Pick up a small object near you – a key, stone or cup.', 'Notice its weight and temperature in your hand.', 'Describe its colour, texture and edges to yourself in detail.', 'Each time your mind drifts, return to describing the object.'] },
  // Mindfulness Exercises
  { slug: 'mindful-breath-awareness', legacyTitle: 'Mindfulness', title: 'Mindful Breath Awareness', category: 'Mindfulness Exercises', duration: 480, difficulty: 'Beginner', icon: 'Leaf',
    description: 'Observe your breath, thoughts and sensations with a gentle, non-judging attitude.',
    instructions: ['Sit comfortably and let your eyes close or soften.', 'Notice the natural rhythm of your breath without changing it.', 'When a thought appears, label it “thinking” and return to the breath.', 'Be kind to yourself each time you return.'] },
  { slug: 'body-scan', title: 'Body Scan Check-in', category: 'Mindfulness Exercises', duration: 600, difficulty: 'Intermediate', icon: 'ScanLine',
    description: 'Move your attention slowly through the body to notice tension and let it soften.',
    instructions: ['Lie down or sit with your back supported.', 'Bring attention to your toes and feet, noticing any sensation.', 'Slowly move up through legs, hips, belly, chest and back.', 'Continue through shoulders, arms, neck and face.', 'Finish by sensing your whole body at once.'] },
  // Physical Relaxation
  { slug: 'progressive-muscle-relaxation', legacyTitle: 'Progressive Muscle Relaxation', title: 'Progressive Muscle Relaxation', category: 'Physical Relaxation', duration: 600, difficulty: 'Intermediate', icon: 'PersonStanding',
    description: 'Tense and release muscle groups from feet to face to feel the difference between tension and relaxation.',
    instructions: ['Tense the muscles of your feet for five seconds.', 'Release and notice the relief for ten seconds.', 'Move upward: calves, thighs, hands, arms, shoulders, face.', 'Avoid tensing any area that is injured or painful.'] },
  { slug: 'neck-shoulder-release', title: 'Neck & Shoulder Release', category: 'Physical Relaxation', duration: 240, difficulty: 'Beginner', icon: 'Activity',
    description: 'Gentle movements that release tension stored in the neck and shoulders after long periods of sitting.',
    instructions: ['Roll your shoulders backwards slowly five times.', 'Drop your right ear towards your right shoulder and breathe for three breaths.', 'Repeat on the left side.', 'Finish with slow chin-to-chest nods. Stop if anything hurts.'] },
  // Focus Exercises
  { slug: 'single-point-focus', title: 'Single-Point Focus', category: 'Focus Exercises', duration: 180, difficulty: 'Intermediate', icon: 'Target',
    description: 'Train attention by resting your gaze on one point and gently returning whenever it wanders.',
    instructions: ['Choose a point in front of you, such as a dot on paper.', 'Rest your eyes on it with a soft, steady gaze.', 'When your attention wanders, notice where it went.', 'Return to the point without criticising yourself.'] },
  { slug: 'count-breaths-to-ten', title: 'Counting Breaths to Ten', category: 'Focus Exercises', duration: 300, difficulty: 'Beginner', icon: 'Hash',
    description: 'Count each exhale from one to ten, then start again – a simple way to sharpen concentration.',
    instructions: ['Breathe naturally.', 'Silently count “one” on the first exhale, “two” on the next, up to ten.', 'If you lose count, start again at one.', 'Notice how often attention wanders – without judging it.'] },
  // Emotional Wellness Activities
  { slug: 'name-it-to-tame-it', title: 'Name It to Tame It', category: 'Emotional Wellness Activities', duration: 240, difficulty: 'Beginner', icon: 'Heart',
    description: 'Putting feelings into words can reduce their intensity. Identify, rate and respond to what you feel.',
    instructions: ['Pause and ask: what am I feeling right now?', 'Name the emotion as precisely as you can.', 'Rate its intensity from 0 to 10.', 'Ask what you need right now, and choose one small kind action.'] },
  { slug: 'self-compassion-break', title: 'Self-Compassion Break', category: 'Emotional Wellness Activities', duration: 300, difficulty: 'Beginner', icon: 'HeartHandshake',
    description: 'Respond to a difficult moment the way you would comfort a good friend.',
    instructions: ['Acknowledge: “This is a moment of difficulty.”', 'Remind yourself: “Struggle is part of being human.”', 'Place a hand on your chest and offer yourself kind words.', 'Ask: what do I need to hear right now?'] },
  { slug: 'three-good-things', title: 'Three Good Things', category: 'Emotional Wellness Activities', duration: 300, difficulty: 'Beginner', icon: 'Smile',
    description: 'Reflect on three things that went well today and why they happened.',
    instructions: ['Think back over your day.', 'Recall three things that went well, however small.', 'For each one, consider why it happened.', 'Notice how it feels to remember them.'] },
  // Stress Management Exercises
  { slug: 'worry-window', title: 'Worry Window', category: 'Stress Management Exercises', duration: 600, difficulty: 'Intermediate', icon: 'Clock',
    description: 'Contain worrying to a set time so it takes up less of your day.',
    instructions: ['Use this timer as your worry window.', 'Write down every worry that comes up.', 'Mark each one: can I act on it, or not?', 'Choose one small action for an actionable worry.', 'When the timer ends, close the list until tomorrow.'] },
  { slug: 'stress-to-action-reset', title: 'Stress-to-Action Reset', category: 'Stress Management Exercises', duration: 300, difficulty: 'Beginner', icon: 'ListChecks',
    description: 'Turn a vague feeling of pressure into one clear next step.',
    instructions: ['Write down what is stressing you most right now.', 'Separate what you can control from what you cannot.', 'Pick the smallest useful action you can take today.', 'Schedule it, then take three slow breaths.'] },
];

// Earlier 30-second loops from the original build: synthesised tones/noise (exact musical pitches, no recordings)
const LEGACY_LOOPS = [
  { slug: 'loop-morning-chord', legacyTitle: 'Quiet Morning Piano', title: 'Morning Chord (short loop)', category: 'Deep Relaxation', url: '/audio/relaxing-music.wav',
    description: 'A soft sustained major chord of pure tones. 30-second loop.' },
  { slug: 'loop-soft-shower', legacyTitle: 'Forest Rain Reset', title: 'Soft Noise Shower (short loop)', category: 'Nature Sounds', url: '/audio/nature-sounds.wav',
    description: 'Gently filtered noise that resembles light rain. 30-second loop.' },
  { slug: 'loop-focus-drone', legacyTitle: 'Deep Focus Flow', title: 'Focus Drone (short loop)', category: 'Focus and Concentration', url: '/audio/deep-focus.wav',
    description: 'A low steady drone with soft upper tones. 30-second loop.' },
  { slug: 'loop-sleep-drone', legacyTitle: 'Sleep Body Drift', title: 'Sleep Drone (short loop)', category: 'Sleep Music', url: '/audio/sleep-meditation.wav',
    description: 'A very calm low drone for winding down. 30-second loop.' },
  { slug: 'loop-calm-tones', legacyTitle: 'Anxiety Relief Ground', title: 'Calm Tones (short loop)', category: 'Stress Relief', url: '/audio/anxiety-relief.wav',
    description: 'Two gentle sustained tones with space between them. 30-second loop.' },
].map((t) => ({
  ...t,
  duration: 30,
  isShortLoop: true,
  sortOrder: 50,
  source: 'Synthesised tones from the earlier Lumina build (pure musical pitches; no third-party recording)',
  license: 'Project asset – origin not separately documented',
}));

const MEDITATIONS = [
  ...generatedTracks.map((t, i) => ({
    slug: t.slug, title: t.title, category: t.category, description: t.description, url: t.url,
    duration: t.durationSeconds, guide: t.guide, breathing: t.breathing || undefined, source: t.source, license: t.license,
    isShortLoop: false, sortOrder: 10 + i,
  })),
  ...LEGACY_LOOPS,
];

async function syncModel(Model, defs) {
  await Model.init(); // make sure the unique slug index exists before upserting
  for (const def of defs) {
    const { legacyTitle, ...fields } = def;
    if (legacyTitle && !(await Model.exists({ slug: def.slug }))) {
      // Adopt the oldest earlier seed record so existing references (history) stay valid
      const legacy = await Model.findOne({ title: legacyTitle, slug: { $exists: false } }).sort({ createdAt: 1 });
      if (legacy) await Model.updateOne({ _id: legacy._id, slug: { $exists: false } }, { $set: { slug: def.slug } }).catch((e) => { if (e.code !== 11000) throw e; });
    }
    await Model.updateOne({ slug: def.slug }, { $set: { ...fields, active: true } }, { upsert: true, runValidators: false })
      .catch((e) => { if (e.code !== 11000) throw e; }); // a concurrent upsert won – fine
    if (legacyTitle) {
      await Model.updateMany({ title: legacyTitle, slug: { $exists: false } }, { $set: { active: false } }); // hide duplicates
    }
  }
}

let ready = null;
/** Idempotent; runs once per process. */
function ensureCatalogue() {
  if (!ready) {
    ready = Promise.all([syncModel(Exercise, EXERCISES), syncModel(Meditation, MEDITATIONS)])
      .catch((err) => { ready = null; throw err; });
  }
  return ready;
}

module.exports = { ensureCatalogue, EXERCISES, MEDITATIONS };
