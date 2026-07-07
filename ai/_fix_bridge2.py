import sys

with open('C:/Ai/GameCastle/ai/pipeline.js', 'rb') as f:
    data = f.read()

with open('C:/Ai/GameCastle/ai/_bridge.txt', 'r', encoding='utf-8', newline='') as f:
    template = f.read()

# Find bridge section in pipeline.js
cn_start = '当前游戏已有完整DSL'.encode('utf-8')
cn_end = '按【DSL 映射规则】翻译。'.encode('utf-8')

start = data.find(cn_start)
end = data.find(cn_end, start)
if start < 0 or end < 0:
    print('Bridge section not found')
    sys.exit(1)
end += len(cn_end) + 2  # include ';

# The template has \n line endings. Convert to \r\n for the JS file.
# The template is JS source code - it should use \r\n line endings.
# But the \n within JS strings (like '...\n') should remain as literal \n (0x5C 0x6E)
# The LINE ENDINGS between statements should be \r\n.
# Since the template was written with Unix \n, we need to convert line endings
# but NOT the literal backslash-n sequences within the strings.

# Actually, the template was written with heredoc, so Unix \n line separators.
# The literal \n in strings is represented as two chars: \ and n.
# When Python reads the file (newline=''), it preserves \n as line separator.
# So lines are separated by \n. 
# But the \n WITHIN the JS strings is ALSO \n (same byte 0x0A? Or 0x5C 0x6E?)
# 
# In the heredoc, I wrote: '...\n'
#   - \n in the heredoc is TWO chars: 0x5C and 0x6E (backslash + n)
#   - These are preserved because heredoc is single-quoted
# So in the template file, line breaks are 0x0A, and within-string \n is 0x5C 0x6E.

# Split by 0x0A to get lines, join with \r\n
lines = template.split('\n')
js_template = '\r\n'.join(lines)

new_bytes = js_template.encode('utf-8')

data = data[:start] + new_bytes + data[end:]

with open('C:/Ai/GameCastle/ai/pipeline.js', 'wb') as f:
    f.write(data)
print('Bridge replaced. Old:', end-start, 'New:', len(new_bytes))
