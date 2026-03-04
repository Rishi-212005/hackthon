import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { User } from "../models/User";
import { StudentProfile } from "../models/StudentProfile";
import { requireAuth, type AuthedRequest } from "../middleware/auth";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1), // roll number or chosen username
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(["student", "admin", "faculty"]).default("student"),
  department: z.string().min(1),
  semester: z.number().int().min(1).max(8),
  cgpa: z.number().min(0).max(10),
  studentId: z.string().min(1),
});

router.post("/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await User.findOne({ username: data.username });
    if (existingUser) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await User.create({
      role: data.role,
      name: data.name,
      username: data.username,
      email: data.email,
      passwordHash,
    });

    await StudentProfile.create({
      userId: user._id,
      studentId: data.studentId,
      department: data.department,
      semester: data.semester,
      cgpa: data.cgpa,
      profileCompleted: false,
      cgpaVerified: false,
    });

    return res.status(201).json({ id: user._id, username: user.username });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(400).json({ message: err.message ?? "Invalid data" });
  }
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(["student", "admin", "faculty"]),
});

router.post("/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await User.findOne({ username: data.username, role: data.role });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not set");
    }

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
      },
      secret,
      { expiresIn: "8h" }
    );

    return res.json({
      token,
      role: user.role,
      name: user.name,
      id: user._id,
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(400).json({ message: err.message ?? "Invalid data" });
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("_id role name username email isActive");
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!user.isActive) return res.status(403).json({ message: "User is inactive" });
  return res.json({
    id: user._id,
    role: user.role,
    name: user.name,
    username: user.username,
    email: user.email ?? null,
  });
});

export default router;

