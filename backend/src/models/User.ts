import { Schema, model } from "mongoose";

export type UserRole = "student" | "admin" | "faculty";

const userSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["student", "admin", "faculty"],
      default: "student",
      required: true,
    },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true }, // roll number or username
    email: { type: String, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = model("User", userSchema);

