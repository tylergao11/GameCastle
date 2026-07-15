var engine = require('./asset-engine-langgraph');

process.stdout.write(JSON.stringify(engine.describeGraph(), null, 2) + '\n');
