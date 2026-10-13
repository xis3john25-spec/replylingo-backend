import DeviceUsage from "../models/DeviceUsage.js";

// Finds (or creates) the device record and links this uid to it. Fails open:
// a database hiccup must never block a legitimate translation, it only means
// device-level counting is skipped for this request.
export async function touchDeviceUsage({ deviceHash, platform, uid }) {
  if (!deviceHash) return null;

  const run = () =>
    DeviceUsage.findOneAndUpdate(
      { deviceHash },
      {
        $setOnInsert: { deviceHash },
        $set: { lastSeenAt: new Date(), ...(platform ? { platform } : {}) },
        $addToSet: { uids: uid },
      },
      { upsert: true, returnDocument: "after" }
    );

  try {
    try {
      return await run();
    } catch (error) {
      // Two first requests racing to create the same device record.
      if (error?.code === 11000) return await run();
      throw error;
    }
  } catch (error) {
    console.error("[deviceUsage] touch failed (non-fatal):", error.message);
    return null;
  }
}

// Called on account deletion: unlink this uid from every device record and
// drop records that no longer belong to any account.
export async function removeUidFromDeviceUsage(uid) {
  await DeviceUsage.updateMany({ uids: uid }, { $pull: { uids: uid } });
  const result = await DeviceUsage.deleteMany({ uids: { $size: 0 } });
  return result.deletedCount || 0;
}
