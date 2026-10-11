import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = [];
async function walk(dir = "dist", prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      await walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
    else if (entry.name !== "sw.js") assets.push(prefix + entry.name);
  }
}
await walk();
assets.sort();
const hash = createHash("sha256");
for (const asset of assets) hash.update(await readFile(`dist/${asset}`));
const source = await readFile("scripts/sw-template.js", "utf8");
hash.update(source);
await writeFile(
  "dist/sw.js",
  source
    .replace("__VERSION__", hash.digest("hex").slice(0, 16))
    .replace("__ASSETS__", JSON.stringify(assets)),
);
