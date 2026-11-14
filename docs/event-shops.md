# Tìm shop event trong dữ liệu client (St-Pavlov)

Ghi chú này trả lời một câu hỏi rất cụ thể: **"Món X (psychube / item / skin) được bán ở
shop nào, giá bao nhiêu, mua được mấy lần?"** — và cách tìm ra câu trả lời đó chỉ bằng các
bảng tĩnh của client, không cần wiki, không cần mở game.

Ví dụ đã kiểm chứng: **Arrow of Verdict** bán ở shop *Hedone's Hoard* (activity **13903**)
với giá **8 000 Confetti Strip**, tối đa **1** bản.

---

## 0. Nguồn dữ liệu

```
githubfetch/St-Pavlov-Foundation/
  re1999-data-global-main/data/     # global, meta.json version 111.0.1077
    json/*.json                     # 1 892 bảng
    configs/language/language_en.json
  re1999-data-main/data/            # CN, version 113.0.1421 (text trong đây RỖNG)
                                    #   2 080 bảng
```

(Con số 1 846 / 2 008 trong `AGENTS.md` §2 là bản đo cũ; client đã được bump.)

Quy ước của repo: số liệu lấy từ St-Pavlov, **chữ** lấy từ `language_en.json` của bản
**global** kể cả với nội dung CN-only (bản CN không có text). Xem `AGENTS.md` §2.

Bảng cần cho việc này — tất cả nằm trong `data/json/`:

| File | Nội dung |
|---|---|
| `activity107.json` | **shop event**: 1 624 row, mỗi row = 1 ô hàng |
| `activity.json` | catalogue activity (id → tên, `typeId`, cờ retro) |
| `equip.json` | psychube (id, `name`, `name_en`, `rare`, `icon`) |
| `item.json` | item thường (id, `name`, `subType`, `rare`) |
| `currency.json` | tiền tệ / token (id, `name`, `subType`) |
| `skin.json` | skin (id = `skinId`, vd `305403`) |
| `store_goods.json` | shop bán thật (bundle, có `onlineTime`) |
| `activity113_task.json` | task ladder của event → thưởng tiền event |

---

## 1. Quy ước chuỗi `type#id#qty`

Mọi reference thưởng/giá trong game đều là chuỗi 3 phần, ví dụ `9#1575#1`.

| type | Ý nghĩa | Bảng resolve |
|---|---|---|
| `1` | item | `item.json` |
| `2` | currency / token | `currency.json` |
| `4` | nhân vật | `character.json` (id hero) |
| `5` | **skin** | `skin.json` (id = skinId) |
| `9` | **psychube** | `equip.json` (id = `equip.id`) |
| `13` | token shop (id nhỏ, vd `24`, `3902`) | `currency.json` |
| `11`, `24`, `31` | gói/decoration — hay gặp, **không** có trong 4 bảng trên | không resolve được, để nguyên `type11#…` |

Trong `activity107.json`, **giá luôn là type `2`** (1 624/1 624 row), còn `product` thì đủ
loại: `1` (1017), `2` (303), `9` (140), `13` (116), `11` (29), `5` (18), `31` (1).

> Cẩn thận: `9#1000#1` là psychube **Gluttony**, không phải "1 000 cái gì đó". Số đầu là
> type, không phải số lượng.

---

## 2. Quy trình 5 bước (thủ công, không cần script)

```powershell
cd "githubfetch\St-Pavlov-Foundation\re1999-data-global-main\data\json"
```

**Bước 1 — tìm entity.** Tra tên trong `equip.json` (`"name_en": "Arrow of Verdict"`)
→ `id: 1575`, `rare: 5`. Với item/skin thì tra `item.json` / `skin.json`.

Nếu chỉ có tên và không biết là loại nào:

```powershell
Select-String -Path "*.json" -Pattern "Arrow of Verdict" | Select-Object -First 10
```

(3 hit: hai file language + `equip.json:2714`.)

**Bước 2 — tìm ai bán nó.** Grep chính xác token, có dấu `#` ở cuối để không khớp nhầm
`1575` với `15750`:

```powershell
Select-String -Path "*.json" -Pattern "9#1575#"
```

Kết quả lý tưởng là đúng **1 hit**: `activity107.json:27905`. Nếu ra nhiều file, xem file
nào là bảng shop (`activity107`) và file nào chỉ là bảng reward khác (`activity113_task`,
`mail`, `activity220_*`).

**Bước 3 — đọc activityId.** Row đó có `"activityId": 13903`.

**Bước 4 — tra tên activity.** `activity.json` → row `id: 13903` → `"name": "language_10132718"`.
`language_10132718` trong `language_en.json` = **"Hedone's Hoard"**. `typeId: 107` = shop event.

**Bước 5 — dump cả shop.** Lọc `activity107.json` theo `activityId == 13903`, sort theo
`group` rồi `id`, resolve `product`/`cost` qua bảng ở §1.

---

## 3. Script dùng lại

Lưu thành `find_shop.py` ở **repo root** (cạnh `githubfetch/`). Ba chế độ:

```powershell
$env:PYTHONIOENCODING="utf-8"
python find_shop.py --name "Arrow of Verdict"   # tên → shop nào, giá bao nhiêu
python find_shop.py --entity 9:1575             # id chính xác
python find_shop.py --shop 13903                # dump toàn bộ 1 shop
```

```python
#!/usr/bin/env python3
"""find_shop.py - where is an item / psychube sold?  (St-Pavlov client tables)"""
import argparse, json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "githubfetch", "St-Pavlov-Foundation", "re1999-data-global-main", "data")
JSON = os.path.join(ROOT, "json")


def load(name):
    with open(os.path.join(JSON, name), encoding="utf-8") as fh:
        return json.load(fh)


def load_lang(locale="en"):
    # language_*.json is a LIST of {key, content} -- key it on "key", not "id"
    with open(os.path.join(ROOT, "configs", "language", f"language_{locale}.json"), encoding="utf-8") as fh:
        return {r.get("key"): r.get("content") for r in json.load(fh)}


LANG = load_lang()
EQUIP = {r["id"]: r for r in load("equip.json")}
ITEM = {r["id"]: r for r in load("item.json")}
CURRENCY = {r["id"]: r for r in load("currency.json")}
SKIN = {r["id"]: r for r in load("skin.json")}
ACTIVITY = {r["id"]: r for r in load("activity.json")}
SHOPS = load("activity107.json")


def label(kind, ident):
    """Resolve a '<type>#<id>' reference to a readable name."""
    try:
        ident = int(ident)
    except (TypeError, ValueError):
        return f"{kind}#{ident}"
    if kind == "9":
        e = EQUIP.get(ident)
        return (LANG.get(e.get("name")) or e.get("name_en") or f"equip {ident}") if e else f"equip {ident}"
    for table, prefix in ((ITEM, "item"), (CURRENCY, "currency"), (SKIN, "skin")):
        row = table.get(ident)
        if row:
            name = LANG.get(row.get("name") or "") or row.get("nameEn") or row.get("nameEng") or ""
            return f"{name} [{prefix} {ident}]" if name else f"{prefix} {ident}"
    return f"type{kind}#{ident}"


def activity_name(activity_id):
    row = ACTIVITY.get(activity_id)
    if not row:
        return "(unknown activity)"
    return LANG.get(row.get("name") or "") or row.get("nameEn") or ""


def find_by_entity(kind, ident):
    token = f"{kind}#{ident}#"
    rows = [r for r in SHOPS if r["product"].startswith(token)]
    if not rows:
        print(f"no activity shop sells {label(kind, ident)}")
        return
    print(f"{label(kind, ident)} is sold in {len(rows)} shop row(s):\n")
    for r in rows:
        cost_kind, cost_id, cost_qty = r["cost"].split("#")
        print(f"  activity {r['activityId']}  {activity_name(r['activityId'])!r}")
        print(f"    row {r['group']}/{r['id']}  qty={r['product'].split('#')[2]}  maxBuy={r['maxBuyCount']}")
        print(f"    price: {cost_qty} x {label(cost_kind, cost_id)}   isOnline={r['isOnline']}\n")


def dump_shop(activity_id):
    rows = [r for r in SHOPS if r["activityId"] == activity_id]
    if not rows:
        print(f"activity {activity_id}: no shop rows")
        return
    print(f"=== {activity_id}  {activity_name(activity_id)!r}  ({len(rows)} goods) ===\n")
    groups = {}
    for r in rows:
        groups.setdefault(r["group"], []).append(r)
    for group in sorted(groups):
        print(f"-- group {group} --")
        total = 0
        for r in sorted(groups[group], key=lambda x: x["id"]):
            prod_kind, prod_id, prod_qty = r["product"].split("#")
            cost_kind, cost_id, cost_qty = r["cost"].split("#")
            price = int(cost_qty)
            total += price * max(r["maxBuyCount"], 1)
            flag = "" if r["isOnline"] else "  [OFFLINE]"
            print(f"  {r['id']:<4} {label(prod_kind, prod_id):<46} x{prod_qty:<4}"
                  f" {price:>6} x {label(cost_kind, cost_id):<24} max={r['maxBuyCount']}{flag}")
        print(f"  group spend cap: {total}\n")


def search_name(needle):
    needle = needle.lower()
    hits = []
    for table, kind, prefix in ((EQUIP, "9", "equip"), (ITEM, "1", "item"), (CURRENCY, "2", "currency")):
        for ident, row in table.items():
            name = (LANG.get(row.get("name") or "") or row.get("name_en")
                    or row.get("nameEn") or row.get("nameEng") or "")
            if needle in name.lower():
                hits.append((prefix, kind, ident, name))
    if not hits:
        print(f"no entity name contains {needle!r}")
        return
    for prefix, kind, ident, name in hits:
        print(f"{prefix} {ident}: {name}")
        find_by_entity(kind, ident)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", help="search an entity by (partial) English name")
    ap.add_argument("--entity", help="exact reference such as 9:1575")
    ap.add_argument("--shop", type=int, help="dump one activity shop by activity id")
    args = ap.parse_args()

    if args.shop:
        dump_shop(args.shop)
    elif args.entity:
        kind, ident = args.entity.replace("#", ":").split(":")
        find_by_entity(kind, ident)
    elif args.name:
        search_name(args.name)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
```

Output mẫu:

```
equip 1575: Arrow of Verdict
Arrow of Verdict is sold in 1 shop row(s):

  activity 13903  "Hedone's Hoard"
    row 1/101  qty=1  maxBuy=1
    price: 8000 x Confetti Strip [currency 3901]   isOnline=True
```

---

## 4. Ví dụ đã kiểm chứng — patch 3.9 "Summer-Gold Sea"

Row gốc (global `activity107.json:27905`, CN cũng `:27905`, **giống hệt nhau**):

```json
{ "activityId": 13903, "id": 101, "product": "9#1575#1", "maxBuyCount": 1,
  "cost": "2#3901#8000", "group": 1, "tag": 1, "originalCost": 0, "isOnline": true }
```

Ba shop của 3.9:

| activityId | Tên | `typeId` | Tiền | Số món |
|---|---|---|---|---|
| `13903` | Hedone's Hoard | 107 | Confetti Strip (`3901`) | 32 |
| `13915` | Musae's Store | 107 | Marvelous Marble (`3904`) | 17 |
| `13923` | Glittering Parlor | 107 | Shard of Prophecy (`3203`) | 26 |

`13903` — trần chi tiêu: group 1 = **68 400**, group 2 = **50 350**, group 3 (sink vô hạn,
`maxBuyCount: 0`) = 1 590.

Group 1 (không reset): Immaterial Photoscope · RGS `1#793901` 18 000 · **Arrow of Verdict
`9#1575` 8 000** · Gluttony `9#1000` 12 000 · Crystal Casket `1#481010` 6 000 · Unilog
`1#140001` 1 000 ×2 · Fruit of Good and Evil 1 200 ×3 · Silver Bullet 400 ×8 · Watch Core
500 ×8 · Sonorous Knell `1#120013` 1 200 ×5 · item `1#221291` 1 200 · Tamer Badge `13#3902`
1 000 · Perpetual Clef `13#3903` 400 · Simple Vision Blocks `1#602801` 1 500 ×2.

Các activity khác của 3.9 sống cùng chỗ: `13901/13902` event chính, `13904` *Of Mortals and
Immortality* (`typeId` 220, bảng `activity220_hedone_*`), `13920/13921` Whitewater Racing /
Flappy Steeplechase (`racing_*`).

---

## 5. Ba bảng phụ rất hữu ích

**`activity113_task.json`** — task ladder, field `bonus` chứa token thưởng. Đếm tổng tiền
event farm được từ task:

```python
raw = open("activity113_task.json", encoding="utf-8").read()
total = sum(int(m.group(1)) for m in re.finditer(r"2#3901#(\d+)", raw))   # 16 100
```

(Con số này **nhỏ hơn** trần shop 118 750 → phần còn lại farm từ stage/minigame, không có
bảng tổng trong file tĩnh.)

**`store_goods.json`** — shop bán thật. Có `onlineTime`/`offlineTime` và **`activityId`**.
571 row có `onlineTime` → 63 mốc ngày, đúng nhịp patch 3 tuần:

```
2023-10-26 (launch) → 2023-11-09 → 2023-12-07 → 2024-01-18 → … → 2026-09-24 → 2026-11-05
```

`2026-11-05` = ngày mở 3.9. **Đây là nguồn ngày patch duy nhất trong client** — nhưng shop
event (`activity107`) thì **không** có cột ngày nào, `onlineTime` của các row 3.9 đều rỗng.

**`activity.json` cờ retro** — client không bao giờ xoá event cũ:

- `isRetroAcitivity`: 603 row `0`, **89 row `2`**, 9 row `1`.
- `permanentParentAcitivityId`: 68 row, activity con trỏ về event cha
  (`11102/11103/11104` → `11101` *The Theft of the Rimet Cup*).
- Shop cũ nhất (`11112`, 2023) vẫn còn nguyên giá `9#1509#1` ← `2#111#8000`, chỉ khác
  `isOnline: false`. Trên toàn bộ: **965 row `true` / 659 row `false`**.

---

## 6. Bẫy cần nhớ

1. **`language_en.json` là list `{key, content}`**, không phải dict. Build dict trên `key`.
   (`language_server_en.json` cũng vậy; nó thiếu nhiều key hơn.)
2. **`item.json` không chứa currency**, và ngược lại. Một id có thể có ở cả hai bảng với
   nghĩa khác nhau → luôn resolve theo *type* trước.
3. **Id trùng giữa các bảng** (`620101` là item, monster, head icon). Luôn namespace theo
   bảng/folder.
4. **`maxBuyCount: 0`** không phải "không bán được" mà là **không giới hạn** (sink).
5. **`isOnline: false`** = row còn nhưng đã tắt. Đừng kết luận "event cũ bị xoá".
6. **Id activity theo patch**: `111xx` = 1.1, `139xx` = 3.9, `140xx+` = 4.0/4.1 (mới có ở
   CN). Prefix là cách nhanh nhất để đoán patch khi không có ngày.
7. **Không `rg`** trong PowerShell máy này. Dùng `Select-String -Path "*.json" -Pattern …`
   hoặc grep tool. **Đừng quét** `githubfetch/**`, `ignore/**`, `images/**` toàn bộ.
8. **PowerShell encoding**: `python script.py > out.txt` ghi UTF-16 → dùng
   `$env:PYTHONIOENCODING="utf-8"` + `| Set-Content -Encoding utf8`.
9. **Inline `python -c`** với nhiều `#`/`{}` dễ bị PowerShell phân tích sai — viết ra file
   `tmp-*.py` rồi chạy.

---

## 7. Nối sang codebase này

`data/` là **máy sinh**, không sửa tay. Khi đã biết psychube id, mọi thứ còn lại đã có sẵn:

| Cần gì | Ở đâu |
|---|---|
| key psychube của app | `data/psychube_id.json` → `"<rare+1>:<equip.id>"` = `"6:1575"` |
| chi tiết + amplification | `data/psychubes_data.json["6:1575"]` |
| icon 180×214 | `images/psychube_icon/6/1575.png` |
| art chi tiết 276×228 | `images/equip_defaulticon/1575.png` |
| nhân vật/skin | `data/ArcanistMap.json` (list, sort theo id) |

Quy tắc: **rarity app = `equip.rare + 1`** (6★ = `rare: 5`). Key luôn là game id, không
phải id tuần tự.

Kiểm tra lại sau khi đổi dữ liệu:

```powershell
npm run sync          # sinh lại data/
npm run sync:verify   # assert các invariant
```

Với psychube mới sang global: nó sẽ **tự rời** `data/future_sight.json → Psychube`. Ví dụ
3.9 mang `1574`, `1575`, `1576` sang global nên danh sách CN-only tụt từ 10 → 7
(`1451/1452`, `1577–1581`).

---

## 8. Giới hạn của cách làm này

- **Không có ngày mở/đóng event** trong client — chỉ server biết.
- **Không biết tỉ giá farm**: tiền event nhận theo lượt chơi nằm ở logic server/minigame,
  không có bảng tổng.
- **Không phân biệt được "đang bán" với "sẽ bán"** nếu không có ngày: `isOnline: true` chỉ
  nghĩa là chưa bị tắt, kể cả với nội dung CN-ahead.
- Con số **đúng tại thời điểm dump**: global `111.0.1077`, CN `113.0.1421` (14/11/2026).
  Re-check `data/meta.json` trước khi tin.