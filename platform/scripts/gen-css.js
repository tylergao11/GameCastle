const fs=require("fs");
const out="C:/Ai/GameCastle/platform/src/index.css";
let c="";
c+="@import "tailwindcss";
";
c+="
/* GameCastle Landing */
";
fs.writeFileSync(out,c,"utf8");
console.log("gen-css.js ready");