import bcrypt from "bcryptjs";
import { User } from "../models/User";

export async function ensureDefaultAdmin() {
  const existing = await User.findOne({ role: "admin", username: "admin" }).select("_id");
  if (existing) return;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await User.create({
    role: "admin",
    name: "Default Admin",
    username: "admin",
    email: "admin@college.ac.in",
    passwordHash,
    isActive: true,
  });
}

