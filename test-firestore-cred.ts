import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId);

async function test() {
  console.log("Testing with credential.applicationDefault()...");
  try {
    const snap = await db.collection("users").limit(1).get();
    console.log("Success! Found", snap.size, "users");
  } catch (e: any) {
    console.error("Test failed!");
    console.error("Message:", e.message);
  }
}

test();
