const fs = require("fs");
const path = require("path");

const out = path.resolve(__dirname, "../src/index.css");
const css = process.argv[2] ?? "";

fs.appendFileSync(out, `${css}\n`, "utf8");
console.log(`appended ${css.length} chars to ${out}`);
