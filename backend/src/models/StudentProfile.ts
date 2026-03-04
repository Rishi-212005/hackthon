import { Schema, model, Types } from "mongoose";

const studentProfileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true },
    studentId: { type: String, required: true, unique: true }, // hackathon Student ID
    profileCompleted: { type: Boolean, default: false },
    department: { type: String, required: true },
    semester: { type: Number, min: 1, max: 8, required: true },
    cgpa: { type: Number, min: 0, max: 10, required: true },
    backlogs: { type: Number, min: 0, default: 0, required: true },
    degree: { type: String },
    year: { type: String },
    cgpaVerified: { type: Boolean, default: false },
    cgpaVerifiedAt: { type: Date },
  },
  { timestamps: true }
);

export const StudentProfile = model("StudentProfile", studentProfileSchema);

