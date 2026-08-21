import { openCenterDatabase } from "./database.mjs";

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const pin = valueFor("--pin") || process.env.LOCAL_ADMIN_PIN;
if (!pin) {
  console.error("عيّن LOCAL_ADMIN_PIN مؤقتًا أو شغّل setup-local-center.ps1؛ لا تحفظ PIN داخل .env.");
  process.exit(1);
}

const store = openCenterDatabase({ dataDir: valueFor("--data-dir") });
try {
  const username = valueFor("--username") || process.env.LOCAL_ADMIN_USERNAME || store.getConfig("migrated_admin_username") || "admin";
  const result = store.configureAdmin(username, pin);
  console.log(`تم إعداد حساب الإدارة المحلي: ${result.username}`);
  console.log(`قاعدة البيانات: ${store.paths.databasePath}`);
} finally {
  store.close();
}
