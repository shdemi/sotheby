#!/usr/bin/env python3
"""
Build the static JSON database used by the /simulator app.

Reads the locally cloned St-Pavlov-Foundation game tables and writes lightweight
JSON + icons into `_simulator_app/public/`.

Usage:
    python scripts/build_sim_db.py
    python scripts/build_sim_db.py --raw path/to/re1999-data-global/data
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = ROOT / "ignore" / "re1999-data-global-main" / "data"
OUT_DATA = ROOT / "_simulator_app" / "public" / "data"
OUT_ICONS = ROOT / "_simulator_app" / "public" / "icons"

AFFLATUS = {1: "Beast", 2: "Plant", 3: "Star", 4: "Mineral", 5: "Spirit", 6: "Intellect"}
DMG_TYPE = {1: "Reality", 2: "Mental"}

# character_attribute ids used by Euphoria nodes
EUPHO_ATTR = {
    601: ("flatHp", 1.0),
    602: ("flatAtk", 1.0),
    603: ("flatDef", 1.0),
    604: ("flatMdef", 1.0),
    605: ("hpPct", 0.001),
    606: ("atkPct", 0.001),
    607: ("defPct", 0.001),
    608: ("mdefPct", 0.001),
    201: ("critRate", 0.001),
    203: ("critDmg", 0.001),
    205: ("dmgBonus", 0.001),
    207: ("finalDmg", 0.001),
    211: ("ultimateMight", 0.001),
    212: ("healingBonus", 0.001),
    213: ("penetration", 0.001),
    214: ("incantationMight", 0.001),
    221: ("ultimateMight", 0.001),
    222: ("dmgBonus", 0.001),
    224: ("dmgBonus", 0.001),
}

# Per-mille stats from lua_talent_cube_attr.lua
CUBE_ATTR = {
    "hp": ("flatHp", 1.0),
    "atk": ("flatAtk", 1.0),
    "def": ("flatDef", 1.0),
    "mdef": ("flatMdef", 1.0),
    "cri": ("critRate", 0.001),
    "cri_dmg": ("critDmg", 0.001),
    "add_dmg": ("dmgBonus", 0.001),
    "drop_dmg": ("dmgReduction", 0.001),
    "heal": ("healingBonus", 0.001),
    "defenseIgnore": ("penetration", 0.001),
    "normalSkillRate": ("incantationMight", 0.001),
    "clutch": ("ultimateMight", 0.001),
}

# Psychube secondary stat table
EQUIP_ATTR = {
    "attack": ("atkPct", 0.001),
    "hp": ("hpPct", 0.001),
    "def": ("defPct", 0.001),
    "mdef": ("mdefPct", 0.001),
    "cri": ("critRate", 0.001),
    "criDmg": ("critDmg", 0.001),
    "addDmg": ("dmgBonus", 0.001),
    "dropDmg": ("dmgReduction", 0.001),
    "heal": ("healingBonus", 0.001),
    "defenseIgnore": ("penetration", 0.001),
    "normalSkillRate": ("incantationMight", 0.001),
    "clutch": ("ultimateMight", 0.001),
}

STAT_PATTERNS: list[tuple[str, str]] = [
    ("atkPct", r"ATK\s*\+(\d+(?:\.\d+)?)%"),
    ("hpPct", r"HP\s*\+(\d+(?:\.\d+)?)%"),
    ("defPct", r"(?:Reality\s+)?DEF\s*\+(\d+(?:\.\d+)?)%"),
    ("mdefPct", r"Mental\s+DEF\s*\+(\d+(?:\.\d+)?)%"),
    ("critRate", r"(?:Critical Rate|Crit Rate)\s*\+(\d+(?:\.\d+)?)%"),
    ("critDmg", r"(?:Critical DMG|Crit DMG)\s*\+(\d+(?:\.\d+)?)%"),
    ("dmgBonus", r"DMG Dealt[^+\n%]{0,30}\+(\d+(?:\.\d+)?)%"),
    ("dmgDealtDown", r"DMG Dealt[^-\n%]{0,30}-(\d+(?:\.\d+)?)%"),
    ("dmgReduction", r"DMG Taken[^-\n%]{0,30}-(\d+(?:\.\d+)?)%"),
    ("penetration", r"Penetration Rate[^+\n%]{0,30}\+(\d+(?:\.\d+)?)%"),
    ("incantationMight", r"Incantation Might[^+\n%]{0,40}\+(\d+(?:\.\d+)?)%"),
    ("ultimateMight", r"Ultimate Might[^+\n%]{0,40}\+(\d+(?:\.\d+)?)%"),
    ("genesisBonus", r"Genesis DMG\s*\+(\d+(?:\.\d+)?)%"),
    ("finalDmg", r"Final DMG\s*\+(\d+(?:\.\d+)?)%"),
    ("afflatusBonus", r"Afflatus(?: DMG)?\s*\+(\d+(?:\.\d+)?)%"),
    ("healingBonus", r"Healing Done\s*\+(\d+(?:\.\d+)?)%"),
]


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(value, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def clean_text(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"▩(\d+)%s", lambda m: f"Skill {m.group(1)}", text)
    text = re.sub(r"\{([^}]*)\}", r"\1", text)
    text = text.replace("\\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def parse_stats(text: str) -> dict[str, float]:
    stats: dict[str, float] = {}
    for key, pattern in STAT_PATTERNS:
        match = re.search(pattern, text, flags=re.I)
        if match:
            stats[key] = float(match.group(1)) / 100.0
    return stats


def parse_target(desc: str, effect: dict[str, Any] | None) -> tuple[str, int]:
    d = desc.lower()
    if "all enemies" in d:
        return "aoe", 99
    match = re.search(r"to (\d+) enem", d)
    if match:
        count = int(match.group(1))
        return ("multi", count) if count > 1 else ("single", 1)
    if "mass attack" in d:
        return "aoe", 99
    match = re.search(r"(\d+)-target", d)
    if match and int(match.group(1)) > 1:
        return "multi", int(match.group(1))
    target_limit = int((effect or {}).get("targetLimit") or 1)
    if target_limit > 1:
        return "multi", target_limit
    return "single", 1


def parse_scaling(desc: str) -> str:
    d = desc.lower()
    if "max hp" in d or "max health" in d:
        return "hp"
    if "reality def" in d and ("based on" in d or "equal to" in d):
        return "def"
    return "atk"


def parse_id_list(value: str) -> list[int]:
    ids: list[int] = []
    for part in (value or "").split("#"):
        part = part.strip()
        if part.isdigit() and int(part) > 0:
            ids.append(int(part))
    return ids


def parse_effect_pairs(value: str) -> Iterable[tuple[int, float]]:
    for chunk in (value or "").split("|"):
        if "#" not in chunk:
            continue
        left, right = chunk.split("#", 1)
        try:
            yield int(left), float(right)
        except ValueError:
            continue


def merge_stats(target: dict[str, float], extra: dict[str, float]) -> None:
    for key, value in extra.items():
        target[key] = target.get(key, 0.0) + value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    args = parser.parse_args()

    raw: Path = Path(args.raw)
    json_dir = raw / "json"
    lang_path = raw / "configs" / "language" / "language_en.json"
    if not json_dir.exists():
        raise SystemExit(
            f"Raw data not found at {raw}\n"
            "Clone St-Pavlov-Foundation/re1999-data-global into ignore/ or pass --raw."
        )

    print("==> Loading game tables")
    character = load_json(json_dir / "character.json")
    character_level = load_json(json_dir / "character_level.json")
    skill = load_json(json_dir / "skill.json")
    skill_effect = load_json(json_dir / "skill_effect.json")
    skill_ex = load_json(json_dir / "skill_ex_level.json")
    skill_passive = load_json(json_dir / "skill_passive_level.json")
    equip = load_json(json_dir / "equip.json")
    equip_strengthen = load_json(json_dir / "equip_strengthen.json")
    equip_skill = load_json(json_dir / "equip_skill.json")
    equip_break = load_json(json_dir / "equip_break_attr.json")
    character_talent = load_json(json_dir / "character_talent.json")
    talent_mould = load_json(json_dir / "talent_mould.json")
    talent_cube_attr = load_json(json_dir / "talent_cube_attr.json")
    talent_style = load_json(json_dir / "talent_style.json")
    character_destiny = load_json(json_dir / "character_destiny.json")
    destiny_facets = load_json(json_dir / "character_destiny_facets.json")
    destiny_slots = load_json(json_dir / "character_destiny_slots.json")

    lang: dict[str, str] = {}
    if lang_path.exists():
        for row in load_json(lang_path):
            if isinstance(row, dict) and "key" in row:
                lang[row["key"]] = row.get("content", "")
    else:
        print(f"  ! language file missing: {lang_path}")

    def tr(key: Any) -> str:
        if not isinstance(key, str):
            return ""
        return lang.get(key, "")

    skill_by_id = {row["id"]: row for row in skill}
    effect_by_id = {row["id"]: row for row in skill_effect}

    # ------------------------------------------------------------------
    # Skill lookup
    # ------------------------------------------------------------------
    def skill_info(skill_id: int, fallback_dmg_type: str) -> dict[str, Any] | None:
        row = skill_by_id.get(skill_id)
        if not row:
            return None
        effect = effect_by_id.get(row.get("skillEffect"))
        desc = clean_text(tr((effect or {}).get("desc")) or tr(row.get("desc_art")))
        name = clean_text(tr(row.get("name"))) or f"Skill {skill_id}"
        rate = float((effect or {}).get("damageRate") or 0) / 1000.0
        target_mode, target_count = parse_target(desc, effect)
        tags = list(dict.fromkeys(re.findall(r"\[([^\]]{2,40})\]", desc)))[:8]
        is_genesis = bool(re.search(r"genesis dmg|true dmg", desc, flags=re.I))
        dmg_type = fallback_dmg_type
        if re.search(r"mental dmg", desc, flags=re.I):
            dmg_type = "Mental"
        elif re.search(r"reality dmg", desc, flags=re.I):
            dmg_type = "Reality"
        return {
            "id": skill_id,
            "name": name,
            "desc": desc,
            "icon": row.get("icon") or skill_id,
            "multiplier": rate,
            "targetMode": target_mode,
            "targetCount": target_count,
            "scaling": parse_scaling(desc),
            "damageType": dmg_type,
            "isGenesis": is_genesis,
            "tags": tags,
            "rank": int(row.get("skillRank") or 0),
        }

    # ------------------------------------------------------------------
    # Characters
    # ------------------------------------------------------------------
    print("==> Building characters.json")
    levels_by_hero: dict[int, list[dict[str, Any]]] = {}
    for row in character_level:
        levels_by_hero.setdefault(int(row["heroId"]), []).append(row)
    for rows in levels_by_hero.values():
        rows.sort(key=lambda r: int(r["level"]))

    ex_by_hero: dict[int, list[dict[str, Any]]] = {}
    for row in skill_ex:
        ex_by_hero.setdefault(int(row["heroId"]), []).append(row)
    for rows in ex_by_hero.values():
        rows.sort(key=lambda r: int(r["skillLevel"]))

    passive_by_hero: dict[int, list[dict[str, Any]]] = {}
    for row in skill_passive:
        passive_by_hero.setdefault(int(row["heroId"]), []).append(row)
    for rows in passive_by_hero.values():
        rows.sort(key=lambda r: int(r["skillLevel"]))

    talent_by_hero: dict[int, list[dict[str, Any]]] = {}
    for row in character_talent:
        talent_by_hero.setdefault(int(row["heroId"]), []).append(row)
    for rows in talent_by_hero.values():
        rows.sort(key=lambda r: int(r["talentId"]))

    destiny_by_hero = {int(row["heroId"]): row for row in character_destiny}
    facets_by_id: dict[int, list[dict[str, Any]]] = {}
    for row in destiny_facets:
        facets_by_id.setdefault(int(row["facetsId"]), []).append(row)
    for rows in facets_by_id.values():
        rows.sort(key=lambda r: int(r["level"]))

    slots_by_id: dict[int, list[dict[str, Any]]] = {}
    for row in destiny_slots:
        slots_by_id.setdefault(int(row["slotsId"]), []).append(row)

    characters: list[dict[str, Any]] = []
    skill_index: dict[str, dict[str, Any]] = {}
    skills_by_hero: dict[str, Any] = {}
    euphoria_by_hero: dict[str, Any] = {}
    char_icons_copied = 0
    skill_icons: set[int] = set()

    def add_skill(skill_id: int, dmg_type: str) -> None:
        key = str(skill_id)
        if key not in skill_index:
            info = skill_info(skill_id, dmg_type)
            if info:
                skill_index[key] = info
                skill_icons.add(int(info["icon"]))

    for char in character:
        hero_id = int(char["id"])
        dmg_type = DMG_TYPE.get(int(char.get("dmgType") or 1), "Reality")
        afflatus = AFFLATUS.get(int(char.get("career") or 1), "Beast")
        name = (char.get("nameEng") or "").strip() or clean_text(tr(char.get("name"))) or f"Arcanist {hero_id}"
        rare_raw = int(char.get("rare") or 1)
        rarity = rare_raw + 1  # table stores 5 for 6-star

        rows = levels_by_hero.get(hero_id, [])
        stats = [
            {
                "level": int(r["level"]),
                "hp": float(r.get("hp") or 0),
                "atk": float(r.get("atk") or 0),
                "def": float(r.get("def") or 0),
                "mdef": float(r.get("mdef") or 0),
                # `technic` is Critical Technique; `cri` is a separate crit-rate bonus (normally 0).
                "cTech": float(r.get("technic") or 0),
                "critRate": float(r.get("cri") or 0) / 1000.0,
            }
            for r in rows
        ]

        # Parse the two incantation groups. The ultimate lives in exSkill.
        groups = (char.get("skill") or "").split("|")
        base_ranks: dict[str, list[int]] = {"skill1": [], "skill2": [], "ultimate": []}
        for index, group in enumerate(groups[:2]):
            ids = parse_id_list("#".join(group.split("#")[1:]))
            base_ranks["skill1" if index == 0 else "skill2"] = ids
        ult_id = int(char.get("exSkill") or 0)
        if ult_id:
            base_ranks["ultimate"] = [ult_id]

        for ids in base_ranks.values():
            for sid in ids:
                add_skill(sid, dmg_type)

        # Portray levels: apply the latest replacement at or below Pn.
        current = {key: list(value) for key, value in base_ranks.items()}
        portray_ranks: dict[str, dict[str, list[int]]] = {
            "0": {key: list(value) for key, value in current.items()}
        }
        portrays: list[dict[str, Any]] = []
        for row in ex_by_hero.get(hero_id, []):
            level = int(row["skillLevel"])
            g1 = parse_id_list(row.get("skillGroup1", ""))
            g2 = parse_id_list(row.get("skillGroup2", ""))
            ex_id = int(row.get("skillEx") or 0)
            if g1:
                current["skill1"] = g1
            if g2:
                current["skill2"] = g2
            if ex_id:
                current["ultimate"] = [ex_id]
            for ids in current.values():
                for sid in ids:
                    add_skill(sid, dmg_type)
            portray_ranks[str(level)] = {key: list(value) for key, value in current.items()}
            portrays.append(
                {
                    "level": level,
                    "desc": clean_text(tr(row.get("desc"))),
                    "skillGroup1": g1,
                    "skillGroup2": g2,
                    "skillEx": ex_id,
                    "passiveSkills": parse_id_list((row.get("passiveSkill") or "").replace("#", "|")),
                }
            )

        # Insights
        insights: list[dict[str, Any]] = []
        for row in passive_by_hero.get(hero_id, []):
            passive_id = int(row.get("skillPassive") or 0)
            passive_skill = skill_by_id.get(passive_id)
            passive_effect = effect_by_id.get((passive_skill or {}).get("skillEffect"))
            desc = clean_text(tr((passive_effect or {}).get("desc")) or tr((passive_skill or {}).get("desc_art")))
            insights.append(
                {
                    "level": int(row.get("skillLevel") or 0),
                    "name": clean_text(tr((passive_skill or {}).get("name"))),
                    "desc": desc,
                    "stats": parse_stats(desc),
                }
            )

        # Euphoria (destiny)
        destiny = destiny_by_hero.get(hero_id)
        euphoria: dict[str, Any] | None = None
        if destiny:
            track_ids = [int(x) for x in str(destiny.get("facetsId") or "").split("#") if x.isdigit()]
            tracks = []
            for track_id in track_ids:
                tracks.append(
                    {
                        "id": track_id,
                        "levels": [
                            {
                                "level": int(fr["level"]),
                                "desc": clean_text(tr(fr.get("desc"))),
                                "stats": parse_stats(clean_text(tr(fr.get("desc")))),
                            }
                            for fr in facets_by_id.get(track_id, [])
                        ],
                    }
                )
            slots_id = int(destiny.get("slotsId") or hero_id)
            slot_rows = slots_by_id.get(slots_id, [])
            stage_stats: dict[str, dict[str, float]] = {}
            cumulative: dict[str, float] = {}
            for stage in range(1, 5):
                for row in slot_rows:
                    if int(row.get("stage") or 0) != stage:
                        continue
                    for attr_id, value in parse_effect_pairs(row.get("effect", "")):
                        mapped = EUPHO_ATTR.get(attr_id)
                        if mapped:
                            key, scale = mapped
                            cumulative[key] = cumulative.get(key, 0.0) + value * scale
                stage_stats[str(stage)] = dict(cumulative)
            euphoria = {
                "slotsId": slots_id,
                "tracks": tracks,
                "stageStats": stage_stats,
            }
            if tracks or slot_rows:
                euphoria_by_hero[str(hero_id)] = euphoria

        # Resonance metadata
        talents = talent_by_hero.get(hero_id, [])
        talent_mould_id = int((talents[0] or {}).get("talentMould") or 1) if talents else 1
        exclusive = str((talents[0] or {}).get("exclusive") or "")
        main_core_id = int(exclusive.split("#")[0]) if exclusive.split("#")[0].isdigit() else 61

        # Copy bust icon
        skin_id = char.get("skinId") or f"{hero_id}01"
        source_icon = ROOT / "images" / "headicon_small" / f"{skin_id}.png"
        if source_icon.exists():
            target_icon = OUT_ICONS / "characters" / f"{hero_id}.png"
            target_icon.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_icon, target_icon)
            char_icons_copied += 1

        characters.append(
            {
                "id": hero_id,
                "name": name,
                "rarity": rarity,
                "afflatus": afflatus,
                "damageType": dmg_type,
                "skinId": skin_id,
                "talentMould": talent_mould_id,
                "mainCoreId": main_core_id,
                "hasEuphoria": euphoria is not None,
                "stats": stats,
                "baseRanks": base_ranks,
                "portrayRanks": portray_ranks,
                "portrays": portrays,
                "insights": insights,
            }
        )
        skills_by_hero[str(hero_id)] = {
            "baseRanks": base_ranks,
            "portrayRanks": portray_ranks,
            "portrays": portrays,
            "insights": insights,
        }

    characters.sort(key=lambda c: (-c["rarity"], c["name"].lower()))

    # ------------------------------------------------------------------
    # Psychubes
    # ------------------------------------------------------------------
    print("==> Building psychubes.json")
    strengthen_by_type = {int(row["strengthType"]): row for row in equip_strengthen}
    break_by_type: dict[int, list[dict[str, Any]]] = {}
    for row in equip_break:
        break_by_type.setdefault(int(row["id"]), []).append(row)
    for rows in break_by_type.values():
        rows.sort(key=lambda r: int(r["breakLevel"]))
    equip_skill_by_type: dict[int, list[dict[str, Any]]] = {}
    for row in equip_skill:
        equip_skill_by_type.setdefault(int(row["id"]), []).append(row)
    for rows in equip_skill_by_type.values():
        rows.sort(key=lambda r: int(r["skillLv"]))

    psychube_icon_map: dict[int, dict[str, Any]] = {}
    psychube_id_path = ROOT / "data" / "psychube_id.json"
    if psychube_id_path.exists():
        for rarity_key, rows in load_json(psychube_id_path).items():
            for row in rows:
                if "gameId" in row:
                    psychube_icon_map[int(row["gameId"])] = {
                        "rarity": rarity_key,
                        "iconId": row.get("id"),
                        "name": row.get("name"),
                    }

    psychubes: list[dict[str, Any]] = []
    psychube_icons_copied = 0
    for row in equip:
        if int(row.get("isExpEquip") or 0) == 1:
            continue
        if int(row.get("rare") or 0) < 3:
            continue
        equip_id = int(row["id"])
        strength_type = int(row.get("strengthType") or equip_id)
        strength = strengthen_by_type.get(strength_type, {})
        name = (row.get("name_en") or "").strip() or clean_text(tr(row.get("name"))) or f"Psychube {equip_id}"
        rarity = int(row.get("rare") or 1) + 1

        break_stats = []
        for br in break_by_type.get(strength_type, []):
            stats: dict[str, float] = {}
            for source_key, (target_key, scale) in EQUIP_ATTR.items():
                value = float(br.get(source_key) or 0)
                if value:
                    stats[target_key] = stats.get(target_key, 0.0) + value * scale
            break_stats.append({"breakLevel": int(br.get("breakLevel") or 0), "stats": stats})

        passives = []
        for ps in equip_skill_by_type.get(strength_type, []):
            desc = clean_text(tr(ps.get("baseDesc")))
            desc2 = clean_text(tr(ps.get("baseDesc2")))
            passives.append(
                {
                    "level": int(ps.get("skillLv") or 1),
                    "desc": desc,
                    "desc2": desc2,
                    "stats": parse_stats(desc),
                }
            )

        # Copy icon when the main site's psychube index knows this game id.
        icon_info = psychube_icon_map.get(equip_id)
        if icon_info and icon_info.get("iconId"):
            source = ROOT / "images" / "psychube_icon" / str(icon_info["rarity"]) / f"{icon_info['iconId']}.png"
            if source.exists():
                target = OUT_ICONS / "psychubes" / f"{equip_id}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
                psychube_icons_copied += 1

        psychubes.append(
            {
                "id": equip_id,
                "name": name,
                "rarity": rarity,
                "icon": equip_id,
                "maxStats": {
                    "hp": float(strength.get("hp") or 0),
                    "atk": float(strength.get("atk") or 0),
                    "def": float(strength.get("def") or 0),
                    "mdef": float(strength.get("mdef") or 0),
                },
                "breakStats": break_stats,
                "passives": passives,
            }
        )
    psychubes.sort(key=lambda p: (-p["rarity"], p["name"].lower()))

    # ------------------------------------------------------------------
    # Resonance
    # ------------------------------------------------------------------
    print("==> Building resonance.json")
    cube_attrs: dict[str, list[dict[str, Any]]] = {}
    for row in talent_cube_attr:
        cube_id = str(int(row["id"]))
        stats: dict[str, float] = {}
        for source_key, (target_key, scale) in CUBE_ATTR.items():
            value = float(row.get(source_key) or 0)
            if value:
                stats[target_key] = stats.get(target_key, 0.0) + value * scale
        cube_attrs.setdefault(cube_id, []).append({"level": int(row["level"]), "stats": stats})
    for rows in cube_attrs.values():
        rows.sort(key=lambda r: r["level"])

    moulds: dict[str, dict[str, int]] = {}
    for row in talent_mould:
        key = f"{int(row['talentMould'])}:{int(row['talentId'])}"
        counts: dict[str, int] = {}
        for cube_id in range(10, 21):
            raw_cell = str(row.get(f"type{cube_id}") or "")
            if not raw_cell:
                continue
            head = raw_cell.split("#")[0]
            if head.isdigit() and int(head) > 0:
                counts[str(cube_id)] = int(head)
        moulds[key] = counts

    styles: list[dict[str, Any]] = []
    for row in talent_style:
        replace = []
        for pair in str(row.get("replaceCube") or "").split("|"):
            if "#" in pair:
                left, right = pair.split("#", 1)
                if left.isdigit() and right.isdigit():
                    replace.append({"from": int(left), "to": int(right)})
        styles.append(
            {
                "talentMould": int(row.get("talentMould") or 1),
                "styleId": int(row.get("styleId") or 0),
                "level": int(row.get("level") or 0),
                "name": clean_text(tr(row.get("name"))) or ("Default" if int(row.get("styleId") or 0) == 0 else f"Modulation {row.get('styleId')}"),
                "replaceCube": replace,
            }
        )

    # ------------------------------------------------------------------
    # Icons: skills + afflatus + damage type
    # ------------------------------------------------------------------
    print("==> Copying skill and element icons")
    skill_icons_copied = 0
    for icon_id in skill_icons:
        source = ROOT / "images" / "skills" / f"{icon_id}.png"
        if source.exists():
            target = OUT_ICONS / "skills" / f"{icon_id}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            skill_icons_copied += 1
    for name in ["Beast", "Plant", "Star", "Mineral", "Spirit", "Intellect"]:
        source = ROOT / "images" / "afflatus_icon" / f"{name}.png"
        if source.exists():
            target = OUT_ICONS / "afflatus" / f"{name}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    for name in ["reality_dmg", "mental_dmg"]:
        source = ROOT / "images" / "dmg_type_icon" / f"{name}.png"
        if source.exists():
            target = OUT_ICONS / "damage" / f"{name}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

    # ------------------------------------------------------------------
    # Write outputs
    # ------------------------------------------------------------------
    print("==> Writing simulator data")
    write_json(OUT_DATA / "characters.json", characters)
    write_json(OUT_DATA / "skills.json", {"skillIndex": skill_index, "characters": skills_by_hero})
    write_json(OUT_DATA / "psychubes.json", psychubes)
    write_json(OUT_DATA / "resonance.json", {"cubeAttrs": cube_attrs, "moulds": moulds, "styles": styles})
    write_json(OUT_DATA / "euphoria.json", euphoria_by_hero)
    write_json(
        OUT_DATA / "manifest.json",
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "characters": len(characters),
            "psychubes": len(psychubes),
            "skills": len(skill_index),
            "characterIcons": char_icons_copied,
            "skillIcons": skill_icons_copied,
            "psychubeIcons": psychube_icons_copied,
            "source": str(raw.relative_to(ROOT)) if raw.is_relative_to(ROOT) else str(raw),
        },
    )

    print("\nDone.")
    print(f"  characters: {len(characters)}")
    print(f"  psychubes:  {len(psychubes)}")
    print(f"  skills:     {len(skill_index)}")
    print(f"  icons:      {char_icons_copied} characters, {skill_icons_copied} skills, {psychube_icons_copied} psychubes")


if __name__ == "__main__":
    main()
