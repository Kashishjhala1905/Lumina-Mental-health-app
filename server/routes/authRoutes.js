const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    logoutUser,
    getCounselors,
    getMe,
    updateProfile,
    changePassword,
} = require('../controllers/authController');
const { forgotPassword, verifyResetToken, resetPassword } = require('../controllers/passwordResetController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/security');

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/logout', optionalAuth, logoutUser);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password/verify', resetPasswordLimiter, verifyResetToken);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.get('/counselors', getCounselors);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.patch('/password', protect, changePassword);

module.exports = router;
