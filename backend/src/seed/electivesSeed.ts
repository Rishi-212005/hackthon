import { Elective } from "../models/Elective";

const seedElectives = [
  { legacyId: "1", code: "CS401", name: "Machine Learning", facultyName: "Dr. Priya Sharma", department: "Computer Science", seatLimit: 70 },
  { legacyId: "2", code: "CS402", name: "Cyber Security", facultyName: "Dr. Rajeev Kumar", department: "Computer Science", seatLimit: 70 },
  { legacyId: "3", code: "EC401", name: "IoT Systems", facultyName: "Dr. Anita Desai", department: "Electronics", seatLimit: 70 },
  { legacyId: "4", code: "CS403", name: "Cloud Computing", facultyName: "Prof. Vikram Patel", department: "Computer Science", seatLimit: 70 },
  { legacyId: "5", code: "ME401", name: "Robotics", facultyName: "Dr. Suresh Nair", department: "Mechanical", seatLimit: 70 },
  { legacyId: "6", code: "CS404", name: "Blockchain Technology", facultyName: "Dr. Meena Iyer", department: "Computer Science", seatLimit: 70 },
  { legacyId: "7", code: "CS405", name: "Natural Language Processing", facultyName: "Dr. Arjun Reddy", department: "Computer Science", seatLimit: 70 },
  { legacyId: "8", code: "EC402", name: "VLSI Design", facultyName: "Prof. Kavitha Rao", department: "Electronics", seatLimit: 70 },
];

export async function ensureElectivesSeeded() {
  const count = await Elective.countDocuments();
  if (count > 0) return;
  await Elective.insertMany(seedElectives.map((e) => ({ ...e, isActive: true })));
}

