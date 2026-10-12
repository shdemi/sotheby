# Sotheby's Mansion (CharacterBox) - R1999 Roster Tracker

Tài liệu hướng dẫn kỹ thuật dành cho AI và lập trình viên tiếp tục phát triển dự án.

> ⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG:**
> - Tuyệt đối **KHÔNG ĐƯỢC ĐỌC**, quét hay can thiệp vào 2 thư mục:
>   - `Reverse-1999-CN-Asset/` (Thư mục tài nguyên lớn, không đọc)
>   - `references/` (Thư mục tài liệu tham khảo riêng)
> - Đảm bảo mọi công cụ quét/tìm kiếm không duyệt vào 2 thư mục trên để tránh tràn bộ nhớ/context.

---

## 1. Tổng quan dự án

- **Tên dự án:** Sotheby's Mansion (Suitcase Showcase & Roster Tracker cho game *Reverse: 1999*).
- **Mục đích:** Web app tĩnh (Pure Vanilla JS, HTML5, CSS3) cho phép người chơi quản lý nhân vật (Arcanists), tùy biến tier-list / danh mục hiển thị (Resonance, Insight, Euphoria, Level, Portrait, Skin...), filter, và xuất ảnh PNG độ phân giải cao hoặc backup dữ liệu JSON.
- **Kiến trúc:** 
  - Không dùng frontend framework phức tạp (No React/Vue/Svelte, No bundler như Vite/Webpack).
  - Thuần `index.html`, `styles.css`, `app.js`.
  - Dữ liệu tĩnh lưu tại thư mục `data/`.
  - Hình ảnh icon nhân vật/skin lưu tại thư mục `images/`.

---

## 2. Cấu trúc thư mục

```text
characterBox/
├── .gitignore
├── CNAME                         # Tên miền tùy chỉnh (nếu deploy qua GitHub Pages)
├── index.html                    # Giao diện chính, modal và controls
├── styles.css                    # Toàn bộ CSS (responsive, theme, layout board/cards)
├── app.js                        # Toàn bộ logic ứng dụng
├── data/                         # Dữ liệu JSON của game
│   ├── ArcanistMap.json          # Metadata chi tiết từng nhân vật (id, tên, skin, voice,...)
│   ├── characters_by_afflatus.json # Phân loại nhân vật theo hệ (Beast, Plant, Star, Mineral, Spirit, Intellect)
│   ├── characters_by_rarity.json   # Phân loại theo độ hiếm (6★ -> 2★)
│   ├── euphoria_list.json        # Danh sách nhân vật có tính năng Euphoria & tên hiệu ứng
│   ├── exclude_character.json    # Danh sách nhân vật ẩn / bị loại trừ khỏi ứng dụng
│   └── future_sight.json         # Danh sách nhân vật, Euphoria, Skin sắp ra mắt (bản CN/Future)
└── images/                       # Thư mục hình ảnh, web icon, avatar nhỏ...
```

---

## 3. Kiến trúc dữ liệu & State (`app.js`)

### 3.1. LocalStorage Keys chính
- `r1999_character_roster_v2`: Lưu trạng thái sở hữu và build của từng nhân vật trong roster của user.
  - Cấu trúc: `{ [charName]: { owned: boolean, insight: number, level: number, resonance: number, portrait: number, e1: boolean, e2: boolean, skinId?: number } }`
- `r1999_board_title_v1`: Tiêu đề hiển thị trên showcase board (mặc định "Suitcase").
- `r1999_tier_listing_v1`: Cấu hình danh sách các hàng Tier (Resonance, Insight, hoặc điều kiện tùy chỉnh), màu sắc, rule groups.
- `r1999_future_sight_v1`: Cờ bật/tắt hiển thị nội dung Future Sight.
- `r1999_app_styling_v1` / `r1999_display_options_v1`: Các cài đặt về màu sắc, font chữ, kích thước avatar, hiển thị badge...

### 3.2. Cấu trúc dữ liệu tĩnh (`data/*.json`)
1. **`ArcanistMap.json`**: Map tên nhân vật và id ra các thông tin chi tiết (avatar `images/headicon_small/...`, danh sách skin id).
2. **`characters_by_rarity.json` & `characters_by_afflatus.json`**: Dùng để filter và xác định max insight/level/resonance theo sao.
3. **`euphoria_list.json`**: Xác định nhân vật nào có Euphoria cấp 1 và cấp 2.
4. **`future_sight.json`**:
   - `Character`: Danh sách tên nhân vật chưa ra mắt global.
   - `Euphoria`: Format `["Name: tier", ...]`.
   - `Skin`: Mảng số nguyên chứa skin ID tương lai.
5. **`exclude_character.json`**: Chứa mảng tên nhân vật bị bỏ qua hoàn toàn.

### 3.3. Quy tắc Game Reverse: 1999 được mã hóa trong code
- **Insight tối đa:**
  - 5★ & 6★: Tối đa Insight 3 (I3).
  - 4★ trở xuống: Tối đa Insight 2 (I2).
- **Level tối đa theo Insight:**
  - I0: Lv. 30
  - I1: Lv. 40
  - I2: Lv. 50
  - I3: Lv. 60
- **Resonance tối đa theo Insight:**
  - I0: R1
  - I1: R5
  - I2: R10
  - I3: R15 (cho 5★, 6★)
- **Portrait:** Từ P0 đến P5.
- **Euphoria:** Tối đa cấp 1 và cấp 2 (E1, E2) nếu nhân vật có hỗ trợ.

---

## 4. Các tính năng chính của ứng dụng

1. **Showcase Board & Dynamic Tiers:**
   - Hiển thị nhân vật chia theo từng dòng Tier (mặc định phân theo Resonance: R15, R11-14, R10, R1-9, Other, Unowned).
   - Cho phép người dùng chỉnh sửa rule, thêm/xóa tier, đổi màu nhãn, kéo thả hoặc sắp xếp.
2. **Character Card & Modal Edit:**
   - Click vào thẻ nhân vật mở modal chỉnh sửa: Sở hữu (Owned), Insight, Level, Resonance, Portrait, Euphoria, Skin selection.
   - Hỗ trợ đổi skin động thông qua avatar đã map.
3. **Quick Edit (Manage All):**
   - Modal danh sách dạng bảng giúp người dùng chỉnh sửa nhanh hàng loạt nhân vật mà không cần bấm từng thẻ.
4. **Bộ lọc & Tìm kiếm (Filters & Search):**
   - Tìm kiếm theo tên (có alias cho các nhân vật đặc biệt như `37`, `6`, `J`, `Avgust`, `Vila`,...).
   - Lọc theo Ownership (All, Owned, Unowned).
   - Lọc theo Rarity (✦6, ✦5, ✦4, ✦3, ✦2).
5. **Styling & Customization:**
   - Tùy chỉnh màu nền Showcase board, font chữ (`JetBrains Mono`, `Noto Serif TC`...), border, opacity...
6. **Import / Export:**
   - **Export PNG:** Sử dụng `html2canvas` để chụp vùng `#showcase-board` chất lượng cao, loại bỏ các nút điều khiển (`.no-export`).
   - **Export JSON / Import JSON:** Lưu trữ toàn bộ dữ liệu roster sang file json để sao lưu hoặc chuyển đổi thiết bị.
7. **Future Sight Toggle:**
   - Bật/tắt các nhân vật/skin/euphoria chỉ mới xuất hiện ở server Trung Quốc (CN).

---

## 5. Quy tắc phát triển & Lưu ý khi code tiếp

1. **Không thêm framework nặng:**
   - Giữ nguyên cấu trúc Vanilla JS. Không cài thêm npm dependencies phức tạp nếu không thực sự cần thiết.
2. **Tương thích dữ liệu cũ (Backward Compatibility):**
   - Khi chỉnh sửa schema state hoặc config tier trong LocalStorage, luôn có fallback hoặc migration để tránh làm hỏng dữ liệu người dùng đã lưu.
3. **Performance của DOM:**
   - Khi re-render roster hoặc filter, chú ý gom nhóm DOM updates hoặc dùng DocumentFragment để tránh giật lag khi render hàng trăm thẻ nhân vật.
4. **CSS & Responsive:**
   - Giữ nguyên class convention hiện tại trong `styles.css`.
   - Chú ý cả giao diện desktop lẫn mobile drawer (nút `btn-tools-toggle` mở menu công cụ phụ).
5. **Đường dẫn file:**
   - Môi trường Windows sử dụng dấu gạch chéo ngược `\` trong terminal, nhưng trong mã HTML/JS/CSS luôn dùng `/` (ví dụ `images/headicon_small/...`).
6. **Xử lý thư mục cấm:**
   - Luôn nhớ: **KHÔNG quét hoặc đọc** thư mục `Reverse-1999-CN-Asset` và `references`.
