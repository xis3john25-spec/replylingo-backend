// Canonical funnel event names — must stay in sync with the mobile app's
// src/analytics/events.js. One place both codebases' authors can check the
// exact string a given funnel step uses.
export const EVENTS = {
  APP_OPEN: "app_open",

  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_SLIDE_VIEWED: "onboarding_slide_viewed",
  ONBOARDING_SLIDE_COMPLETED: "onboarding_slide_completed",
  ONBOARDING_COMPLETED: "onboarding_completed",

  AUTH_SCREEN_REACHED: "auth_screen_reached",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN_COMPLETED: "login_completed",
  AUTH_FAILED: "auth_failed",

  PERMISSION_SHOWN: "permission_shown",
  PERMISSION_GRANTED: "permission_granted",
  PERMISSION_DENIED: "permission_denied",

  SCREEN_REACHED: "screen_reached",
  TRANSLATE_SCREEN_OPENED: "translate_screen_opened",
  SAMPLE_VOICE_TAPPED: "sample_voice_tapped",
  WHATSAPP_TUTORIAL_TAPPED: "whatsapp_tutorial_tapped",

  AUDIO_SELECTED: "audio_selected",
  AUDIO_UPLOAD_STARTED: "audio_upload_started",
  AUDIO_UPLOAD_SUCCEEDED: "audio_upload_succeeded",
  AUDIO_UPLOAD_FAILED: "audio_upload_failed",
  TRANSLATION_STARTED: "translation_started",
  TRANSLATION_SUCCEEDED: "translation_succeeded",
  TRANSLATION_FAILED: "translation_failed",

  PAYWALL_VIEWED: "paywall_viewed",
  PLAN_SELECTED: "plan_selected",
  // Mobile paywall: plan tapped (params.plan, params.platform) and whether the
  // selected plan showed a free trial (params.eligible, params.platform).
  PAYWALL_PLAN_SELECTED: "paywall_plan_selected",
  PAYWALL_TRIAL_SHOWN: "paywall_trial_shown",
  PURCHASE_STARTED: "purchase_started",
  PURCHASE_COMPLETED: "purchase_completed",
  PURCHASE_FAILED: "purchase_failed",
  RESTORE_PURCHASE: "restore_purchase",
  // Post-purchase-abandonment survey (shown only after a user cancels checkout).
  // Deliberately separate from the translation/funnel events above; the answers
  // themselves live in the PurchaseSurvey collection, not here.
  PURCHASE_SURVEY_SHOWN: "purchase_survey_shown",
  PURCHASE_SURVEY_SUBMITTED: "purchase_survey_submitted",
  PURCHASE_SURVEY_SKIPPED: "purchase_survey_skipped",
  // Mobile: user started a free trial. Deliberately NOT purchase_completed, so
  // trials never count as paid conversions in the existing funnel.
  TRIAL_STARTED: "trial_started",

  // Server-side subscription lifecycle, written by the RevenueCat webhook
  // (revenuecat.webhook.controller.js) — the authoritative source for trial
  // outcomes and revenue, since the app can't observe them (cancel/expire/
  // convert happen while it's closed). distinctId = Firebase uid.
  // Revenue lives in params.revenue_usd and is ONLY non-zero on
  // SUB_PAID_STARTED / SUB_TRIAL_CONVERTED / SUB_RENEWED.
  SUB_TRIAL_STARTED: "sub_trial_started",
  SUB_TRIAL_CANCELLED: "sub_trial_cancelled",
  SUB_TRIAL_EXPIRED: "sub_trial_expired",
  SUB_TRIAL_CONVERTED: "sub_trial_converted",
  SUB_PAID_STARTED: "sub_paid_started",
  SUB_RENEWED: "sub_renewed",
  SUB_CANCELLED: "sub_cancelled",
  SUB_EXPIRED: "sub_expired",

  // Mobile: the OS-native store review prompt was requested (iOS
  // SKStoreReviewController / Google Play In-App Review). params.platform.
  REVIEW_PROMPT_REQUESTED: "review_prompt_requested",

  // Website (ReplyLingo_website) events — fired by src/lib/webTracking.ts, not
  // the mobile app. distinctId is prefixed "web_" so it can never collide with
  // an app install id. params.channel is the classified traffic source
  // (chatgpt, perplexity, google, direct, ...); see WEB_CHANNELS below.
  WEB_VISIT: "web_visit",
  STORE_CLICK: "store_click",
};

// The stable error_type vocabulary used by audio_upload_failed /
// translation_failed params.errorType — mirrors normalizeTranslateErrorType()
// in the mobile app's events.js.
export const ERROR_TYPES = [
  "invalid_audio",
  "audio_too_long",
  "network_error",
  "authentication_error",
  "server_error",
  "timeout",
  "whisper_error",
  "translation_error",
  "google_tts_error",
  "elevenlabs_error", // still reachable: silent fallback for fa/zu/ga (see tts.service.js)
  "unknown_error",
];

// OnboardingScreen.js currently has 4 slides (SLIDES array). Update this if
// that array's length ever changes.
export const ONBOARDING_SCREEN_COUNT = 4;

export const PRODUCT_SCREENS = ["translate", "record", "history", "settings"];

export const RETENTION_DAYS = [1, 3, 7, 14, 30];
