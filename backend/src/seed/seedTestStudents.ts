import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { StudentProfile } from "../models/StudentProfile";
import { Preference } from "../models/Preference";
import { Allocation } from "../models/Allocation";
import { Elective } from "../models/Elective";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    // eslint-disable-next-line no-console
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  // eslint-disable-next-line no-console
  console.log("Connected to MongoDB, seeding test students...");

  // Clear existing unannounced allocations and all preferences (fresh run)
  await Allocation.deleteMany({ announced: false });
  await Preference.deleteMany({});

  const electives = await Elective.find({ isActive: true }).lean();
  if (electives.length < 3) {
    // eslint-disable-next-line no-console
    console.error("Need at least 2 electives to seed test students.");
    process.exit(1);
  }

  const cyber = electives.find((e) => e.code === "CS402"); // Cyber Security
  const cloud = electives.find((e) => e.code === "CS403"); // Cloud Computing
  const others = electives.filter((e) => e.code !== "CS402" && e.code !== "CS403");

  if (!cyber || !cloud || others.length === 0) {
    // eslint-disable-next-line no-console
    console.error("Expected electives CS402 (Cyber Security), CS403 (Cloud Computing), and at least one other elective.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash("password123", 10);

  const totalStudents = 200;

  const branches = ["Computer Science", "Electronics", "Mechanical", "Information Technology"];

  for (let i = 1; i <= totalStudents; i++) {
    const roll = `TST${String(i).padStart(3, "0")}`;
    const name = `Test Student ${i}`;

    let user = await User.findOne({ username: roll });
    if (!user) {
      user = await User.create({
        role: "student",
        name,
        username: roll,
        passwordHash,
        isActive: true,
      });
    }

    const cgpaBase = 6 + ((i * 7) % 5); // spread 6–10
    const cgpa = Math.min(10, cgpaBase + (i % 3) * 0.2);
    const backlogs = i % 11 === 0 ? 2 : i % 7 === 0 ? 1 : 0;
    const department = branches[i % branches.length];
    const semester = 6;

    await StudentProfile.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          studentId: roll,
          profileCompleted: true,
          department,
          semester,
          cgpa,
          backlogs,
          degree: "B.Tech",
          year: "3rd Year",
        },
      },
      { upsert: true, new: true }
    );

    // Build preferences
    const prefs: { electiveLegacyId: string; rank: number }[] = [];
    const chosen = new Set<string>();

    const pickElective = (source: typeof electives) => {
      const e = source[Math.floor(Math.random() * source.length)];
      return e.legacyId as string;
    };

    let firstChoiceId: string;
    if (i <= 90) {
      // 90 students prefer Cyber Security first
      firstChoiceId = cyber.legacyId as string;
    } else if (i <= 190) {
      // Next 100 students prefer Cloud Computing first
      firstChoiceId = cloud.legacyId as string;
    } else {
      // Last 10 students pick a non-competitive elective first
      firstChoiceId = pickElective(others as any);
    }
    chosen.add(firstChoiceId);
    prefs.push({ electiveLegacyId: firstChoiceId, rank: 1 });

    // Second and third preferences from remaining electives (scatter across all)
    while (prefs.length < 3) {
      const nextId = pickElective(electives as any);
      if (chosen.has(nextId)) continue;
      chosen.add(nextId);
      prefs.push({ electiveLegacyId: nextId, rank: prefs.length + 1 });
    }

    await Preference.findOneAndUpdate(
      { studentUserId: user._id },
      {
        $set: {
          studentUsername: roll,
          studentName: name,
          department,
          semester,
          cgpa,
          backlogs,
          status: "submitted",
          submittedAt: new Date(),
          preferences: prefs,
        },
      },
      { upsert: true, new: true }
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${totalStudents} test students with submitted preferences.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

