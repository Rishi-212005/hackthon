import { Schema, model, Types } from "mongoose";

const preferenceItemSchema = new Schema(
  {
    electiveLegacyId: { type: String, required: true },
    rank: { type: Number, required: true, min: 1, max: 10 },
  },
  { _id: false }
);

const preferenceSchema = new Schema(
  {
    studentUserId: { type: Types.ObjectId, ref: "User", required: true, unique: true },
    studentUsername: { type: String, required: true }, // roll number for easy admin queries
    studentName: { type: String, required: true },
    department: { type: String, required: true },
    semester: { type: Number, required: true, min: 1, max: 8 },
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, required: true, min: 0, default: 0 },
    status: { type: String, enum: ["draft", "submitted"], default: "draft", required: true },
    submittedAt: { type: Date },
    preferences: { type: [preferenceItemSchema], required: true },
  },
  { timestamps: true }
);

preferenceSchema.index({ studentUsername: 1 }, { name: "ix_preferences_studentUsername" });

export const Preference = model("Preference", preferenceSchema);

