import crypto from "crypto";

// Device ids are optional on every request (old app versions don't send
// them), so everything here returns null instead of throwing.
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

// Set DEVICE_ID_PEPPER in the environment BEFORE the first release that
// sends device ids, and never change it afterwards — changing it re-hashes
// every device and resets all device-level free counters.
const PEPPER = process.env.DEVICE_ID_PEPPER || "replylingo-device-id-v1";

export function hashDeviceId(rawDeviceId) {
  if (typeof rawDeviceId !== "string") return null;
  const trimmed = rawDeviceId.trim();
  if (!DEVICE_ID_PATTERN.test(trimmed)) return null;
  return crypto.createHmac("sha256", PEPPER).update(trimmed).digest("hex");
}
