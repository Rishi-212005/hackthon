import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth";
import { Elective } from "../models/Elective";
import { Preference } from "../models/Preference";
import { Allocation } from "../models/Allocation";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// --- Dashboard stats ---
router.get("/stats", async (_req, res) => {
  const [totalElectives, totalPrefs, totalAllocations] = await Promise.all([
    Elective.countDocuments({ isActive: true }),
    Preference.countDocuments({ status: "submitted" }),
    Allocation.countDocuments({ status: "allocated" }),
  ]);

  const allocated = totalAllocations;
  const unallocated = Math.max(totalPrefs - allocated, 0);

  return res.json({
    totalStudents: totalPrefs,
    totalElectives,
    allocated,
    unallocated,
  });
});

// --- Electives CRUD + metrics for dashboard ---
router.get("/electives", async (_req, res) => {
  const [electives, prefs, allocations] = await Promise.all([
    Elective.find({}).sort({ code: 1 }).lean(),
    Preference.find({ status: "submitted" }).select("preferences").lean(),
    Allocation.find({ status: "allocated" }).select("electiveLegacyId").lean(),
  ]);

  const requestCounts = new Map<string, number>();
  for (const p of prefs) {
    for (const pr of p.preferences) {
      const key = pr.electiveLegacyId as string;
      requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    }
  }

  const allocatedCounts = new Map<string, number>();
  for (const a of allocations) {
    if (!a.electiveLegacyId) continue;
    const key = a.electiveLegacyId as string;
    allocatedCounts.set(key, (allocatedCounts.get(key) ?? 0) + 1);
  }

  const list = electives.map((e) => ({
    ...e,
    requestedCount: requestCounts.get(e.legacyId) ?? 0,
    allocatedCount: allocatedCounts.get(e.legacyId) ?? 0,
  }));

  return res.json(list);
});

const electiveSchema = z.object({
  legacyId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  facultyName: z.string().optional(),
  department: z.string().optional(),
  seatLimit: z.number().int().min(1),
  semester: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

router.post("/electives", async (req: AuthedRequest, res) => {
  const data = electiveSchema.parse(req.body);
  const created = await Elective.create(data);
  return res.status(201).json(created);
});

router.put("/electives/:id", async (req: AuthedRequest, res) => {
  const data = electiveSchema.partial().parse(req.body);
  const updated = await Elective.findOneAndUpdate({ legacyId: req.params.id }, data, { new: true });
  if (!updated) return res.status(404).json({ message: "Elective not found" });
  return res.json(updated);
});

router.delete("/electives/:id", async (req: AuthedRequest, res) => {
  const deleted = await Elective.findOneAndDelete({ legacyId: req.params.id });
  if (!deleted) return res.status(404).json({ message: "Elective not found" });
  return res.status(204).send();
});

// --- Students table (submitted only) ---
router.get("/students", async (_req, res) => {
  const prefs = await Preference.find({ status: "submitted" }).lean();

  const allocations = await Allocation.find({
    studentUserId: { $in: prefs.map((p) => p.studentUserId) },
  })
    .select("studentUserId electiveLegacyId status roundAllocated")
    .lean();

  const allocByStudent = new Map(
    allocations.map((a) => [a.studentUserId.toString(), a])
  );

  const electives = await Elective.find({}).select("legacyId name code").lean();
  const electiveByLegacy = new Map(electives.map((e) => [e.legacyId, e]));

  const rows = prefs.map((p) => {
    const alloc = allocByStudent.get(p.studentUserId.toString());
    const allocatedElective =
      alloc && alloc.electiveLegacyId
        ? electiveByLegacy.get(alloc.electiveLegacyId as string)
        : null;

    return {
      id: p._id,
      rollNumber: p.studentUsername,
      name: p.studentName,
      department: p.department,
      semester: p.semester,
      cgpa: p.cgpa,
      backlogs: p.backlogs ?? 0,
      preferences: p.preferences
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((pr) => electiveByLegacy.get(pr.electiveLegacyId)?.code || pr.electiveLegacyId),
      allocatedElective: allocatedElective?.name || null,
      allocatedElectiveCode: allocatedElective?.code || null,
      roundAllocated: alloc?.roundAllocated ?? null,
      allocationStatus: alloc?.status ?? "pending",
    };
  });

  return res.json(rows);
});

export default router;

