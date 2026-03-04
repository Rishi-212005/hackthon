import { Schema, model, Types } from "mongoose";

const allocationSchema = new Schema(
  {
    runId: { type: Types.ObjectId, ref: "AllocationRun" },
    studentUserId: { type: Types.ObjectId, ref: "User", required: true },
    studentUsername: { type: String, required: true }, // roll number
    status: { type: String, enum: ["allocated", "unallocated"], required: true },
    electiveLegacyId: { type: String }, // matches Elective.legacyId
    roundAllocated: { type: Number, min: 1 },
    announced: { type: Boolean, default: false },
    announcedAt: { type: Date },
  },
  { timestamps: true }
);

allocationSchema.index({ studentUserId: 1 }, { unique: true, name: "uq_allocations_studentUserId" });
allocationSchema.index({ announced: 1 }, { name: "ix_allocations_announced" });

export const Allocation = model("Allocation", allocationSchema);

