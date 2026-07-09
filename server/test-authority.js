var ServerOrderedInputSession = require("./server-ordered-input").ServerOrderedInputSession;

var session = new ServerOrderedInputSession();
session.submitInput("p2", 1, { left: true });
var early = session.collectReadyFrames();
session.submitInput("p1", 0, { right: true });
var frames = session.collectReadyFrames();

if (early.length !== 0 || frames.length !== 2 || frames[0].tick !== 0 || frames[1].tick !== 1) {
  console.error("FAIL server_ordered_input_template");
  process.exit(1);
}

console.log("PASS server_ordered_input_template");
