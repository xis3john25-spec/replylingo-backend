// Optional "no guests" switch. Must run AFTER auth.js.
//
// Firebase anonymous users get a perfectly valid ID token, so auth.js alone
// can't tell a guest from a signed-in user. Guests are ALLOWED on every
// platform by default (they are limited by the free-credit + device limit,
// see usageLimit.js). Android guests were briefly blocked in 1.7.0; that rule
// is now opt-in via BLOCK_ANDROID_ANONYMOUS=true so it can be re-enabled
// without a deploy of new code.
//
// Platform detection: X-Platform header (sent by app 1.7.0+). Older Android
// builds don't send it, but React Native's Android HTTP stack identifies as
// okhttp, so that is used as a fallback.
//
// Set BLOCK_ANONYMOUS_ALL=true to reject guests everywhere.

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
  const blockAndroid =
    process.env.BLOCK_ANDROID_ANONYMOUS === "true" && detectPlatform(req) === "android";
  if (blockAll || blockAndroid) {
    return res.status(401).json({
      success: false,
      message: "Please sign in to continue.",
      errorCode: "SIGN_IN_REQUIRED",
    });
  }
  next();
};

export default requireSignedIn;
