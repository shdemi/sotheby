# REVERSE: 1999 VIETNAMESE LOCALIZATION RULESET
**Style Guide:** HoYoverse (Genshin Impact / Honkai: Star Rail) Vietnamese syntax & phrasing, combined with Reverse: 1999 English core terminology.

---

## 1. DO-NOT-TRANSLATE RULES (GIỮ NGUYÊN TIẾNG ANH 100%)

1. **Bracketed Terms (`[...]`):** NEVER translate anything inside square brackets.
   - *Examples:* `[Burn]`, `[Poison]`, `[Shield]`, `[Lingering Glow]`, `[Conduit]`, `[Array]`, `[Static Genesis DMG]`, `[Neg Status]`, `[Stats Down]`, `[Control]`, `[Precast Incantation]`.
2. **Proper Nouns:** Keep all Character Names, Skill Names, Inheritance Names, Euphoria Names, and Psychube Names in English.
3. **Afflatus & Combat Stats:**
   - **Afflatus:** `Afflatus`, `Mineral`, `Star`, `Plant`, `Beast`, `Spirit`, `Intellect`
   - **Damage Types:** `Reality DMG`, `Mental DMG`, `Genesis DMG`
   - **Offensive Stats:** `ATK`, `ATK%`, `DMG Dealt`, `DMG Bonus`, `Incantation Might`, `Ultimate Might`, `Conduit Might`, `Critical Rate`, `Critical DMG`, `Penetration Rate`, `Genesis DMG Dealt`, `Riposte DMG Bonus`
   - **Defensive/Utility Stats:** `HP`, `DEF`, `DMG Taken Reduction`, `Critical Resist Rate`, `Genesis DMG Taken`, `Shield`, `Afflatus Guard`, `Cure`, `Healing Done`
4. **Core Game Mechanics:**
   - `Incantation`, `Ultimate`, `Moxie`, `Max Moxie`, `AP`, `AP Area`, `Spelldock`, `Extra Action`, `Riposte`, `Counter`, `Channel`, `Array`, `Rewrite`, `Harmonization`, `Energy`, `Mineral Energy`, `Star Energy`, `Progress`, `Eureka`, `Dynamo`, `Inheritance`, `Portray`, `Euphoria`.

---

## 2. HOYOVERSE-STYLE SYNTAX & PHRASING (QUY TẮC HÀNH VĂN CHUẨN GENSHIN/HSR)

### 2.1. Eliminate Passive Voice (Khử câu bị động tiếng Anh)
Convert awkward English passive structures into direct, active Vietnamese phrasing.
- ❌ *Bad:* Mental DMG gây ra bởi [A Flash of Wildfire] được tăng lên 240%.
- ✅ *Good:* Sát thương Mental DMG của [A Flash of Wildfire] tăng thành 240%.

### 2.2. Strict Distinction: Additive vs. Replacement (Phân biệt "Tăng thêm" vs "Tăng thành")
- **`increased by X%` / `deals an additional X%`** (Additive) $\rightarrow$ Dịch là **"tăng thêm X%"**, **"gây thêm X%"**, hoặc viết tắt **`+X%`**.
- **`increased to X%` / `now deals X%`** (Replacement/New Value) $\rightarrow$ Dịch là **"tăng thành X%"** hoặc **"giờ gây X%"**.

### 2.3. Duration Placement (Vị trí thời lượng hiệu ứng)
Always place effect durations (`for X rounds`) at the end of the clause, preceded by a comma, using **"duy trì X round"**.
- *EN:* `Grants all allies DMG Dealt +15% for 2 rounds.`
- *VI:* `Giúp toàn bộ phe ta nhận DMG Dealt +15%, duy trì 2 round.`

### 2.4. Trigger Caps & Stacking Limits (Giới hạn kích hoạt & Cộng dồn)
- **`triggers at most X time(s) per round`** $\rightarrow$ Đảo ngữ thành: **`(mỗi round tối đa kích hoạt X lần)`**.
- **`stacking up to X times`** $\rightarrow$ Dịch là: **`, cộng dồn tối đa X lần`** (hoặc **`tối đa X cộng dồn`**).
- **`up to a maximum of X points`** $\rightarrow$ Dịch là: **`(tối đa tính X điểm)`**.

### 2.5. Scaling & Proportional Formulas (`For every X, Y...`)
Use the structure: **"Với mỗi [X], [Y]..."** or **"Mỗi [X] sẽ giúp/khiến [Y]..."**. Always format math formulas in parentheses using the `×` symbol.
- *EN:* `Deals Genesis DMG equal to (the user's ATK x20%)`
- *VI:* `Gây Genesis DMG bằng (ATK của người thi triển ×20%)`
- *EN:* `For every 10 points of [Lingering Glow], [Inner Flame Unleashed] deals an additional 35% Mental DMG.`
- *VI:* `Với mỗi 10 điểm [Lingering Glow], [Inner Flame Unleashed] gây thêm 35% Mental DMG.`

### 2.6. Action Verbs Standardization (Chuẩn hóa động từ)
- **`casts` / `uses` (Active Skills/Ultimates):** `thi triển`
- **`performs` / `triggers` / `casts` (Follow-ups/Passives/Ripostes):** `phát động`
- **`grants [Ally]`:** `giúp [đồng minh/phe ta] nhận...` hoặc `cấp cho [đồng minh/phe ta]...` (Avoid overusing "ban cho").
- **`inflicts [Stackable DoT/Debuff] on target`:** `gây X cộng dồn [Burn/Poison] lên mục tiêu`
- **`inflicts [Unique State] on target`:** `khiến mục tiêu rơi vào trạng thái [X]` hoặc `thi triển [X] lên mục tiêu`
- **`cleanses`:** `thanh tẩy`
- **`deploys the [X] array`:** `triển khai Array [X]`

---

## 3. MASTER GLOSSARY (BẢNG TỪ ĐIỂN CỐ ĐỊNH)

| English Term | Vietnamese Translation (Mandatory) |
| :--- | :--- |
| `1-target attack` | Tấn công đơn mục tiêu. |
| `Mass attack` (All enemies) | Tấn công diện rộng. (Gây ... lên toàn bộ kẻ địch) |
| `Mass attack` (2 enemies) | Tấn công diện rộng. (Gây ... cho 2 kẻ địch) |
| `Self buff` | Tự cường hóa. |
| `Mass buff` | Buff diện rộng. |
| `1-target debuff` / `Mass debuff` | Debuff đơn mục tiêu. / Debuff diện rộng. |
| `Mass counter` | Counter diện rộng. |
| `Self channel` | Self Channel, tiến vào trạng thái... |
| `stacks` | cộng dồn *(Thống nhất 100%, không dùng "tầng" hay "stack")* |
| `round` / `rounds` | round *(Giữ nguyên "round" ở mọi ngữ cảnh)* |
| `all allies` / `allied` | toàn bộ phe ta / đồng minh |
| `the wearer` / `the carrier` (Psychube) | người trang bị |
| `main target` | mục tiêu chính |
| `on hit` / `targets hit` | khi đánh trúng / mục tiêu trúng đòn |
| `When entering battle` | Khi vào trận |
| `At the start of the round` | Khi bắt đầu round |
| `At the end of the round` | Khi kết thúc round |
| `Before attacking` / `Right before attacking` | Trước khi tấn công / Ngay trước khi tấn công |
| `After attacking` | Sau khi tấn công |
| `takes an active action` | chủ động hành động |
| `when settling` / `upon settlement` (DoT) | khi hiệu ứng kích hoạt |
| `Incantation Draw Limit` / `Spelldock Limit` | Giới hạn rút Incantation |
| `At rank 1/2/3` / `At Incantation rank 1/2/3` | Ở Incantation hạng 1/2/3 |
| `excess Critical Rate` | Critical Rate vượt mức |
| `lost HP` | HP đã mất |
| `can critically hit` | có thể bạo kích (hoặc có thể gây chí mạng) |
| `New Effect:` (Euphoria) | Hiệu ứng mới: |
| `[X] is enhanced:` / `[X] is adjusted:` | [X] được cường hóa: / [X] được điều chỉnh: |
| `100% of the base Reality DMG` | 100% lượng Reality DMG cơ bản |

---

## 4. FEW-SHOT EXAMPLES (MẪU ĐỐI CHIẾU CHUẨN)

### Example 1: Skill & Counter Formula
- **Input:** `Mass counter. Grants a [Shield] with (J's ATK x150%) to all allies for 2 rounds, with each [Burn] stack on self additionally increasing the Shield multiplier by 3%. After a shielded ally is attacked, J Ripostes with [Tempering].`
- **Output:** `Counter diện rộng. Cấp cho toàn bộ phe ta một [Shield] có giá trị bằng (ATK của J ×150%), duy trì 2 round; mỗi cộng dồn [Burn] trên bản thân giúp hệ số Shield tăng thêm 3%. Sau khi đồng minh có Shield bị tấn công, J sẽ phát động Riposte bằng [Tempering].`

### Example 2: Inheritance (Passive)
- **Input:** `When entering battle, if there are 3 or more [Lingering Glow] allies, his Ultimate does not consume AP. When a [Lingering Glow] ally attacks and breaks the target's Afflatus Guard, gains 100 [Lingering Glow] (triggers at most once per round).`
- **Output:** `Khi vào trận, nếu phe ta có ít nhất 3 nhân vật thuộc [Lingering Glow], Ultimate của bản thân không tiêu hao AP. Sau khi đồng minh thuộc [Lingering Glow] tấn công và phá vỡ Afflatus Guard của mục tiêu, nhận 100 [Lingering Glow] (mỗi round tối đa kích hoạt 1 lần).`

### Example 3: Portray & Euphoria Upgrades
- **Input:** 
  - `Lv4 [A Flash of Wildfire]: At rank 1/2/3, the Mental DMG dealt is increased to 240/360/600%.`
  - `Rank 2 [At Your Service] New Effect: Gains an additional Moxie +2 when entering battle. Ultimate does not take up the allied Incantation Draw Limit.`
- **Output:** 
  - `Lv4 [A Flash of Wildfire]: Ở Incantation hạng 1/2/3, sát thương Mental DMG tăng thành 240%/360%/600%.`
  - `Rank 2 [At Your Service] Hiệu ứng mới: Khi vào trận, nhận thêm Moxie +2. Ultimate không chiếm Giới hạn rút Incantation của phe ta.`

### Example 4: Psychube
- **Input:** `1-5★: At the end of the round, if holding at least 120 points of [Lingering Glow], grants all allies Critical DMG +6%/7.5%/9%/10.5%/12% for 2 rounds. When an ally attacks with a Rewritten Incantation, grants all allies DMG Dealt +2%/2.5%/3%/3.5%/4% for 3 rounds, stacking up to 3 times.`
- **Output:** `1-5★: Khi kết thúc round, nếu đang sở hữu ít nhất 120 điểm [Lingering Glow], giúp toàn bộ phe ta nhận Critical DMG +6%/7.5%/9%/10.5%/12%, duy trì 2 round. Khi đồng minh tấn công bằng một Incantation đã được Rewrite, giúp toàn bộ phe ta nhận DMG Dealt +2%/2.5%/3%/3.5%/4%, duy trì 3 round, cộng dồn tối đa 3 lần.`

---

## 5. OUTPUT INSTRUCTIONS FOR AI AGENT
- Preserve the exact JSON/data structure or Markdown hierarchy of the source file.
- Translate ONLY the description values; do not alter keys, IDs, or numerical arrays.
- Output the translated content directly without meta-commentary or explanations.