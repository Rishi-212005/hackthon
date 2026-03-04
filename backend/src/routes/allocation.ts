import { Router } from "express";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth";
import { runAllocationEngine } from "../services/allocationService";
import { Allocation } from "../models/Allocation";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// POST /allocation/run-allocation
router.post("/run-allocation", async (_req: AuthedRequest, res) => {
  try {
    const alreadyAnnounced = await Allocation.exists({ announced: true });
    if (alreadyAnnounced) {
      return res.status(400).json({ message: "Results have already been announced. Allocation cannot be re-run." });
    }

    const result = await runAllocationEngine();
    return res.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error running allocation engine:", err);
    return res.status(500).json({ message: "Failed to run allocation" });
  }
});

// POST /allocation/announce - mark all allocations as announced
router.post("/announce", async (_req: AuthedRequest, res) => {
  try {
    const now = new Date();
    const { modifiedCount } = await (await import("../models/Allocation")).Allocation.updateMany(
      { announced: false },
      { $set: { announced: true, announcedAt: now } }
    );
    return res.json({ updated: modifiedCount });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error announcing allocations:", err);
    return res.status(500).json({ message: "Failed to announce allocations" });
  }
});

// POST /allocation/reset - remove all unannounced allocations (revert to pending state)
router.post("/reset", async (_req: AuthedRequest, res) => {
  try {
    const result = await Allocation.deleteMany({ announced: false });
    return res.json({ deleted: result.deletedCount ?? 0 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error resetting allocations:", err);
    return res.status(500).json({ message: "Failed to reset allocations" });
  }
});

export default router;

