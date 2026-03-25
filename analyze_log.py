import json
import re

with open('C:/Users/lt/Desktop/obsidian.md-1774268556936.log', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Searching for tool parts in SSE FULL chunks...")
found = 0
for line in lines:
    if 'SSE FULL chunk:' in line and 'message.part.updated' in line:
        # Try to extract JSON after "data: "
        match = re.search(r'data: ({.+})$', line.strip())
        if match:
            try:
                data = json.loads(match.group(1))
                part = data.get('properties', {}).get('part', {})
                if part.get('type') == 'tool':
                    print("\n=== TOOL PART FOUND ===")
                    print(json.dumps(part, indent=2, ensure_ascii=False))
                    found += 1
                    if found >= 3:
                        break
            except Exception as e:
                pass

if found == 0:
    print("No tool parts found in SSE FULL chunks")
    print("\nSearching in raw chunks...")
    for line in lines:
        if 'SSE raw chunk:' in line and 'message.part.updated' in line:
            match = re.search(r'data: ({.+})$', line.strip())
            if match:
                try:
                    data = json.loads(match.group(1))
                    part = data.get('properties', {}).get('part', {})
                    if part.get('type') == 'tool':
                        print("\n=== TOOL PART FOUND ===")
                        print(json.dumps(part, indent=2, ensure_ascii=False))
                        found += 1
                        if found >= 3:
                            break
                except:
                    pass

print(f"\nTotal tool parts found: {found}")
