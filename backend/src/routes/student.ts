import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth";
import { User } from "../models/User";
import { StudentProfile } from "../models/StudentProfile";
import { Preference } from "../models/Preference";
import { Allocation } from "../models/Allocation";
import { Elective } from "../models/Elective";

const router = Router();

router.use(requireAuth, requireRole("student"));

router.get("/me/profile", async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id name username role");
  if (!user) return res.status(404).json({ message: "User not found" });

  const profile = await StudentProfile.findOne({ userId: user._id }).select(
    "studentId profileCompleted department semester cgpa backlogs degree year cgpaVerified cgpaVerifiedAt"
  );
  if (!profile) return res.status(404).json({ message: "Student profile not found" });

  return res.json({
    id: user._id,
    name: user.name,
    username: user.username,
    role: user.role,
    profile,
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1),
  semester: z.number().int().min(1).max(8),
  cgpa: z.number().min(0).max(10),
  backlogs: z.number().int().min(0).max(50).optional().default(0),
  degree: z.string().optional(),
  year: z.string().optional(),
});

router.put("/me/profile", async (req: AuthedRequest, res) => {
  try {
    const user = await User.findById(req.auth!.userId).select("_id name username email");
    if (!user) return res.status(404).json({ message: "User not found" });

    const data = updateProfileSchema.parse(req.body);

    if (data.name) user.name = data.name;
    if (data.email) user.email = data.email;
    await user.save();

    let profile = await StudentProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          department: data.department,
          semester: data.semester,
          cgpa: data.cgpa,
          backlogs: data.backlogs ?? 0,
          degree: data.degree,
          year: data.year,
          profileCompleted: true,
        },
      },
      { new: true }
    ).select("studentId profileCompleted department semester cgpa degree year cgpaVerified cgpaVerifiedAt");

    if (!profile) {
      profile = await StudentProfile.create({
        userId: user._id,
        studentId: user.username,
        department: data.department,
        semester: data.semester,
        cgpa: data.cgpa,
        backlogs: data.backlogs ?? 0,
        degree: data.degree,
        year: data.year,
        profileCompleted: true,
        cgpaVerified: false,
      });
    }

    return res.json({
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email ?? null,
      profile,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("PUT /student/me/profile error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors?.[0]?.message || "Invalid profile data" });
    }
    return res.status(500).json({ message: "Failed to save profile" });
  }
});

router.get("/me/preferences", async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id username");
  if (!user) return res.status(404).json({ message: "User not found" });

  const pref = await Preference.findOne({ studentUserId: user._id }).lean();
  if (!pref) {
    return res.json({ status: "none", preferences: [] });
  }

  return res.json({
    status: pref.status,
    submittedAt: pref.submittedAt ?? null,
    preferences: pref.preferences,
    updatedAt: pref.updatedAt ?? null,
  });
});

const preferenceItemSchema = z.object({
  electiveId: z.string().min(1),
  rank: z.number().int().min(1).max(10),
});

const upsertPreferencesSchema = z.object({
  preferences: z.array(preferenceItemSchema).min(3).max(10),
});

function hasDuplicates<T>(arr: T[]) {
  return new Set(arr as any).size !== arr.length;
}

router.put("/me/preferences", async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id username name");
  if (!user) return res.status(404).json({ message: "User not found" });

  const profile = await StudentProfile.findOne({ userId: user._id }).select("profileCompleted department semester cgpa backlogs");
  if (!profile) return res.status(404).json({ message: "Student profile not found" });
  if (!profile.profileCompleted) return res.status(400).json({ message: "Complete your profile before saving preferences" });

  const data = upsertPreferencesSchema.parse(req.body);

  const electiveLegacyIds = data.preferences.map((p) => p.electiveId);
  if (hasDuplicates(electiveLegacyIds)) return res.status(400).json({ message: "Duplicate preferences are not allowed" });

  const ranks = data.preferences.map((p) => p.rank);
  if (hasDuplicates(ranks)) return res.status(400).json({ message: "Duplicate ranks are not allowed" });

  // Validate electives exist and are active
  const electives = await Elective.find({ legacyId: { $in: electiveLegacyIds }, isActive: true }).select("legacyId");
  if (electives.length !== electiveLegacyIds.length) {
    return res.status(400).json({ message: "One or more electives are invalid/inactive" });
  }

  const next = data.preferences
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ electiveLegacyId: p.electiveId, rank: p.rank }));

  const updated = await Preference.findOneAndUpdate(
    { studentUserId: user._id },
    {
      $set: {
        studentUsername: user.username,
        studentName: user.name,
        department: profile.department,
        semester: profile.semester,
        cgpa: profile.cgpa,
        backlogs: profile.backlogs ?? 0,
        status: "draft",
        preferences: next,
      },
      $unset: { submittedAt: "" },
    },
    { upsert: true, new: true }
  );

  return res.json({
    status: updated.status,
    submittedAt: updated.submittedAt ?? null,
    preferences: updated.preferences,
  });
});

router.post("/me/preferences/submit", async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id username name");
  if (!user) return res.status(404).json({ message: "User not found" });

  const profile = await StudentProfile.findOne({ userId: user._id }).select("profileCompleted department semester cgpa backlogs");
  if (!profile) return res.status(404).json({ message: "Student profile not found" });
  if (!profile.profileCompleted) return res.status(400).json({ message: "Complete your profile before submitting preferences" });

  const pref = await Preference.findOne({ studentUserId: user._id });
  if (!pref) return res.status(400).json({ message: "No preferences saved" });

  if (!pref.preferences || pref.preferences.length < 3) {
    return res.status(400).json({ message: "Minimum 3 preferences required" });
  }

  // allow editing before deadline; for now keep it always submit-able, but one record per student
  pref.status = "submitted";
  pref.submittedAt = pref.submittedAt ?? new Date();
  pref.studentUsername = user.username;
  pref.studentName = user.name;
  pref.department = profile.department;
  pref.semester = profile.semester;
  pref.cgpa = profile.cgpa;
  pref.backlogs = profile.backlogs ?? 0;
  await pref.save();

  return res.json({ status: pref.status, submittedAt: pref.submittedAt });
});

router.get("/me/allocation", async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id username");
  if (!user) return res.status(404).json({ message: "User not found" });

  const allocation = await Allocation.findOne({ studentUserId: user._id }).lean();
  if (!allocation || !allocation.announced) {
    return res.json({ announced: false });
  }

  const elective = allocation.electiveLegacyId
    ? await Elective.findOne({ legacyId: allocation.electiveLegacyId }).select("legacyId code name facultyName department").lean()
    : null;

  return res.json({
    announced: true,
    announcedAt: allocation.announcedAt ?? null,
    status: allocation.status,
    elective,
    roundAllocated: allocation.roundAllocated ?? null,
    runId: allocation.runId ?? null,
  });
});

export default router;

