with open('C:/Ai/GameCastle/ai/pipeline.js', 'rb') as f:
    data = f.read()

with open('C:/Ai/GameCastle/ai/_bridge.txt', 'r', encoding='utf-8', newline='') as f:
    template = f.read()

# Broken section bounds
start = data.find(b"um = \x27\u5f53\u524d")
end_tag = b"\u7ffb\u8bd1\u3002\x27;"
end = data.find(end_tag, start)
end += len(end_tag)

print(f'Replacing bytes {start}-{end} ({end-start} bytes)')

# Convert template (Unix \n) to \r\n for JS file
lines = template.split('\n')
js_code = '\r\n'.join(lines)
new_bytes = js_code.encode('utf-8')

data = data[:start] + new_bytes + data[end:]

with open('C:/Ai/GameCastle/ai/pipeline.js', 'wb') as f:
    f.write(data)
print(f'Done. New section: {len(new_bytes)} bytes')
