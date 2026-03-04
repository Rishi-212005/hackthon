import mongoose from "mongoose";

async function collMod(name: string, validator: any) {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await db.command({
      collMod: name,
      validator,
      validationLevel: "moderate",
      validationAction: "error",
    });
  } catch (e: any) {
    // If collection doesn't exist or user lacks permissions, don't crash the app.
    // eslint-disable-next-line no-console
    console.warn(`[validators] Skipped collMod for ${name}:`, e?.message || e);
  }
}

export async function ensureValidatorsCompatible() {
  // Make existing Atlas validators compatible with our current schema.
  // We allow both legacy fields and ObjectId fields for forwards/backwards compatibility.

  await collMod("preferences", {
    $jsonSchema: {
      bsonType: "object",
      required: ["studentUserId", "status", "preferences", "createdAt", "updatedAt"],
      properties: {
        studentUserId: { bsonType: "objectId" },
        studentUsername: { bsonType: ["string", "null"] },
        studentName: { bsonType: ["string", "null"] },
        department: { bsonType: ["string", "null"] },
        semester: { bsonType: ["int", "null"], minimum: 1, maximum: 8 },
        cgpa: { bsonType: ["double", "int", "decimal", "null"], minimum: 0, maximum: 10 },
        status: { enum: ["draft", "submitted"] },
        submittedAt: { bsonType: ["date", "null"] },
        preferences: {
          bsonType: "array",
          minItems: 3,
          maxItems: 10,
          items: {
            bsonType: "object",
            required: ["rank"],
            oneOf: [
              {
                required: ["electiveId"],
                properties: {
                  electiveId: { bsonType: "objectId" },
                  rank: { bsonType: "int", minimum: 1, maximum: 10 },
                },
              },
              {
                required: ["electiveLegacyId"],
                properties: {
                  electiveLegacyId: { bsonType: "string" },
                  rank: { bsonType: "int", minimum: 1, maximum: 10 },
                },
              },
            ],
          },
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  });

  await collMod("allocations", {
    $jsonSchema: {
      bsonType: "object",
      required: ["runId", "studentUserId", "status", "createdAt", "updatedAt"],
      properties: {
        runId: { bsonType: ["objectId", "null"] },
        studentUserId: { bsonType: "objectId" },
        studentUsername: { bsonType: ["string", "null"] },
        status: { enum: ["allocated", "unallocated"] },
        electiveId: { bsonType: ["objectId", "null"] },
        electiveLegacyId: { bsonType: ["string", "null"] },
        roundAllocated: { bsonType: ["int", "null"], minimum: 1, maximum: 50 },
        announced: { bsonType: ["bool", "null"] },
        announcedAt: { bsonType: ["date", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  });
}

