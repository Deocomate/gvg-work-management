import { Router } from 'express';
import { config } from '#config';
import * as controller from './auth.controller.js';

const router = Router();

router.get('/login', controller.loginForm);
router.post('/login', controller.login);
router.post('/logout', controller.logout);

if (config.auth.allowSignup) {
  router.get('/signup', controller.signupForm);
  router.post('/signup', controller.signup);
}

export default router;
