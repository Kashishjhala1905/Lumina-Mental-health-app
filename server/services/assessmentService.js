// assessmentService – the wellness self-check (versioned). It is a reflection tool, NOT a diagnosis.
// v2 fixes v1 scoring: negatively worded items (stress, anxiety) are now reverse-scored.
const VERSION = 'wellness-check-v2';

const QUESTIONS = [
  { id: 'stress', text: 'How often do you feel overwhelmed by stress?', reverse: true, area: 'Stress' },
  { id: 'sleep', text: 'How is your sleep quality?', reverse: false, area: 'Sleep' },
  { id: 'support', text: 'Do you feel connected to your support network?', reverse: false, area: 'Social connection' },
  { id: 'anxiety', text: 'How often do you experience anxiety?', reverse: true, area: 'Anxiety' },
  { id: 'satisfaction', text: 'Rate your overall life satisfaction', reverse: false, area: 'Life satisfaction' },
  { id: 'emotions', text: 'How well do you manage emotions?', reverse: false, area: 'Emotional regulation' },
  { id: 'coping', text: 'Do you have healthy coping mechanisms?', reverse: false, area: 'Coping' },
  { id: 'selfcare', text: 'How often do you practice self-care?', reverse: false, area: 'Self-care' },
];

const LEVELS = [
  { min: 75, result: 'Excellent', summary: 'Your answers suggest you are doing well overall. Keep the habits that support you.' },
  { min: 55, result: 'Good', summary: 'Your answers suggest you are coping reasonably well, with a few areas that could use attention.' },
  { min: 35, result: 'Fair', summary: 'Your answers suggest you may be under some strain. Small, regular steps can help.' },
  { min: 0, result: 'Needs Attention', summary: 'Your answers suggest you are going through a hard time. Consider talking to a counselor or someone you trust.' },
];

const AREA_TIPS = {
  Stress: 'Try the Stress-to-Action Reset exercise and the Stress Management guide in Resources.',
  Sleep: 'Read the Sleep Hygiene guide and try the Sleep Music tracks before bed.',
  'Social connection': 'Reach out to one person this week; the Social Connection guide has small steps.',
  Anxiety: 'Practise Box Breathing or the 5-4-3-2-1 Senses grounding exercise when anxiety rises.',
  'Life satisfaction': 'The Three Good Things activity can help you notice what is going well.',
  'Emotional regulation': 'Try Name It to Tame It to put feelings into words before reacting.',
  Coping: 'Explore the exercises in Resources to build a small toolkit of healthy coping strategies.',
  'Self-care': 'Schedule one small self-care action today, such as a short walk or a calm audio track.',
};

/** Scores a complete set of answers. answers: { [questionId]: 1..5 } */
function scoreAssessment(answers) {
  const errors = [];
  const items = QUESTIONS.map((q) => {
    const value = Number(answers?.[q.id]);
    if (!Number.isInteger(value) || value < 1 || value > 5) errors.push(q.id);
    const wellbeing = q.reverse ? 6 - value : value; // 1 (low wellbeing) … 5 (high wellbeing)
    return { questionId: q.id, question: q.text, area: q.area, value, wellbeingValue: wellbeing };
  });
  if (errors.length) return { errors };

  const avg = items.reduce((s, i) => s + i.wellbeingValue, 0) / items.length;
  const score = Math.round(((avg - 1) / 4) * 100); // 0 … 100
  const level = LEVELS.find((l) => score >= l.min);
  const weakest = [...items].filter((i) => i.wellbeingValue <= 2).sort((a, b) => a.wellbeingValue - b.wellbeingValue).slice(0, 3);
  const recommendations = [level.summary, ...weakest.map((i) => AREA_TIPS[i.area])];
  if (level.result === 'Needs Attention') recommendations.push('If you ever feel unsafe or in crisis, call 112 or Tele-MANAS on 14416.');
  return {
    items,
    score,
    result: level.result,
    recommendations,
    areaScores: Object.fromEntries(items.map((i) => [i.area, i.wellbeingValue])),
    version: VERSION,
  };
}

module.exports = { VERSION, QUESTIONS, scoreAssessment };
