import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

with open("data/temp_data.json", "r", encoding="utf-8") as f:
    td = json.load(f)

with open("data/guide_builds.json", "r", encoding="utf-8") as f:
    gb = json.load(f)

with open("data/psychube_id.json", "r", encoding="utf-8") as f:
    psychube_id = json.load(f)

# Psychube canonical lookup
canonical_chubes = {}
for r, l in psychube_id.items():
    for p in l:
        if p.get("name"):
            canonical_chubes[p["name"].lower()] = p["name"]
            canonical_chubes[p["name"].replace("\u2019", "'").lower()] = p["name"]

def normalize_psychube(p):
    if not p: return ""
    norm = p.replace("\u2019", "'").lower()
    return canonical_chubes.get(norm, p)

import json
with open("data/character_reso_shape.json", "r", encoding="utf-8") as f:
    crs = json.load(f)
with open("data/shape_patterns.json", "r", encoding="utf-8") as f:
    sp = json.load(f)

for item in td:
    p = item.get("portrait_recommended", "")
    if p and not all(c in "012345/ " for c in p):
        print(item["name"], repr(p))












