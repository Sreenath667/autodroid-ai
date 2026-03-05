import { writeFile } from "node:fs/promises";
import { ADBClient } from "../src/adb_client";

async function main() {
  const adb = new ADBClient();
  const screenshot = await adb.screenshot();
  console.log(await adb.screenSize());
  await writeFile("mobile.png", screenshot);
}

main();
