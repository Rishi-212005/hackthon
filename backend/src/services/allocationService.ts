import { Types } from "mongoose";
import { Preference } from "../models/Preference";
import { Elective } from "../models/Elective";
import { Allocation } from "../models/Allocation";

type AllocationResult = {
  allocatedStudents: { studentId: string; electiveId: string }[];
  unallocatedStudents: { studentId: string }[];
  seatUtilization: { elective: string; filled: number; capacity: number }[];
  rounds: { label: string; allocated: number; unallocated: number }[];
};

export async function runAllocationEngine(): Promise<AllocationResult> {
  // Fetch submitted preferences (each document is one student snapshot)
  const prefs = await Preference.find({ status: "submitted" }).lean();

  if (prefs.length === 0) {
    return { allocatedStudents: [], unallocatedStudents: [], seatUtilization: [], rounds: [] };
  }

  // Fetch electives and build capacity map
  const electives = await Elective.find({ isActive: true }).lean();
  const capacityByLegacyId = new Map<string, number>();
  electives.forEach((e) => {
    capacityByLegacyId.set(e.legacyId, e.seatLimit);
  });

  // Pre-sort students by priority
  const students = prefs
    .map((p) => {
      const timestamp =
        (p.submittedAt instanceof Date ? p.submittedAt.getTime() : undefined) ??
        (p.updatedAt instanceof Date ? p.updatedAt.getTime() : undefined) ??
        (p.createdAt instanceof Date ? p.createdAt.getTime() : Date.now());

      return {
        prefId: p._id as Types.ObjectId,
        studentUserId: p.studentUserId as Types.ObjectId,
        studentId: p.studentUsername as string,
        name: p.studentName as string,
        cgpa: p.cgpa as number,
        backlogs: (p as any).backlogs ?? 0,
        timestamp,
        preferences: p.preferences
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((x) => x.electiveLegacyId as string),
      };
    })
    // basic validations: CGPA range, at least 3 prefs, no duplicates
    .filter((s) => {
      if (typeof s.cgpa !== "number" || s.cgpa < 0 || s.cgpa > 10) {
        // eslint-disable-next-line no-console
        console.warn("Skipping student due to invalid CGPA", s.studentId, s.cgpa);
        return false;
      }
      if (!s.preferences || s.preferences.length < 3) {
        // eslint-disable-next-line no-console
        console.warn("Skipping student due to insufficient preferences", s.studentId);
        return false;
      }
      const set = new Set(s.preferences);
      if (set.size !== s.preferences.length) {
        // eslint-disable-next-line no-console
        console.warn("Skipping student due to duplicate preferences", s.studentId);
        return false;
      }
      return true;
    });

  students.sort((a, b) => {
    if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa; // higher CGPA first
    if (a.backlogs !== b.backlogs) return a.backlogs - b.backlogs; // fewer backlogs first
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp; // earlier submission first
    return a.name.localeCompare(b.name); // alphabetical name
  });

  const allocatedStudents: { studentId: string; electiveId: string }[] = [];
  const unallocatedStudents: { studentId: string }[] = [];

  const bulkOps: Parameters<typeof Allocation.bulkWrite>[0] = [];
  const runId = new Types.ObjectId();

  const bands = [
    { label: "CGPA 9.0 - 10.0", min: 9, max: 10.0001, allocated: 0, unallocated: 0 },
    { label: "CGPA 8.0 - 8.9", min: 8, max: 8.9999, allocated: 0, unallocated: 0 },
    { label: "CGPA 7.0 - 7.9", min: 7, max: 7.9999, allocated: 0, unallocated: 0 },
    { label: "CGPA < 7.0", min: -0.0001, max: 7, allocated: 0, unallocated: 0 },
  ];

  const getBandIndex = (cgpa: number) => bands.findIndex((b) => cgpa >= b.min && cgpa <= b.max);

  for (const s of students) {
    // eslint-disable-next-line no-console
    console.log(`Processing student ${s.studentId} (CGPA ${s.cgpa}, backlogs ${s.backlogs})`);
    let assignedElective: string | null = null;

    for (const electiveId of s.preferences) {
      // eslint-disable-next-line no-console
      console.log(`  Checking preference ${electiveId}`);

      const capacity = capacityByLegacyId.get(electiveId);
      if (!capacity || capacity <= 0) {
        // no capacity or elective unknown
        // eslint-disable-next-line no-console
        console.log(`    No seats left in ${electiveId}`);
        continue;
      }

      // allocate seat
      capacityByLegacyId.set(electiveId, capacity - 1);
      assignedElective = electiveId;
      // eslint-disable-next-line no-console
      console.log(`    Allocated ${electiveId} to ${s.studentId}`);
      break;
    }

    const bandIdx = getBandIndex(s.cgpa);

    if (assignedElective) {
      allocatedStudents.push({ studentId: s.studentId, electiveId: assignedElective });
      if (bandIdx !== -1) bands[bandIdx].allocated += 1;
    } else {
      unallocatedStudents.push({ studentId: s.studentId });
      if (bandIdx !== -1) bands[bandIdx].unallocated += 1;
    }

    bulkOps.push({
      updateOne: {
        filter: { studentUserId: s.studentUserId },
        update: {
          $set: {
            runId,
            studentUsername: s.studentId,
            status: assignedElective ? "allocated" : "unallocated",
            electiveLegacyId: assignedElective ?? null,
            roundAllocated: bandIdx !== -1 ? bandIdx + 1 : undefined,
            announced: false,
            announcedAt: null,
          },
        },
        upsert: true,
      },
    });
  }

  if (bulkOps.length > 0) {
    await Allocation.bulkWrite(bulkOps);
  }

  const seatUtilization = electives.map((e) => {
    const remaining = capacityByLegacyId.get(e.legacyId) ?? e.seatLimit;
    const filled = e.seatLimit - remaining;
    return { elective: e.name, filled, capacity: e.seatLimit };
  });

  const rounds = bands
    .filter((b) => b.allocated > 0 || b.unallocated > 0)
    .map((b) => ({ label: b.label, allocated: b.allocated, unallocated: b.unallocated }));

  return { allocatedStudents, unallocatedStudents, seatUtilization, rounds };
}

