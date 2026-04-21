// ── AUTH ROUTES ───────────────────────────────────────────────
const router = require('express').Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Onboarding / registro de nova clínica
router.post('/register',        authController.register);

// Login
router.post('/login',           loginLimiter, authController.login);
router.post('/login/2fa',       loginLimiter, authController.login2FA);

// 2FA setup
router.post('/2fa/setup',       authenticate, authController.setup2FA);
router.post('/2fa/verify',      authenticate, authController.verify2FA);
router.delete('/2fa/disable',   authenticate, authController.disable2FA);

// Token
router.post('/refresh',         authController.refreshToken);
router.post('/logout',          authenticate, authController.logout);

// Senha
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

// Convites
router.post('/invite',          authenticate, authController.sendInvite);
router.get('/invite/:token',    authController.getInviteInfo);
router.post('/invite/accept',   authController.acceptInvite);

// Perfil
router.get('/me',               authenticate, authController.me);
router.put('/me',               authenticate, authController.updateMe);

module.exports = router;
