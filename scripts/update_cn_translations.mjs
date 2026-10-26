import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const skillsPath = path.join(ROOT, "data", "character_skills.json");
const glossaryPath = path.join(ROOT, "data", "skill_glossary.json");

const characterSkills = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8"));

// 1. Restore clean official APPLe if available
const appleCleanPath = path.join(ROOT, "ignore", "APPLe_clean.json");
if (fs.existsSync(appleCleanPath)) {
  const appleClean = JSON.parse(fs.readFileSync(appleCleanPath, "utf8"));
  characterSkills["APPLe"] = appleClean;
  console.log("Restored official APPLe data (ID 3028).");
}

// 2. Drake
if (characterSkills["Drake"]) {
  const d = characterSkills["Drake"];
  // Skill 1
  d.skills[0].nameEn = "Fleeting Wildfire";
  d.skills[0].ranks["1"].descEn = "1-target attack. Deals 200% Mental DMG. When hit, inflicts 8 stacks of [Burn] on the target and inflicts [Viper's Flame] on the target for 3 rounds.";
  d.skills[0].ranks["1"].artEn = "Phantoms of the past.";
  d.skills[0].ranks["2"].descEn = "1-target attack. Deals 300% Mental DMG. When hit, inflicts 10 stacks of [Burn] on the target and inflicts [Viper's Flame] on the target for 3 rounds.";
  d.skills[0].ranks["2"].artEn = "Phantoms of the past, lies of the present.";
  d.skills[0].ranks["3"].descEn = "1-target attack. Deals 500% Mental DMG. When hit, inflicts 12 stacks of [Burn] on the target and inflicts [Viper's Flame] on the target for 3 rounds.";
  d.skills[0].ranks["3"].artEn = "Phantoms of the past, lies of the present—severed one by one.";

  // Skill 2
  d.skills[1].nameEn = "Toward Truth";
  d.skills[1].ranks["1"].descEn = "Mass buff. Grants [True Will] to all allies for 2 rounds, and inflicts 12 stacks of [Burn] on self.";
  d.skills[1].ranks["1"].artEn = "First, critique.";
  d.skills[1].ranks["2"].descEn = "Mass buff. Grants [True Will] to all allies for 2 rounds, and inflicts 14 stacks of [Burn] on self.";
  d.skills[1].ranks["2"].artEn = "Critique, then rebel.";
  d.skills[1].ranks["3"].descEn = "Mass buff. Grants [True Will] to all allies for 2 rounds, and inflicts 16 stacks of [Burn] on self.";
  d.skills[1].ranks["3"].artEn = "Critique, rebel, and even betray oneself—yet never betray the truth.";

  // Skill 3 (Ult)
  d.skills[2].nameEn = "Where My Heart Goes";
  d.skills[2].descEn = "Self channel. Enters [Heart of Rebellion] status and gains +20 Progress.";
  d.skills[2].artEn = "The only thing he ever approves of is his refusal to approve of anything.";

  // Insights
  d.insights = [
    {
      insight: 0,
      nameEn: "Precognition",
      nameZh: "先觉",
      descEn: "When any enemy is inflicted with [Burn] or [Halo], accumulates [Lingering Glow].\nAt the end of the round, gains stacks of [Burn] equal to the stacks of [Burn] lost when settling the enemy with the highest [Burn] stacks. Drake is immune to [Burn] DMG, his [Burn] stacks are not deducted when settled, and his [Burn] cannot be removed when cleansing [Neg Status].\nAt the start of the round, if Drake is in [Way of Rebellion] status, gains 4 points of [Lingering Glow] for every stack of [Burn] he has, and clears all [Burn] stacks on self.",
      descZh: d.insights[0]?.descZh || ""
    },
    {
      insight: 1,
      nameEn: "Arsonist Viper",
      nameZh: "纵火的蝰蛇",
      descEn: "At the end of the round, if in [Heart of Rebellion] status, gains +20 Progress; if in [Way of Rebellion] status, casts [Uncaged Heartfire] 1 time.\nWhen an ally with [Lingering Glow] takes an active action, if in [Heart of Rebellion] status, gains +15 Progress; otherwise, Drake gains Moxie +1.",
      descZh: d.insights[1]?.descZh || ""
    },
    {
      insight: 2,
      nameEn: "Arsonist Viper II",
      nameZh: "纵火的蝰蛇Ⅱ",
      descEn: "DMG Dealt +8% when entering battle.",
      descZh: d.insights[2]?.descZh || ""
    },
    {
      insight: 3,
      nameEn: "Arsonist Viper III",
      nameZh: "纵火的蝰蛇Ⅲ",
      descEn: "When entering battle, if there are 3 or more [Lingering Glow] allies on the field, his Ultimate does not consume AP.\nDrake's max [Burn] stack limit is additionally increased by 5.\nWhen an ally with [Lingering Glow] breaks the target's Afflatus Guard after attacking, gains 100 points of [Lingering Glow] (triggers at most 1 time per round).",
      descZh: d.insights[3]?.descZh || ""
    }
  ];

  // Portrays
  d.portrays = [
    {
      level: 1,
      descEn: "[Where My Heart Goes] During [Way of Rebellion], the max [Lingering Glow] limit is additionally increased to 450, and the [Lingering Glow] required for Drake to cast [Uncaged Heartfire] 1 time is reduced to 150; [Arsonist Viper] Drake's max [Burn] stack limit is additionally increased by 30; when an ally with [Lingering Glow] breaks the target's Afflatus Guard after attacking, [Lingering Glow] gained is increased to 185.",
      descZh: d.portrays[0]?.descZh || ""
    },
    {
      level: 2,
      descEn: "[Toward Truth] [True Will]'s Critical DMG is increased to 60%, the DMG Dealt conversion rate is increased to 160%, and the upper limit is increased to 90%.",
      descZh: d.portrays[1]?.descZh || ""
    },
    {
      level: 3,
      descEn: "[Fleeting Wildfire] [Viper's Flame]'s DMG Taken Reduction is reduced by 25%; when attacked, the additional [Burn] inflicted on this attack is increased to 2, and the max [Burn] stack limit is additionally increased by 20.",
      descZh: d.portrays[2]?.descZh || ""
    },
    {
      level: 4,
      descEn: "[Fleeting Wildfire] At Incantation rank 1/2/3, Mental DMG dealt is increased to 240/360/600%; [Where My Heart Goes] [Uncaged Heartfire]'s Mental DMG is increased to 1000%, and for every stack of [Burn] the target has, this attack's Incantation Might is increased by 1.2%.",
      descZh: d.portrays[3]?.descZh || ""
    },
    {
      level: 5,
      descEn: "[Where My Heart Goes] During [Way of Rebellion], the max [Lingering Glow] limit is additionally increased to 750; at the start of the round, if Drake is in [Way of Rebellion] status, [Lingering Glow] gained for every stack of [Burn] Drake has is increased to 6; when an ally with [Lingering Glow] breaks the target's Afflatus Guard after attacking, [Lingering Glow] gained is increased to 325; for every 10 points of [Lingering Glow], [Uncaged Heartfire] deals an additional 35% Mental DMG.",
      descZh: d.portrays[4]?.descZh || ""
    }
  ];
  console.log("Updated Drake English skills.");
}

// 3. Hedone
if (characterSkills["Hedone"]) {
  const h = characterSkills["Hedone"];
  // Skill 1
  h.skills[0].nameEn = "Forged in Glory";
  h.skills[0].ranks["1"].descEn = "[Interval]\n1-target attack. Deals 500% Reality DMG. When possessing [Blazing Glory], this attack deals an additional 500% Reality DMG, and gives Mineral Resonance Energy +2.";
  h.skills[0].ranks["1"].artEn = "One must contend with gold in the blaze to obtain genuine victory.";
  h.skills[0].ranks["2"].descEn = "[Interval]\n1-target attack. Deals 500% Reality DMG. When possessing [Blazing Glory], this attack deals an additional 500% Reality DMG, and gives Mineral Resonance Energy +2.";
  h.skills[0].ranks["2"].artEn = "One must contend with gold in the blaze to obtain genuine victory.";
  h.skills[0].ranks["3"].descEn = "[Interval]\n1-target attack. Deals 500% Reality DMG. When possessing [Blazing Glory], this attack deals an additional 500% Reality DMG, and gives Mineral Resonance Energy +2.";
  h.skills[0].ranks["3"].artEn = "One must contend with gold in the blaze to obtain genuine victory.";

  // Skill 2
  h.skills[1].nameEn = "Whither the Golden Arrow";
  h.skills[1].ranks["1"].descEn = "[Interval]\nMass attack. Deals 350% Reality DMG to all enemies. After attacking, inflicts [Lava Scar] on the targets for 4 rounds.";
  h.skills[1].ranks["1"].artEn = "Piercing through oracles and fate, her arrowhead possesses ample pride.";
  h.skills[1].ranks["2"].descEn = "[Interval]\nMass attack. Deals 350% Reality DMG to all enemies. After attacking, inflicts [Lava Scar] on the targets for 4 rounds.";
  h.skills[1].ranks["2"].artEn = "Piercing through oracles and fate, her arrowhead possesses ample pride.";
  h.skills[1].ranks["3"].descEn = "[Interval]\nMass attack. Deals 350% Reality DMG to all enemies. After attacking, inflicts [Lava Scar] on the targets for 4 rounds.";
  h.skills[1].ranks["3"].artEn = "Piercing through oracles and fate, her arrowhead possesses ample pride.";

  // Skill 3 (Ult)
  h.skills[2].nameEn = "The Thirteenth Feat";
  h.skills[2].descEn = "[Flow: Whither the Golden Arrow]\nMass attack. Deals 800% Reality DMG to all enemies, and additionally deals [Static Genesis DMG] equal to 100% of [Aesthetic of Force] to the main target, and 50% [Static Genesis DMG] to other targets. When attacking, if [Kindle Anew] is not held in the spell area, generates 1 card of [Kindle Anew] in the spell area; otherwise, this attack deals an additional 800% Reality DMG. After attacking, gains 1 stack of [Conduit Calibration II] for self, and clears the recorded value of [Aesthetic of Force].";
  h.skills[2].artEn = "For the next celebration, the sun should rise once again.";

  // Insights
  h.insights = [
    {
      insight: 0,
      nameEn: "Precognition",
      nameZh: "先觉",
      descEn: "Does not obtain standard Incantations or Ultimates; activates [Conduits] using Resonance Energy to cast Incantations. Moxie is replaced by Tuning Points.\nWhen entering battle, generates 1 card of [Kindle Anew] in the spell area and gains [Aesthetic of Force].",
      descZh: h.insights[0]?.descZh || ""
    },
    {
      insight: 1,
      nameEn: "Pride of the Undefeated",
      nameZh: "常胜者的矜高",
      descEn: "When [Kindle Anew] smelts Resonance Energy, gains [Blazing Glory] for self for 3 rounds.\nThe [Kindle Anew] generated when entering battle starts with 2 accumulated Resonance Energy.",
      descZh: h.insights[1]?.descZh || ""
    },
    {
      insight: 2,
      nameEn: "Pride of the Undefeated II",
      nameZh: "常胜者的矜高Ⅱ",
      descEn: "DMG Dealt +8% when entering battle.",
      descZh: h.insights[2]?.descZh || ""
    },
    {
      insight: 3,
      nameEn: "Pride of the Undefeated III",
      nameZh: "常胜者的矜高Ⅲ",
      descEn: "When entering battle, Hedone gains +75 Tuning Points.\nWhen any ally activates a Conduit, for every 1 point of Energy consumed by that Conduit, Hedone gains +1 Tuning Point.",
      descZh: h.insights[3]?.descZh || ""
    }
  ];

  // Portrays
  h.portrays = [
    {
      level: 1,
      descEn: "At the end of each round, [Kindle Anew] smelts unused ordinary Resonance Energy in the spell area up to 3 cards, max accumulated smelted Energy is increased to 6, and max stored Energy is increased to 10; [Precognition] [Kindle Anew] generated on battle entry starts with initial recorded Resonance Energy increased to 4; Tuning Points gained on entry increased to 30; 1 card of [Mineral Resonance Energy I] in the deck grants Mineral Resonance Energy increased to 2.",
      descZh: h.portrays[0]?.descZh || ""
    },
    {
      level: 2,
      descEn: "[Precognition] When entering battle, Tuning Points gained is increased to 100; [Blazing Glory] Conduit Might is increased to 20%, and DMG Dealt cap is increased to 75%; 2 cards of [Mineral Resonance Energy I] in the deck grant Mineral Resonance Energy increased to 2.",
      descZh: h.portrays[1]?.descZh || ""
    },
    {
      level: 3,
      descEn: "Reality DMG dealt is increased to 800%; when possessing [Blazing Glory], Mineral Resonance Energy gained is increased to 3.",
      descZh: h.portrays[2]?.descZh || ""
    },
    {
      level: 4,
      descEn: "[The Thirteenth Feat] Reality DMG dealt is increased to 1200%; [Lava Scar] when attacked by a Conduit, DMG Dealt of this attack is increased to 16%.",
      descZh: h.portrays[3]?.descZh || ""
    },
    {
      level: 5,
      descEn: "For [Kindle Anew], each point of Resonance Energy smelted increases accumulated Energy of [Kindle Anew] to 2, max accumulated smelted Energy is increased to 8, and max stored Energy is increased to 12; [Precognition] [Kindle Anew] generated on battle entry starts with initial recorded Resonance Energy increased to 6; [Aesthetic of Force] records damage dealt by allies' Incantations increased to 18%, and when target has [Lava Scar], additional recorded value is increased to 18%; 2 cards of [Mineral Resonance Energy II] in the deck grant Mineral Resonance Energy increased to 3.",
      descZh: h.portrays[4]?.descZh || ""
    }
  ];
  console.log("Updated Hedone English skills.");
}

// 4. Narcissus
if (characterSkills["Narcissus"]) {
  const n = characterSkills["Narcissus"];
  // Skill 1
  n.skills[0].nameEn = "Fists and Webbed Paws";
  n.skills[0].ranks["1"].descEn = "1-target attack. Deals 200% Mental DMG and inflicts 2 stacks of [Wave Rhythm] on the target for 2 rounds.\nWhen actively used, inflicts 1 stack of [Passion Drain] on the target.";
  n.skills[0].ranks["1"].artEn = "Life doesn't just reside in the peaceful spring.";
  n.skills[0].ranks["2"].descEn = "1-target attack. Deals 300% Mental DMG and inflicts 3 stacks of [Wave Rhythm] on the target for 2 rounds.\nWhen actively used, inflicts 1 stack of [Passion Drain] on the target.";
  n.skills[0].ranks["2"].artEn = "Life doesn't just reside in the peaceful spring; she was the first to dive into the waves.";
  n.skills[0].ranks["3"].descEn = "1-target attack. Deals 500% Mental DMG and inflicts 5 stacks of [Wave Rhythm] on the target for 2 rounds.\nWhen actively used, inflicts 1 stack of [Passion Drain] on the target.";
  n.skills[0].ranks["3"].artEn = "Life doesn't just reside in the peaceful spring; she was the first to dive into the waves, just as the oracle proclaimed.";

  // Skill 2
  n.skills[1].nameEn = "Narcissus Cheerleaders";
  n.skills[1].ranks["1"].descEn = "Mass healing. Recovers (the caster's ATK x160%) HP for all allies, and additionally adds 20% of [Ripple] to this healing.\nIf in [Non-Alcoholic Drink] status, dispels 1 random type of [Neg Status] or [Stats Down] from all allies.";
  n.skills[1].ranks["1"].artEn = "The ripples were small.";
  n.skills[1].ranks["2"].descEn = "Mass healing. Recovers (the caster's ATK x200%) HP for all allies, and additionally adds 20% of [Ripple] to this healing.\nIf in [Non-Alcoholic Drink] status, dispels 1 random type of [Neg Status] or [Stats Down] from all allies.";
  n.skills[1].ranks["2"].artEn = "The ripples were small, but mirrored all of her.";
  n.skills[1].ranks["3"].descEn = "Mass healing. Recovers (the caster's ATK x360%) HP for all allies, and additionally adds 20% of [Ripple] to this healing.\nIf in [Non-Alcoholic Drink] status, dispels 1 random type of [Neg Status] or [Stats Down] from all allies.";
  n.skills[1].ranks["3"].artEn = "The ripples were small, but mirrored all of her, along with her small ambitions and the world.";

  // Skill 3 (Ult)
  n.skills[2].nameEn = "Fountain Nymph's Adventure";
  n.skills[2].descEn = "Self buff. Enters [Non-Alcoholic Drink] status for 3 rounds.";
  n.skills[2].artEn = "Before hitting the road, why not have a deep drink? It helps against scorching sun, dry land, and an overly vast ocean.";

  // Insights
  n.insights = [
    {
      insight: 0,
      nameEn: "Precognition",
      nameZh: "先觉",
      descEn: "After Narcissus heals any target, additionally grants [Ripple] equal to 20% of the healed amount to the target (the cap of [Ripple] is 150% of self ATK when entering battle).\nWhen allies holding [Ripple] cast an Ultimate attack, Critical Rate/Critical DMG +20%/+60%.",
      descZh: n.insights[0]?.descZh || ""
    },
    {
      insight: 1,
      nameEn: "Narcissus Inflorescence",
      nameZh: "水仙花序",
      descEn: "After any ally casts an Ultimate, Narcissus recovers HP equal to (Moxie consumed by that Ultimate x self ATK x20%) for all allies (if no Moxie is consumed, regarded as consuming 1 point; cannot critically strike).\nWhile Narcissus is in [Non-Alcoholic Drink] status, all allies are immune to [Control] up to 4 times per round. At the end of the allies' round, Narcissus gains 2 stacks of [Unsolved Oracle] for self and gains Moxie +1.",
      descZh: n.insights[1]?.descZh || ""
    },
    {
      insight: 2,
      nameEn: "Narcissus Inflorescence II",
      nameZh: "水仙花序Ⅱ",
      descEn: "Healing Done +10% when entering battle.",
      descZh: n.insights[2]?.descZh || ""
    },
    {
      insight: 3,
      nameEn: "Narcissus Inflorescence III",
      nameZh: "水仙花序Ⅲ",
      descEn: "When entering battle, Narcissus gains Moxie +4.\nWhile on the field, all allies' Ultimates do not count toward the Incantation limit, DMG Taken Reduction +30%, and all allies' overflowing Moxie is temporarily stored. At the end of the round, if that character has available Moxie capacity, it is replenished (each character can store at most 5 Moxie).",
      descZh: n.insights[3]?.descZh || ""
    }
  ];

  // Portrays
  n.portrays = [
    {
      level: 1,
      descEn: "[Fountain Nymph's Adventure] Duration of [Non-Alcoholic Drink] is increased to 4 rounds, base Ultimate Might is increased to 40%, and extra Ultimate Might is increased to 2% per point of Moxie; [Narcissus Inflorescence] Moxie gained upon entering battle is increased to 5.",
      descZh: n.portrays[0]?.descZh || ""
    },
    {
      level: 2,
      descEn: "[Precognition] When allies holding [Ripple] cast an Ultimate, Critical Rate/Critical DMG is increased to 30%/80%; after an ally casts an Ultimate, Narcissus's healing for all allies is increased to (Moxie consumed x self ATK x30%).",
      descZh: n.portrays[1]?.descZh || ""
    },
    {
      level: 3,
      descEn: "[Precognition] Ratio of [Ripple] added after healing is increased to 30% of healed amount, and [Ripple] cap is increased to 200% of self ATK on entry; when incoming damage is greater than or equal to current [Ripple], damage reduction effect is increased to 40%.",
      descZh: n.portrays[2]?.descZh || ""
    },
    {
      level: 4,
      descEn: "[Fists and Webbed Paws] [Wave Rhythm] For each point of Moxie consumed by Narcissus and her allies through Ultimates, Genesis DMG dealt is increased to (Narcissus's ATK x22.5% x stacks); [Narcissus Cheerleaders] At rank 1/2/3, healing coefficient is increased to 200%/250%/450%.",
      descZh: n.portrays[3]?.descZh || ""
    },
    {
      level: 5,
      descEn: "[Fountain Nymph's Adventure] [Non-Alcoholic Drink] Base Ultimate Might is increased to 50%, and extra Ultimate Might is increased to 2.5% per point of Moxie; [Precognition] When allies holding [Ripple] cast an Ultimate, Critical Rate/Critical DMG is increased to 40%/100%.",
      descZh: n.portrays[4]?.descZh || ""
    }
  ];
  console.log("Updated Narcissus English skills.");
}

// 5. Huntsworn Lilya
if (characterSkills["Huntsworn Lilya"]) {
  const l = characterSkills["Huntsworn Lilya"];
  // Skill 1
  l.skills[0].nameEn = "Terminal Dive";
  l.skills[0].ranks["1"].descEn = "1-target attack. Deals 200% Reality DMG. Triggers additional effects based on self Channel status (limit of 1 [Terminal Dive] per round):\nIf in [Roaring Engine] status, deals an additional 400% Reality DMG, and DMG Dealt +10% for this attack;\nIf in [Terminal Velocity] status, deals an additional 800% Reality DMG, and DMG Dealt +20% for this attack.";
  l.skills[0].ranks["1"].artEn = "Be bolder.";
  l.skills[0].ranks["2"].descEn = "1-target attack. Deals 400% Reality DMG. Triggers additional effects based on self Channel status (limit of 1 [Terminal Dive] per round):\nIf in [Roaring Engine] status, deals an additional 800% Reality DMG, and DMG Dealt +20% for this attack;\nIf in [Terminal Velocity] status, deals an additional 1600% Reality DMG, and DMG Dealt +40% for this attack.";
  l.skills[0].ranks["2"].artEn = "Be a little bolder, it's time to speed up.";
  l.skills[0].ranks["3"].descEn = "1-target attack. Deals 600% Reality DMG. Triggers additional effects based on self Channel status (limit of 1 [Terminal Dive] per round):\nIf in [Roaring Engine] status, deals an additional 1200% Reality DMG, and DMG Dealt +30% for this attack;\nIf in [Terminal Velocity] status, deals an additional 2400% Reality DMG, and DMG Dealt +60% for this attack.";
  l.skills[0].ranks["3"].artEn = "Be bolder, speed up, speed up! Break the record!";

  // Skill 2
  l.skills[1].nameEn = "Cobra Maneuver";
  l.skills[1].ranks["1"].descEn = "Self channel. Enters [Roaring Engine] status;\nIf already in [Roaring Engine], instead gains 1 stack of [Ammo Reload];\nIf in [Terminal Velocity], instead gains 2 stacks of [Ammo Reload].";
  l.skills[1].ranks["1"].artEn = "Hunter in the forest.";
  l.skills[1].ranks["2"].descEn = "Self channel. Enters [Roaring Engine] status;\nIf already in [Roaring Engine], instead gains 2 stacks of [Ammo Reload];\nIf in [Terminal Velocity], instead gains 4 stacks of [Ammo Reload].";
  l.skills[1].ranks["2"].artEn = "Hunter in the forest, stalker in the grass.";
  l.skills[1].ranks["3"].descEn = "Self channel. Enters [Roaring Engine] status;\nIf already in [Roaring Engine], instead gains 3 stacks of [Ammo Reload];\nIf in [Terminal Velocity], instead gains 6 stacks of [Ammo Reload].";
  l.skills[1].ranks["3"].artEn = "Hunter in the forest, stalker in the grass—who is the real victor?";

  // Skill 3 (Ult)
  l.skills[2].nameEn = "Try the Trump Card";
  l.skills[2].descEn = "Mass attack. Deals 900% Reality DMG to all enemies, and an additional 900% Reality DMG to the main target;\nConsumes 6 stacks of [Ammo Reload] to deal an additional 1800% Reality DMG on this attack, and grants Ultimate Might +100%, Critical DMG +100%, and Penetration Rate +20%;\nCasting an Ultimate while in [Terminal Velocity] status fills 4 [Cosmic Perception Points] (triggers at most 1 time per [Terminal Velocity]).";
  l.skills[2].artEn = "Now that it's come to this, here's a big present for you!";

  // Insights
  l.insights = [
    {
      insight: 0,
      nameEn: "Precognition",
      nameZh: "先觉",
      descEn: "When entering battle, gains [Perceptive Eye] and fills 4 [Cosmic Perception Points].",
      descZh: l.insights[0]?.descZh || ""
    },
    {
      insight: 1,
      nameEn: "Perpetual Engine",
      nameZh: "永动引擎",
      descEn: "During [Roaring Engine], after the first [Terminal Dive] attack each round, gains 1 stack of [Supercharge] for self;\nUpon entering [Terminal Velocity], gains Moxie +2; during [Terminal Velocity], generates 1 rank 3 [Prepped - Terminal Dive] at the start of each round.",
      descZh: l.insights[1]?.descZh || ""
    },
    {
      insight: 2,
      nameEn: "Perpetual Engine II",
      nameZh: "永动引擎Ⅱ",
      descEn: "DMG Dealt +8% when entering battle.",
      descZh: l.insights[2]?.descZh || ""
    },
    {
      insight: 3,
      nameEn: "Perpetual Engine III",
      nameZh: "永动引擎Ⅲ",
      descEn: "Upon using [Cobra Maneuver] for the first time after entering battle, grants 3 stacks of [Supercharge] and 6 stacks of [Ammo Reload] to self, and gains Moxie +1;\nEach time she acts during the [Weakness Penetration] phase, gains 1 stack of [Ammo Reload] for self.",
      descZh: l.insights[3]?.descZh || ""
    }
  ];

  // Portrays
  l.portrays = [
    {
      level: 1,
      descEn: "[Precognition] [Cosmic Perception Points] filled upon entering battle is increased to 6;\n[Precognition] Perception skill set [Destroy] enhancement:\n[Perception Incantation] Reality DMG dealt is increased to 1500%;\n[Perception Ability 1] Reality DMG dealt by every third enhanced attack is increased to 3200%;\n[Perception Ability 2] Finishing attack's Reality DMG dealt is increased to 5000%, and for every action taken by all allies, additional Reality DMG dealt is increased to 250%.",
      descZh: l.portrays[0]?.descZh || ""
    },
    {
      level: 2,
      descEn: "[Perpetual Engine] During [Roaring Engine], [Supercharge] gained after the first [Terminal Dive] each round is increased to 2 stacks; [Supercharge] gained upon first casting [Cobra Maneuver] is increased to 5 stacks;\n[Terminal Dive] At rank 1/2/3, Reality DMG dealt is increased to 300%/600%/900%;\nAdditional Reality DMG dealt during [Roaring Engine] is increased to 600%/1200%/1800%, and DMG Dealt is increased to 30%/40%/50%;\nAdditional Reality DMG dealt during [Terminal Velocity] is increased to 1200%/2400%/3600%, and DMG Dealt is increased to 60%/80%/100%.",
      descZh: l.portrays[1]?.descZh || ""
    },
    {
      level: 3,
      descEn: "[Try the Trump Card] Reality DMG dealt is increased to 1800%, and additional Reality DMG dealt to the main target is increased to 1800%;\nWhen consuming [Ammo Reload], additional Reality DMG dealt is increased to 3600%, Ultimate Might is increased to 180%, Critical DMG is increased to 180%, and Penetration Rate is increased to 50%.",
      descZh: l.portrays[2]?.descZh || ""
    },
    {
      level: 4,
      descEn: "[Cobra Maneuver] [Roaring Engine] Incantation Might is increased to 100%, [Terminal Velocity] Incantation Might is increased to 200%, [Supercharge] Incantation Might per stack is increased to 10%, and [Ammo Reload] Ultimate Might per stack is increased to 5%.",
      descZh: l.portrays[3]?.descZh || ""
    },
    {
      level: 5,
      descEn: "[Try the Trump Card] [Cosmic Perception Points] filled when cast during [Terminal Velocity] is increased to 5;\nPerception skill set [Destroy] enhancement:\n[Perception Incantation] Reality DMG dealt is increased to 2200%, and Critical DMG when attacking is increased to 80%;\n[Perception Ability 1] Reality DMG dealt by every third enhanced attack is increased to 4800%, and Critical DMG when attacking is increased to 100%;\n[Perception Ability 2] Finishing attack's Reality DMG dealt is increased to 7000%, additional Reality DMG dealt per ally action is increased to 350%, and Critical DMG when attacking is increased to 125%.",
      descZh: l.portrays[4]?.descZh || ""
    }
  ];
  console.log("Updated Huntsworn Lilya English skills.");
}

// 6. Glyndŵr
if (characterSkills["Glyndŵr"]) {
  const g = characterSkills["Glyndŵr"];
  // Skill 1
  g.skills[0].nameEn = "Shadowless Hunter";
  g.skills[0].ranks["1"].descEn = "Mass attack. Deals 160% Reality DMG to 2 enemies.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] performs 1 follow-up attack dealing 80% Reality DMG to the main target and 1 random enemy. This follow-up attack is regarded as 1 extra action.";
  g.skills[0].ranks["1"].artEn = "A cry of the hawk.";
  g.skills[0].ranks["2"].descEn = "Mass attack. Deals 240% Reality DMG to 2 enemies.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] performs 1 follow-up attack dealing 120% Reality DMG to the main target and 1 random enemy. This follow-up attack is regarded as 1 extra action.";
  g.skills[0].ranks["2"].artEn = "A cry of the hawk, and the prey's throat is already crushed.";
  g.skills[0].ranks["3"].descEn = "Mass attack. Deals 400% Reality DMG to 2 enemies.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] performs 1 follow-up attack dealing 200% Reality DMG to the main target and 1 random enemy. This follow-up attack is regarded as 1 extra action.";
  g.skills[0].ranks["3"].artEn = "A cry of the hawk, and the prey's throat is already crushed before the wind arrives.";

  // Skill 2
  g.skills[1].nameEn = "Annwn's Blessing";
  g.skills[1].ranks["1"].descEn = "Mass buff. Gives DMG Dealt +30% to all allies for 2 rounds.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] gives extra action DMG Dealt +15% to all allies for 2 rounds.";
  g.skills[1].ranks["1"].artEn = "The clan's ancestral blessing passed down through generations.";
  g.skills[1].ranks["2"].descEn = "Mass buff. Gives DMG Dealt +40% to all allies for 2 rounds.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] gives extra action DMG Dealt +20% to all allies for 2 rounds.";
  g.skills[1].ranks["2"].artEn = "The clan's ancestral blessing passed down through generations, unchanged since its feathers were tender.";
  g.skills[1].ranks["3"].descEn = "Mass buff. Gives DMG Dealt +50% to all allies for 2 rounds.\nIf [Warrior Dust Hawk] is on the field, [Warrior Dust Hawk] gives extra action DMG Dealt +25% to all allies for 2 rounds.";
  g.skills[1].ranks["3"].artEn = "The blessing passed down through generations, unchanged since its youth, will continue to be inherited.";

  // Skill 3 (Ult)
  g.skills[2].nameEn = "Fight for an Extra Meal";
  g.skills[2].descEn = "Self healing. Recovers (own ATK x50%) HP. If [Warrior Dust Hawk] is not on the field, summons [Warrior Dust Hawk]; otherwise, casts rank 1 [Annwn's Blessing] and [Shadowless Hunter] in succession (both regarded as 1 extra action).";
  g.skills[2].artEn = "Little warrior, this is just a trial before the legendary journey!";

  // Insights
  g.insights = [
    {
      insight: 1,
      nameEn: "Silent Hunt",
      nameZh: "无声狩猎",
      descEn: "Casting an Ultimate does not consume AP.\nWhen entering battle, self Moxie +3.",
      descZh: g.insights[0]?.descZh || ""
    },
    {
      insight: 2,
      nameEn: "Silent Hunt II",
      nameZh: "无声狩猎Ⅱ",
      descEn: "ATK +5% when entering battle.",
      descZh: g.insights[1]?.descZh || ""
    }
  ];

  // Portrays
  g.portrays = [
    {
      level: 1,
      descEn: "[Silent Hunt] Moxie gained when entering battle is increased to 5.",
      descZh: g.portrays[0]?.descZh || ""
    },
    {
      level: 2,
      descEn: "[Fight for an Extra Meal] When [Warrior Dust Hawk] is on the field, [Annwn's Blessing] and [Shadowless Hunter] cast in succession are increased to rank 2.",
      descZh: g.portrays[1]?.descZh || ""
    },
    {
      level: 3,
      descEn: "[Shadowless Hunter] Additional Reality DMG dealt when [Warrior Dust Hawk] is on the field is increased to 160%/240%/400%.",
      descZh: g.portrays[2]?.descZh || ""
    },
    {
      level: 4,
      descEn: "[Annwn's Blessing] When [Warrior Dust Hawk] is on the field, extra action DMG Dealt for all allies is increased to 30%/40%/50%.",
      descZh: g.portrays[3]?.descZh || ""
    },
    {
      level: 5,
      descEn: "[Fight for an Extra Meal] When [Warrior Dust Hawk] is on the field, [Annwn's Blessing] and [Shadowless Hunter] cast in succession are increased to rank 3.",
      descZh: g.portrays[4]?.descZh || ""
    }
  ];
  console.log("Updated Glyndŵr English skills.");
}

// 7. Save updated character_skills.json
fs.writeFileSync(skillsPath, JSON.stringify(characterSkills, null, 2) + "\n", "utf8");
console.log("Successfully saved data/character_skills.json.");

// 8. Add key glossary terms for popover tooltips
const newGlossaryEntries = {
  "viper's flame": {
    nameEn: "Viper's Flame",
    nameZh: "蝰蛇之火",
    descEn: "DMG Taken Reduction -15%. When attacked, inflicts 1 stack of [Burn] on the attacker and increases max [Burn] stack limit by 10 (undispellable).",
    descZh: "受创减免降低15%，受到攻击时使本次攻击额外附加1层【燃烧】，【燃烧】最大叠加层数额外提升10层（不可驱散）。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "true will": {
    nameEn: "True Will",
    nameZh: "真实意志",
    descEn: "Critical DMG +40%. Converts 120% of Critical Rate into DMG Dealt (up to 60%).",
    descZh: "暴击创伤提升40%，将暴击率的120%转化为创伤加成（至多提升60%）。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "heart of rebellion": {
    nameEn: "Heart of Rebellion",
    nameZh: "叛逆之心",
    descEn: "Channel status. At the end of the round, gains Progress +20. When Progress reaches 100, clears [Heart of Rebellion] and enters [Way of Rebellion] status.",
    descZh: "吟诵状态。回合结束时自身进度值+20。进度值达到100时，清除【叛逆之心】并进入【叛逆之行】状态。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "way of rebellion": {
    nameEn: "Way of Rebellion",
    nameZh: "叛逆之行",
    descEn: "Max [Lingering Glow] limit is set to 300. At the end of the round, consumes [Lingering Glow] to cast [Uncaged Heartfire] 1 time. Lasts 3 rounds or until [Lingering Glow] is depleted.",
    descZh: "【余辉】上限设为300。回合结束时消耗【余辉】释放1次【心火不可囚】。持续3回合或【余辉】耗尽后解除。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "uncaged heartfire": {
    nameEn: "Uncaged Heartfire",
    nameZh: "心火不可囚",
    descEn: "Mass attack. Deals 800% Mental DMG to all enemies. For every 10 points of [Lingering Glow], this attack deals an additional 25% Mental DMG.",
    descZh: "群体攻击，对敌方全体造成800%精神创伤；持有每10点【余辉】，本次攻击额外造成25%精神创伤。",
    tagEn: "Skill",
    tagZh: "神秘术"
  },
  "blazing glory": {
    nameEn: "Blazing Glory",
    nameZh: "赫赫之光",
    descEn: "Conduit Might +15%, DMG Dealt +15% (stackable up to 50%).",
    descZh: "术具威力提升15%，创伤加成提升15%（上限提升至50%）。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "lava scar": {
    nameEn: "Lava Scar",
    nameZh: "熔岩伤痕",
    descEn: "When attacked by a Conduit, increases DMG Dealt of this attack by 12%.",
    descZh: "受到术具攻击时，使本次攻击造成伤害提升12%。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "aesthetic of force": {
    nameEn: "Aesthetic of Force",
    nameZh: "力量美学",
    descEn: "Records 12% of damage dealt by allies' Incantations. When cast in [The Thirteenth Feat], deals Static Genesis DMG based on recorded value.",
    descZh: "记录己方角色咒语对敌方造成伤害的12%，在【第十三项壮举】中根据记录值造成稳态本源创伤。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "kindle anew": {
    nameEn: "Kindle Anew",
    nameZh: "复燃再燃",
    descEn: "Smelts unused ordinary Resonance Energy in the spell area at round end, accumulating Energy to empower Conduits.",
    descZh: "特殊咒语。每回合结束时熔炼咒语区未使用的交感能量，累积能量以强化术具。",
    tagEn: "Special",
    tagZh: "特殊术式"
  },
  "wave rhythm": {
    nameEn: "Wave Rhythm",
    nameZh: "海浪节奏",
    descEn: "For each point of Moxie consumed by Narcissus and her allies through Ultimates, deals Genesis DMG equal to (Narcissus's ATK x15% x stacks). Stackable.",
    descZh: "纳西索斯及友方每通过至终的仪式消耗1点激情，造成基于纳西索斯攻击*15%*层数的本源创伤（可叠加）。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "non-alcoholic drink": {
    nameEn: "Non-Alcoholic Drink",
    nameZh: "无酒精畅饮",
    descEn: "Ultimate Might +30% plus an additional 1.5% for each point of Moxie held by allies. Dispels 1 random type of [Neg Status] or [Stats Down] from all allies when casting healing Incantations.",
    descZh: "仪式威力提升30%，己方每持有1点激情额外提升1.5%；施放群体治疗咒语时驱散己方全体1种【状态异常】【属性削弱】。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "roaring engine": {
    nameEn: "Roaring Engine",
    nameZh: "雷鸣引擎",
    descEn: "Channel status. Incantation Might +50%. Enhances [Terminal Dive].",
    descZh: "自我吟诵状态。术法威力提升50%，强化【极限俯冲】。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "terminal velocity": {
    nameEn: "Terminal Velocity",
    nameZh: "极限速度",
    descEn: "Special status. Incantation Might +100%. Greatly enhances [Terminal Dive] and generates prepped Incantations.",
    descZh: "特殊状态。术法威力提升100%，极大强化【极限俯冲】并生成预备咒语。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "ammo reload": {
    nameEn: "Ammo Reload",
    nameZh: "弹药装填",
    descEn: "Consumes 6 stacks when casting Ultimate to deal an additional 1800% Reality DMG, Ultimate Might +100%, Critical DMG +100%, and Penetration Rate +20%.",
    descZh: "施放至终的仪式时消耗6层，使本次攻击额外造成1800%现实创伤，仪式威力提升100%，暴击创伤提升100%，穿透率提升20%。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "supercharge": {
    nameEn: "Supercharge",
    nameZh: "增压",
    descEn: "Incantation Might +6% per stack. Stackable.",
    descZh: "每层使术法威力提升6%（可叠加）。",
    tagEn: "Status",
    tagZh: "状态"
  },
  "cosmic perception points": {
    nameEn: "Cosmic Perception Points",
    nameZh: "星系洞知点",
    descEn: "Perception points consumed to trigger special perception skills and enhanced capabilities.",
    descZh: "洞知点数，用于发动洞知能力与强化攻击。",
    tagEn: "Special",
    tagZh: "特殊"
  },
  "warrior dust hawk": {
    nameEn: "Warrior Dust Hawk",
    nameZh: "勇士尘酿鹰",
    descEn: "Summon. While on the field, executes follow-up attacks coordinated with Glyndŵr's skills and enhances ally buff effects.",
    descZh: "召唤物。在场时协同发动追击攻击，并强化己方全体额外行动创伤加成。",
    tagEn: "Special",
    tagZh: "召唤物"
  }
};

for (const [key, val] of Object.entries(newGlossaryEntries)) {
  glossary[key] = val;
  // Also add Chinese key so both [English] and 【Chinese】 can open popover
  glossary[val.nameZh] = val;
  glossary[val.nameZh.toLowerCase()] = val;
}

fs.writeFileSync(glossaryPath, JSON.stringify(glossary, null, 2) + "\n", "utf8");
console.log(`Successfully updated data/skill_glossary.json with ${Object.keys(newGlossaryEntries).length} new mechanics.`);
