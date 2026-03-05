import { ADBClient } from "../src/adb_client";

async function main() {
  const adb = new ADBClient();
  const ui = await adb.dumpUI();
  console.log(ui);
}

main();
