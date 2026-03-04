import { Router } from "express";
import { Elective } from "../models/Elective";

const router = Router();

router.get("/", async (_req, res) => {
  const electives = await Elective.find({ isActive: true })
    .select("legacyId code name facultyName department seatLimit")
    .sort({ code: 1 })
    .lean();
  return res.json(electives);
});

export default router;

