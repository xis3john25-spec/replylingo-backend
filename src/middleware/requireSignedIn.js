// Server-side half of "Android has no guest mode". Must run AFTER auth.js.
//
// Firebase anonymous users get a perfectly valid ID token, so auth.js alone
// can't tell a guest from a signed-in user. This rejects anonymous tokens on
// the paid-AI endpoints for Android clients, so the rule can't be bypassed by
// an old build or a modified client.
//
// Platform detection: X-Platform header (sent by app 1.7.0+). Older Android
// builds don't send it, but React Native's Android HTTP stack identifies as
// okhttp, so that is used as a fallback.
//
// iOS guests are intentionally still allowed (free-tier + device limit,
// guideline 5.1.1). Set BLOCK_ANONYMOUS_ALL=true to reject guests everywhere.

const isAnonymousToken = (decoded) => decoded?.firebase?.sign_in_provider === "anonymous";

const detectPlatform = (req) => {
  const header = String(req.get("x-platform") || "").toLowerCase();
  if (header === "android" || header === "ios") return header;
  if (/okhttp/i.test(req.get("user-agent") || "")) return "android";
  return null;
};

const requireSignedIn = (req, res, next) => {
  if (!isAnonymousToken(req.user)) return next();

  const blockAll = process.env.BLOCK_ANONYMOUS_ALL === "true";
  if (blockAll || detectPlatform(req) === "android") {
    return res.status(401).json({
      success: false,
      message: "Please sign in to continue.",
      errorCode: "SIGN_IN_REQUIRED",
    });
  }
  next();
};

export default requireSignedIn;
