// Kept for backward compatibility; token logic lives in ./authTokens.js
const { signToken } = require('./authTokens');

const generateToken = (id, role, rememberMe = false) => signToken({ _id: id, role }, rememberMe);

module.exports = generateToken;
