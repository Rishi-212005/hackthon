import { Schema, model } from "mongoose";

const electiveSchema = new Schema(
  {
    legacyId: { type: String, required: true, unique: true }, // matches frontend mockData ids ("1","2",...)
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    facultyName: { type: String },
    department: { type: String },
    seatLimit: { type: Number, required: true, default: 70, min: 1 },
    semester: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Elective = model("Elective", electiveSchema);

