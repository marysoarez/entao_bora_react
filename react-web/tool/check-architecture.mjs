import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src", import.meta.url));
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
}
collect(root);

const errors = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const path = relative(root, file).replaceAll("\\", "/");
  if (
    path.startsWith("features/") &&
    /from ["'][^"']*app\/App["']/.test(source)
  ) {
    errors.push(`${path}: features não podem importar o componente raiz App`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Limites das features verificados.");
