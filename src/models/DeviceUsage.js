import mongoose from "mongoose";

// Free-tier usage per DEVICE, so deleting/reinstalling the app or creating
// extra accounts on one phone can't mint more free translations. The raw
// device id (iOS Keychain install id / Android ID) is never stored — only an
// HMAC of it (see utils/deviceHash.js).
const deviceUsageSchema = new mongoose.Schema(
  {
    deviceHash: {
      type: String,
      required: true,
      unique: true,
    },

    // "ios" | "android" — informational.
    platform: {
      type: String,
      default: null,
    },

    // Free credits used on this device across ALL accounts. Never reset.
    usageCredits: {
      type: Number,
      default: 0,
    },

    // Accounts seen on this device. Lets account deletion remove its link
    // (and the whole record once no account is left).
    uids: {
      type: [String],
      default: [],
      index: true,
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("DeviceUsage", deviceUsageSchema);
