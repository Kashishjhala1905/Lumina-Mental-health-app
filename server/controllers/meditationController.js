const Meditation = require('../models/Meditation');

// @desc    Get all meditation tracks (optional category filter)
// @route   GET /api/meditations
// @access  Public
const getMeditations = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category;
    }
    const meditations = await Meditation.find(filter);
    res.status(200).json({ success: true, count: meditations.length, data: meditations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = { getMeditations };
