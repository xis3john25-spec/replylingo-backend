import { hashDeviceId } from "../utils/deviceHash.js";

// Optional device identification. Reads X-Device-Id / X-Platform and exposes
// ONLY the hash as req.deviceHash. Never rejects: requests from older app
// versions (no header) or with a malformed value simply proceed without
// device-level accounting, exactly as before.
const deviceId = (req, res, next) => {
  req.deviceHash = null;
  req.devicePlatform = null;

  try {
    const hash = hashDeviceId(req.get("x-device-id"));
    if (hash) {
      req.deviceHash = hash;
      const platform = String(req.get("x-platform") || "").toLowerCase();
      req.devicePlatform = platform === "ios" || platform === "android" ? platform : null;
    }
  } catch (error) {
    console.error("[deviceId] Failed to read device header:", error.message);
  }

  next();
};

export default deviceId;
