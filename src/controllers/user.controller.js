import User from "../models/User.js";
import Usage from "../models/Usage.js";
import { touchDeviceUsage, removeUidFromDeviceUsage } from "../services/deviceUsage.service.js";
import PurchaseSurvey from "../models/PurchaseSurvey.js";
import { isValidVoiceId, normalizeVoiceId, DEFAULT_VOICE_ID, VOICE_PERSONAS } from "../config/voiceCatalog.js";
import { getSubscriberPremiumStatus } from "../services/revenuecat.service.js";
import { getVoicePreviewBuffer } from "../services/voicePreview.service.js";

const getMe = async (req, res) => {
  try {
    // req.isNewUser is set by the auth middleware — it runs first on every
    // authenticated request, so it's the only place that reliably sees "no
    // doc yet" on a user's actual first request. Used for analytics only
    // (signup_completed vs login_completed), no behavior here depends on it.
    const user = await User.findOneAndUpdate(
  { uid: req.user.uid },
  {
    $setOnInsert: {
      uid: req.user.uid,
      email: req.user.email ?? null,
    },
    // getMe is called on every app open, so this is the cheapest possible
    // place to track activity for re-engagement notifications — no extra
    // request needed from the client.
    // `guest` is refreshed here (not only on insert) because an anonymous
    // account can be upgraded in place to Google/Apple (same uid).
    $set: {
      lastActiveAt: new Date(),
      guest:
        req.user.firebase?.sign_in_provider === "anonymous" ||
        req.user.provider_id === "anonymous",
    },
  },
  {
  upsert: true,
  returnDocument: "after",
}
);

const usage = await Usage.findOne({ uid: req.user.uid });

// Optional device-level free usage (only when the app sent a device id).
const deviceUsage = user?.premium
  ? null
  : await touchDeviceUsage({
      deviceHash: req.deviceHash,
      platform: req.devicePlatform,
      uid: req.user.uid,
    });
const freeUsed = Math.max(usage?.usageCredits || 0, deviceUsage?.usageCredits || 0);

console.log(user);


    res.status(200).json({
      success: true,
      isNewUser: req.isNewUser === true,
      user: {
        uid: req.user.uid,
        email: user?.email ?? req.user.email ?? null,
        provider: req.user.firebase?.sign_in_provider,
        guest: user?.guest ?? false,
        premium: user?.premium ?? false,
        voiceId: user?.voiceId ?? DEFAULT_VOICE_ID,

remainingFreeTranslations: user?.premium
  ? null
  : usage
    ? Math.max(0, usage.freeLimit - freeUsed)
    : 3,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/user/voice — body: { voiceId: "female" | "male" }
const updateVoice = async (req, res) => {
  try {
    const { voiceId } = req.body;
    console.log("VOICE ID RECEIVED:", voiceId);

    if (!isValidVoiceId(voiceId)) {
      return res.status(400).json({
        success: false,
        message: `voiceId must be one of: ${Object.keys(VOICE_PERSONAS).join(", ")}`,
      });
    }

    // Normalizes legacy "male"/"female" values (still valid) to the new ids.
    const normalizedVoiceId = normalizeVoiceId(voiceId);

const user = await User.findOneAndUpdate(
  { uid: req.user.uid },
  { $set: { voiceId: normalizedVoiceId } },
  {
    upsert: true,
    returnDocument: "after",
  }
);

console.log("FULL USER:", user);
console.log("VOICE FIELD:", user?.voiceId);

    console.log("SAVED TO DB:", user.voiceId);
    res.status(200).json({
      success: true,
      voiceId: user.voiceId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/user/voice-preview — body: { voiceId, languageCode? }
// Lightweight: no usage credit, no DB write, no Whisper/branding. Used by the
// Settings screen's per-voice "Preview" button.
const previewVoice = async (req, res) => {
  try {
    const { voiceId, languageCode } = req.body;

    if (!isValidVoiceId(voiceId)) {
      return res.status(400).json({
        success: false,
        message: `voiceId must be one of: ${Object.keys(VOICE_PERSONAS).join(", ")}`,
      });
    }

    const normalizedVoiceId = normalizeVoiceId(voiceId);
    const audioBuffer = await getVoicePreviewBuffer(languageCode, normalizedVoiceId);

    if (!audioBuffer) {
      return res.status(422).json({
        success: false,
        message: "Voice preview unavailable for this language.",
        errorCode: "PREVIEW_UNAVAILABLE",
      });
    }

    res.status(200).json({
      success: true,
      audio: audioBuffer.toString("base64"),
    });
  } catch (error) {
    console.error("[previewVoice] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate voice preview.",
      errorCode: "GOOGLE_TTS_ERROR",
    });
  }
};

// const syncPremium = async (req, res) => {
//   try {
//     const uid = req.user.uid;
//     const premium = await getSubscriberPremiumStatus(uid);

//     const user = await User.findOneAndUpdate(
//       { uid },
//       { $set: { premium } },
//       { upsert: true, returnDocument: "after" }
//     );

//     res.status(200).json({
//       success: true,
//       premium: user.premium,
//     });
//   } catch (error) {
//     console.error("[syncPremium] Error:", error);

//     if (error.code === "REVENUECAT_NOT_CONFIGURED") {
//       return res.status(503).json({
//         success: false,
//         message: "Premium sync is temporarily unavailable.",
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: error.message || "Failed to sync premium status.",
//     });
//   }
// };

const syncPremium = async (req, res) => {
  try {
    console.log("🔥🔥🔥 SYNC PREMIUM ENDPOINT HIT 🔥🔥🔥");
    console.log("UID:", req.user.uid);

    const uid = req.user.uid;
    const premium = await getSubscriberPremiumStatus(uid);

    const user = await User.findOneAndUpdate(
      { uid },
      { $set: { premium } },
      { upsert: true, returnDocument: "after" }
    );

    console.log("🔥 PREMIUM SAVED TO DB:", user.premium);

    res.status(200).json({
      success: true,
      premium: user.premium,
    });
  } catch (error) {
    console.error("[syncPremium] Error:", error);

    if (error.code === "REVENUECAT_NOT_CONFIGURED") {
      return res.status(503).json({
        success: false,
        message: "Premium sync is temporarily unavailable.",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to sync premium status.",
    });
  }
};

// POST /api/user/push-token
// body: { pushToken: string | null, platform?: "ios" | "android" }
// Pass pushToken: null to clear (e.g. user turned notifications off) — platform is cleared with it.
// pushToken is an Expo push token; platform is stored for informational/debugging purposes
// only — Expo's push service resolves iOS/Android delivery itself (see pushNotification.service.js).
const savePushToken = async (req, res) => {
  try {
    const { pushToken, platform } = req.body;

    if (pushToken !== null && typeof pushToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "pushToken must be a string or null.",
      });
    }

    if (pushToken && platform && !["ios", "android"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'platform must be "ios" or "android" when provided.',
      });
    }

    const update = pushToken
      ? { pushToken, pushPlatform: platform || null }
      : { pushToken: null, pushPlatform: null };

    await User.findOneAndUpdate({ uid: req.user.uid }, { $set: update }, { upsert: true, new: true });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const uid = req.user.uid;

    console.log(`[deleteAccount] Starting deletion for user: ${uid}`);

    // Delete User document
    const userDeleteResult = await User.deleteOne({ uid });
    console.log(`[deleteAccount] User deletion result:`, userDeleteResult);

    // Delete Usage document
    const usageDeleteResult = await Usage.deleteOne({ uid });
    console.log(`[deleteAccount] Usage deletion result:`, usageDeleteResult);

    // Delete any checkout-abandonment survey answers (they're tied to the uid).
    const surveyDeleteResult = await PurchaseSurvey.deleteMany({ uid });
    console.log(`[deleteAccount] Survey deletion result:`, surveyDeleteResult);

    // Device-level usage records: unlink this account and drop records no
    // account belongs to any more (only a hash was ever stored).
    const deviceRecordsDeleted = await removeUidFromDeviceUsage(uid);
    console.log(`[deleteAccount] Device usage records deleted:`, deviceRecordsDeleted);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("[deleteAccount] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete account",
    });
  }
};

export { getMe, updateVoice, previewVoice, syncPremium, deleteAccount, savePushToken };