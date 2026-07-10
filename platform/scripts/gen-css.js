const fs = require("fs");
const path = require("path");

const out = path.resolve(__dirname, "../src/index.css");
const css = [
  '@import "tailwindcss";',
  "",
  "/* GameCastle Landing */",
  "",
].join("\n");

fs.writeFileSync(out, css, "utf8");
console.log(`gen-css.js wrote ${out}`);
