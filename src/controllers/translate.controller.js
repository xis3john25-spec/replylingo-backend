import { transcribeAudio } from "../services/whisper.service.js";
import {
  detectLanguage,
  translateText,
} from "../services/openai.service.js";
import { generateTranslatedSpeech } from "../services/tts.service.js";
import { getBrandingOutroBuffer } from "../services/brandingOutro.service.js";
import User from "../models/User.js";
import DeviceUsage from "../models/DeviceUsage.js";
import { DEFAULT_VOICE_ID } from "../config/voiceCatalog.js";
import { parseBuffer } from "music-metadata";
import { trimAudioBuffer } from "../services/audioTrim.service.js";

// Was capped at 60s, but "Audio too long" turned out to be the single
// largest translation-failure category in production (38.5% of failures) —
// real WhatsApp voice notes routinely run past a minute. Restored to the
// original 3-minute cap; same limit for free and premium.
const MAX_AUDIO_SECONDS = 180;

// Directional per-call AI cost estimate (Whisper transcription + GPT
// translation + Google Cloud TTS combined), from the earlier business
// audit's ~$0.04/call figure. This is NOT wired up to real OpenAI/
// Google Cloud billing — it's a rough constant for relative free-vs-premium
// cost comparison until real per-provider usage-based pricing is plugged
// in here (e.g. actual token counts * model price, actual audio characters *
// Google Cloud TTS per-character rate).
const ESTIMATED_COST_PER_CALL_USD = 0.04;

export const translateMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Audio file is required.",
      });
    }

    // Reject oversized audio BEFORE calling Whisper/ElevenLabs (cost control)
    let durationSeconds = 0;
    let audioBuffer = req.file.buffer;
    let trimmedToSeconds = null;
    try {
      const metadata = await parseBuffer(
        req.file.buffer,
        req.file.mimetype,
        { duration: true }
      );
      durationSeconds = metadata?.format?.duration ?? 0;

      console.log("Audio duration (s):", durationSeconds);

      if (durationSeconds > MAX_AUDIO_SECONDS) {
        // Translate the first MAX_AUDIO_SECONDS instead of failing. Only
        // formats that can be cut without re-encoding are supported (see
        // audioTrim.service.js); anything else keeps the old rejection.
        const trim = trimAudioBuffer(req.file.buffer, {
          maxSeconds: MAX_AUDIO_SECONDS,
          durationSeconds,
        });
        if (!trim) {
          return res.status(413).json({
            success: false,
            message: "Audio is too long. Please keep messages under 3 minutes.",
            errorCode: "AUDIO_TOO_LONG",
          });
        }
        console.log(`Trimmed ${trim.format} audio ${durationSeconds}s -> ${trim.seconds}s`);
        audioBuffer = trim.buffer;
        trimmedToSeconds = Math.floor(trim.seconds);
        durationSeconds = trim.seconds;
      }
    } catch (durationError) {
      // If we genuinely can't read duration, log it but don't hard-fail the
      // request — fall back to a file-size sanity check instead.
      console.error("Could not read audio duration:", durationError.message);

      const MAX_BYTES = 8 * 1024 * 1024; // ~8MB safety net
      if (req.file.buffer.length > MAX_BYTES) {
        return res.status(413).json({
          success: false,
          message: "Audio file is too large.",
        });
      }
    }

    // 1. Speech -> Text
    let transcript;
    try {
      transcript = await transcribeAudio(audioBuffer);
    } catch (err) {
      err.errorCode = err.errorCode || "WHISPER_ERROR";
      throw err;
    }

    const targetLanguage = req.body.targetLanguage || "English";
    const targetLanguageCode = req.body.targetLanguageCode || null;

    // 2. Detect Language, 3. Translate — tagged together since both are the
    // same logical "translation" stage for analytics purposes.
    let detectedLanguage, translatedText;
    try {
      detectedLanguage = await detectLanguage(transcript);
      translatedText = await translateText(
        transcript,
        detectedLanguage,
        targetLanguage,
        { concise: durationSeconds > 60 }
      );
    } catch (err) {
      err.errorCode = err.errorCode || "TRANSLATION_ERROR";
      throw err;
    }

    // 4. Look up the user's saved voice preference (falls back to default
    // if they haven't picked one, or if the doc lookup fails for any reason)
    let voiceId = DEFAULT_VOICE_ID;
    let isPremium = false;
    try {
      const user = await User.findOne({ uid: req.user.uid }).select("voiceId premium");
      if (user?.voiceId) voiceId = user.voiceId;
      isPremium = user?.premium ?? false;
    } catch (voiceLookupError) {
      console.error("Voice preference lookup failed, using default:", voiceLookupError);
    }

    console.log("VOICE USED:", voiceId);
    // generateTranslatedSpeech returns null (never throws for a provider
    // failure) when voice can't be produced: the transcript + translation are
    // still returned below as a text-only result. The try/catch only guards
    // against unexpected bugs, which degrade the same way.
    let speechBuffer = null;
    try {
      speechBuffer = await generateTranslatedSpeech(
        translatedText,
        targetLanguageCode,
        targetLanguage,
        voiceId
      );
    } catch (err) {
      console.error("Unexpected TTS error, degrading to text-only:", err.message);
      speechBuffer = null;
    }

    // Spoken branding tag: appended only to the audio that's actually
    // destined to be shared back out (the reply leg — the client marks
    // this with `isReply`), and only for free-tier users. The inbound,
    // listen-only translation is never shared, so it's never branded —
    // and Pro users' audio is never touched. The original `speechBuffer`
    // is left untouched either way; a *new* buffer is built when branding
    // applies, matching the "never modify in place" requirement.
    const isReply = req.body.isReply === "true" || req.body.isReply === true;
    let finalAudioBuffer = speechBuffer;
    let branded = false;

    // speechBuffer is null only for the rare fa/zu/ga text-only degrade path —
    // nothing to brand in that case.
    if (isReply && !isPremium && speechBuffer) {
      try {
        const outroBuffer = await getBrandingOutroBuffer(targetLanguage, targetLanguageCode, voiceId);
        finalAudioBuffer = outroBuffer ? Buffer.concat([speechBuffer, outroBuffer]) : speechBuffer;
        branded = Boolean(outroBuffer);
      } catch (brandingError) {
        // Branding is a nice-to-have on top of the core translation —
        // never let it block the user from getting their translated reply.
        console.error("Failed to append branding outro, sharing unbranded audio:", brandingError);
        finalAudioBuffer = speechBuffer;
      }
    }

    let remainingFreeTranslations = null;

    if (req.usage) {
      // A reply with no voice has nothing the user can send, so it doesn't
      // use up a credit. (An inbound translation still does — the translated
      // text is its main value.)
      const skipCharge = isReply && !finalAudioBuffer;

      if (!skipCharge) {
        // Free tier = 3 credits: an uploaded/shared voice note costs 0.5, the
        // reply the user records costs 1 (on either screen). The in-app
        // sample never reaches the server, so it costs nothing.
        const usageCost = isReply ? 1 : 0.5;
        // Premium usage feeds only the daily abuse cap; free usage is the
        // lifetime allowance (see models/Usage.js).
        if (isPremium) {
          req.usage.premiumDailyCredits = (req.usage.premiumDailyCredits || 0) + usageCost;
        } else {
          req.usage.usageCredits += usageCost;
          // Same charge on the device record (when the app sent a device
          // id) — see middleware/usageLimit.js.
          if (req.deviceHash) {
            try {
              const updated = await DeviceUsage.findOneAndUpdate(
                { deviceHash: req.deviceHash },
                { $inc: { usageCredits: usageCost } },
                { returnDocument: "after" }
              );
              if (updated) req.deviceUsage = updated;
            } catch (deviceError) {
              console.error("[deviceUsage] charge failed (non-fatal):", deviceError.message);
            }
          }
        }
        req.usage.estimatedCostUsd = (req.usage.estimatedCostUsd || 0) + ESTIMATED_COST_PER_CALL_USD;
        await req.usage.save();
      }

      if (!isPremium) {
        remainingFreeTranslations = Math.max(
          0,
          req.usage.freeLimit -
            Math.max(req.usage.usageCredits, req.deviceUsage?.usageCredits || 0)
        );
      }
    }

    return res.json({
      success: true,
      transcript,
      detectedLanguage,
      translatedText,
      audio: finalAudioBuffer ? finalAudioBuffer.toString("base64") : null,
      audioAvailable: Boolean(finalAudioBuffer),
      branded,
      remainingFreeTranslations,
      // Set only when a too-long note was cut: seconds that were translated.
      trimmed: trimmedToSeconds !== null,
      trimmedSeconds: trimmedToSeconds,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Translation failed.",
      errorCode: error.errorCode || "SERVER_ERROR",
    });
  }
};