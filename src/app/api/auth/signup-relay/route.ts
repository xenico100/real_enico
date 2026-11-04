import { createSignupRelayHandler, getSignupRelayConfig } from '@/lib/auth/signupRelay';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const POST = createSignupRelayHandler({
  secret: () => process.env.SIGNUP_NOTIFICATION_RELAY_SECRET,
  enabledAt: () => process.env.SIGNUP_NOTIFICATION_ENABLED_AT,
  config: getSignupRelayConfig,
});
