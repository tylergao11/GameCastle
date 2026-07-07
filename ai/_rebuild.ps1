 = @'
/**
 * GameCastle Pipeline v2
 */
var fs = require('fs');
var path = require('path');

var STATE_DIR = path.join(__dirname, '..', 'output');
var LOG_PATH = path.join(STATE_DIR, 'pipeline.log');
function gc_log(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + ' ' + msg + String.fromCharCode(10)); } catch(e) {}
}
var BRIEF_PATH = path.join(STATE_DIR, 'design-brief.json');
var HISTORY_PATH = path.join(STATE_DIR, 'conversation.json');