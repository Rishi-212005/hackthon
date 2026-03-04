import { config } from "dotenv";
config();

import mongoose from "mongoose";
import app from "./app";
import { ensureElectivesSeeded } from "./seed/electivesSeed";
import { ensureValidatorsCompatible } from "./seed/migrateValidators";
import { ensureDefaultAdmin } from "./seed/adminSeed";

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is not set. Define it in your .env file.");
}

async function start() {
  await mongoose.connect(MONGO_URI);
  // eslint-disable-next-line no-console
  console.log("MongoDB connected");

  await ensureValidatorsCompatible();
  await ensureElectivesSeeded();
  await ensureDefaultAdmin();

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});

