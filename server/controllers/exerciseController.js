const Exercise = require('../models/Exercise');

// @desc    Get all exercise routines (public)
// @route   GET /api/exercises
// @access  Public
const getExercises = async (req, res) => {
  try {
    const exercises = await Exercise.find();
    res.status(200).json({ success: true, count: exercises.length, data: exercises });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = { getExercises };
