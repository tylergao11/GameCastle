const fs=require("fs");const f="C:/Ai/GameCastle/platform/src/index.css";const c=process.argv[2];fs.appendFileSync(f,c+"
","utf8");console.log("appended "+c.length+" chars");