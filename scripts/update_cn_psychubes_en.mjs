import fs from "fs";

const pData = JSON.parse(fs.readFileSync("data/psychubes_data.json", "utf8"));

// 1. 6:73 Flows in All Things Alike (灵知当齐一)
pData["6:73"].descEn = "Cave fire, starlight, waves carrying truth.\nFormulas written upon the shore, only to be smoothed away.\nA hypothesis concerning the sunlight,\nProven and re-proven in the dead of night.\nO tiny grain of sand, press forward;\nThe soles of your feet still remember the dawn.";

const amp73Vals = [
  { crit: 12, pursuit: 4 },
  { crit: 15, pursuit: 5 },
  { crit: 18, pursuit: 6 },
  { crit: 21, pursuit: 7 },
  { crit: 24, pursuit: 8 }
];
pData["6:73"].amplifications = amp73Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["6:73"].amplifications[i]?.descZh || "",
  descEn: `When entering battle, if the carrier is a [Star] character, Critical DMG +{${v.crit}%}.\nWhen the carrier attacks, if using an [Extra Action], grants all allies [Pursuit] DMG Bonus +{${v.pursuit}%} for 3 rounds, stacking up to 4 times.`
}));

// 2. 6:72 To Choose Against Fate (宿命之向背)
pData["6:72"].descEn = "Fate declared: You shall submit to me.\nTo which she responded only with a sneer.\nHow could fire heed the admonitions of thorns?\nI am the unquenchable blaze poured forth from a silver cup;\nEven briars shall snap to serve as firewood.\nThough ten thousand wounds be inflicted, my head shall never bow.";

const amp72Vals = [
  { dmg: 8, might: 2 },
  { dmg: 10, might: 2.5 },
  { dmg: 12, might: 3 },
  { dmg: 14, might: 3.5 },
  { dmg: 16, might: 4 }
];
pData["6:72"].amplifications = amp72Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["6:72"].amplifications[i]?.descZh || "",
  descEn: `When entering battle, if the carrier is a [Beast] character, DMG Dealt +{${v.dmg}%}.\nWhen the carrier attacks, if under the [Burn] status, grants Incantation Might +{${v.might}%} to all allies for 3 rounds, stacking up to 4 times.`
}));

// 3. 6:71 Atop the Tempest (立于风暴脊)
pData["6:71"].descEn = "Vodka fills the roaring engine,\nCarousing, thundering, charging ahead!\nWith every tear through the gale,\nA brazen declaration rings loud and clear.\nStraddling the insurmountable thunderstorm,\nLaughing as she trades blows with the hurricane.\nVictory? Ah, it lies tamed beneath my feet.";

const amp71Vals = [
  { dmg: 8, pursuit: 3 },
  { dmg: 12, pursuit: 3 },
  { dmg: 12, pursuit: 4.5 },
  { dmg: 16, pursuit: 4.5 },
  { dmg: 16, pursuit: 6 }
];
pData["6:71"].amplifications = amp71Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["6:71"].amplifications[i]?.descZh || "",
  descEn: `When entering battle, if the carrier is a [Star] character, DMG Dealt +{${v.dmg}%}.\nAfter any ally attacks, if casting a [Pursuit Incantation], grants the carrier [Pursuit] DMG Bonus +{${v.pursuit}%}, stacking until leaving the [Full Pursuit] phase.`
}));

// 4. 6:70 Tides Held Within (拢于心潮间)
pData["6:70"].descEn = "Treading upon rough grit, wading through cool shallows,\nSteps unceasing—running, ever running,\nUntil the voice within roars fiercer than the pounding surf.\nChasing a vision, grasping for the self,\nHer palm cupping the ripples of destiny, thumping, thumping,\nThe promised land lies right before her eyes.";

const amp70Vals = [
  { heal: 12, ult: 8 },
  { heal: 15, ult: 10 },
  { heal: 18, ult: 12 },
  { heal: 21, ult: 14 },
  { heal: 24, ult: 16 }
];
pData["6:70"].amplifications = amp70Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["6:70"].amplifications[i]?.descZh || "",
  descEn: `When entering battle, if the carrier is a [Beast] character, Healing Done +{${v.heal}%}.\nAfter the carrier casts an Ultimate, if the carrier holds a [Force Field], grants Ultimate Might +{${v.ult}%} to all allies for 3 rounds.`
}));

// 5. 6:69 Arrow of Verdict (宣告以弦鸣)
pData["6:69"].descEn = "An unyielding flame draws back upon both bowstring and heartstrings.\nThe memories within burn hotter than molten magma,\nFlowing through lifetimes of destiny to stain the dusk blood-red.\nThis hue proclaims,\nWhile the world waits in solemn silence—\nA sudden, vibrating hum, and thus shall my vow be fulfilled.";

const amp69Vals = [
  { dmg: 8, crit: 1.5 },
  { dmg: 10, crit: 1.8 },
  { dmg: 12, crit: 2.2 },
  { dmg: 14, crit: 2.6 },
  { dmg: 16, crit: 3 }
];
pData["6:69"].amplifications = amp69Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["6:69"].amplifications[i]?.descZh || "",
  descEn: `When entering battle, if the carrier is a [Conduit] character, DMG Dealt +{${v.dmg}%}.\nWhen all allies attack, if the carrier holds a [Force Field], grants Critical DMG +{${v.crit}%} to all allies, stacking up to 8 times.`
}));

// 6. 5:41 Joy of the Present (当下之喜)
pData["5:41"].descEn = "Yogurt, sugar, and the secret lies in a dash of lime.\nA burst of flavor dancing on the tongue, even more delightful than imagined.\nThe future, the past, the secret lies in a hint of flaw.\nBoth tartness and sweetness make up the recipe of love.";

const amp41Vals = [
  { halo: 0.6, glow: 8 },
  { halo: 0.8, glow: 8 },
  { halo: 0.8, glow: 13 },
  { halo: 1, glow: 13 },
  { halo: 1, glow: 18 }
];
pData["5:41"].amplifications = amp41Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["5:41"].amplifications[i]?.descZh || "",
  descEn: `When the carrier attacks, for each stack of [Halo] on the target, DMG Dealt +{${v.halo}%}.\nAt the start of the round, if [Lingering Glow] is at 120 or higher, grants Critical DMG +{${v.glow}%} to all allies for 1 round.`
}));

// 7. 5:40 Dressing Up the Truth (以饰真相)
pData["5:40"].descEn = "Burgeoning, fleeing, then vanishing behind the night's curtain—\nO cunning and elusive anecdote!\nAdorned by the limelight, upon the silver screen, before ten thousand gazes—\nLook, its truth shines just as brilliantly as its fame.";

const amp40Vals = [20, 25, 30, 35, 40];
pData["5:40"].amplifications = amp40Vals.map((v, i) => ({
  level: i + 1,
  descZh: pData["5:40"].amplifications[i]?.descZh || "",
  descEn: `When the carrier attacks, if the target's current HP is below 50%, DMG Dealt +{${v}%}. If the target's current HP is below 30%, DMG Dealt is additionally increased by +{${v}%}.`
}));

fs.writeFileSync("data/psychubes_data.json", JSON.stringify(pData, null, 2), "utf8");
console.log("Successfully updated English translations for all 7 psychubes in data/psychubes_data.json");
