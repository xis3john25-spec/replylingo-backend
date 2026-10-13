import Usage from "../models/Usage.js";
import User from "../models/User.js";
import { touchDeviceUsage } from "../services/deviceUsage.service.js";

const usageLimit = async (req, res, next) => {
  try {
    const uid = req.user.uid;

    // Find user
    const user = await User.findOne({ uid });

    const PREMIUM_DAILY_LIMIT = 100;

    let usage = await Usage.findOne({ uid });
    if (!usage) {
      usage = await Usage.create({ uid, usageCredits: 0, freeLimit: 3 });
    }

    if (user?.premium) {
      // Daily reset applies to the premium abuse-guard counter only. Free
      // credits are a one-time lifetime allowance and never reset.
      const now = new Date();
      const isNewDay = now.toDateString() !== new Date(usage.lastReset).toDateString();
      if (isNewDay) {
        usage.premiumDailyCredits = 0;
        usage.lastReset = now;
        await usage.save();
      }

      // Silent abuse guard — never surfaced to the client as "premiumRequired"
      if ((usage.premiumDailyCredits || 0) >= PREMIUM_DAILY_LIMIT) {
        console.log("Premium daily cap hit (silent) for uid:", uid);
        return res.status(429).json({
          success: false,
          message: "Please try again later.",
          errorCode: "DAILY_LIMIT_REACHED",
        });
      }
      req.usage = usage;
      req.isPremiumUnlimitedUI = true;
      return next();
    }

    console.log("User is not premium, checking usage limit for uid:", uid);

    // Device-level accounting (optional — only when the app sent a device
    // id). Free usage is the larger of this account's and this device's, so
    // a reinstall or an extra account on the same phone can't reset it.
    const deviceUsage = await touchDeviceUsage({
      deviceHash: req.deviceHash,
      platform: req.devicePlatform,
      uid,
    });
    req.deviceUsage = deviceUsage;
    const freeUsed = Math.max(usage.usageCredits, deviceUsage?.usageCredits || 0);

    if (freeUsed >= usage.freeLimit) {
      console.log("Free translation limit reached for uid (backoff):", uid);
      return res.status(403).json({
        success: false,
        premiumRequired: true,
        message: "Free translation limit reached.",
      });
    }

    req.usage = usage;
    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Usage limit check failed.",
    });
  }
};

export default usageLimit;