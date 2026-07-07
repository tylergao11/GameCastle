var fs = require("fs");
var c = fs.readFileSync("C:/Ai/GameCastle/ai/pipeline.js", "utf8");
var s = c.substring(c.indexOf("var CONDITIONS = {"), c.indexOf("var EXEC = {};"));
eval(s);

var t1 = "on collision Player Coin";
var w1 = t1.split(/s+/).filter(Boolean);
console.log("collision words:", w1);
console.log("  w1[1]:", w1[1], " === collision:", w1[1]==="collision");
console.log("  w1.length >= 4:", w1.length >= 4);
var ct = CONDITIONS.collision(w1[2], w1[3]);
console.log("  CONDITIONS.collision result:", JSON.stringify(ct));

var t2 = "on key Space";
var w2 = t2.split(/s+/).filter(Boolean);
console.log("key words:", w2);
console.log("  w2[1]:", w2[1], " === key:", w2[1]==="key");
var kt = CONDITIONS.key(w2[2]);
console.log("  CONDITIONS.key result:", JSON.stringify(kt));