import fs from "node:fs";
import path from "node:path";

const appRoot = path.join(process.cwd(), "app");

function routeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(target);
    return entry.isFile() && entry.name === "route.ts" ? [target] : [];
  });
}

const exceeded = routeFiles(appRoot).flatMap((file) => {
  const source = fs.readFileSync(file, "utf8");
  const match = /^\s*export\s+const\s+maxDuration\s*=\s*(\d+(?:\.\d+)?)\b/m.exec(source);
  return match && Number(match[1]) > 60 ? [`${path.relative(process.cwd(), file)}: ${match[1]}`] : [];
});

if (exceeded.length) {
  console.error("Vercel Hobby maxDuration must be 60 seconds or less:");
  exceeded.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Vercel maxDuration check passed.");
