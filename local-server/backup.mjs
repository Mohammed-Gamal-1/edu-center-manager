import { createDatabaseBackup, openCenterDatabase } from "./database.mjs";

const store = openCenterDatabase();
try {
  const result = await createDatabaseBackup(store, process.argv[2] || "manual-transfer");
  console.log(`تم إنشاء نسخة SQLite متسقة: ${result.path}`);
} finally {
  store.close();
}
