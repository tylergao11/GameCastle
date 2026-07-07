import os, sys
def read(f):
    with open(f, "r", encoding="utf-8") as fp:
        return fp.read()

# Load pieces
event_templates = read("C:/Ai/GameCastle/ai/event-templates.js")
event_parser = read("C:/Ai/GameCastle/ai/event-parser.js")
new_call_llm = read("C:/Ai/GameCastle/ai/_new_callLLM.js")
tail = read("C:/Ai/GameCastle/ai/_tail.js")

# Extract code blocks
cond_start = event_templates.find("var CONDITIONS = {")
act_code = event_templates[cond_start:]
parser_start = event_parser.find("function parseEventDSL")
parser_code = event_parser[parser_start:]

print(f"templates: {len(act_code)} chars, parser: {len(parser_code)} chars, callLLM: {len(new_call_llm)} chars, tail: {len(tail)} chars")
print("All pieces loaded OK")