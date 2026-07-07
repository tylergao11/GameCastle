function parseLine(line) {
  line = line.trim();
  if (!line || line[0] === "#") return null;
  if (line.startsWith("on ") || line.startsWith("every ")) {
    return { verb: "add", target: "event", params: { desc: line } };
  }
  var tokens = [];
  var current = "";
  var inQuote = false;
  var q = "";
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuote) { if (ch === q) inQuote = false; else current += ch; }
    else if (ch === "" || ch === "'") { inQuote = true; q = ch; }
    else if (ch === " ") { if (current) { tokens.push(current); current = ""; } }
    else current += ch;
  }
  if (current) tokens.push(current);
  if (tokens.length < 1) return null;
  var verb = tokens[0];
  var target = "";
  var startIdx = 1;
  if (tokens.length > 1 && tokens[1].indexOf("=") < 0) {
    target = tokens[1]; startIdx = 2;
  }
  var params = {};
  if (tokens.length > startIdx && tokens[startIdx] && tokens[startIdx][0] === "#") {
    params["index"] = parseInt(tokens[startIdx].substring(1))||0;
    startIdx++;
  }
  for (var j = startIdx; j < tokens.length; j++) {
    var eq = tokens[j].indexOf("=");
    if (eq > 0) {
      var k = tokens[j].substring(0, eq);
      var v = tokens[j].substring(eq + 1);
      if (v === "true") v = true;
      else if (v === "false") v = false;
      else if (/^-?d+(.d+)?$/.test(v)) v = parseFloat(v);
      params[k] = v;
    }
  }
  return { verb: verb, target: target, params: params };
}

function parseDSL(text) {
  var lines = text.split(String.fromCharCode(10));
  var ops = [];
  for (var i = 0; i < lines.length; i++) {
    var op = parseLine(lines[i]);
    if (op) ops.push(op);
  }
  return ops;
}
