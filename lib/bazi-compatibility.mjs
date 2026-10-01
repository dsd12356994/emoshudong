import lunar from "lunar-javascript";

const elements = ["木", "火", "土", "金", "水"];
const { LunarUtil } = lunar;

// A deliberately small, inspectable entertainment rule. This is not a
// traditional school's marriage verdict, a probability, or an AI prediction.
export function baziCompatibility(self, other) {
  if (!self || !other) return null;
  const full = [self, other].every((chart) => chart.pillars[3] !== "时辰未知");
  const pillarCount = full ? 4 : 3;
  const stems = [self, other].map((chart) => chart.pillars[2][0]);
  const dayElements = stems.map((stem) => LunarUtil.WU_XING_GAN[stem]);
  const delta = (elements.indexOf(dayElements[0]) - elements.indexOf(dayElements[1]) + 5) % 5;
  const sameElement = delta === 0;
  const generating = delta === 1 || delta === 4;
  const stemScore = sameElement ? 80 : generating ? 90 : 60;
  const stemRelation = sameElement ? "同属一个五行" : generating ? "五行相生" : "五行相克";
  const branches = [self, other].map((chart) => chart.pillars[2][1]);
  const branchIndex = LunarUtil.ZHI.indexOf(branches[0]) - 1;
  const combined = LunarUtil.HE_ZHI_6[branchIndex] === branches[1];
  const opposed = LunarUtil.CHONG[branchIndex] === branches[1];
  const sameBranch = branches[0] === branches[1];
  const branchScore = combined ? 90 : opposed ? 50 : sameBranch ? 80 : 70;
  const branchRelation = combined ? "六合" : opposed ? "六冲" : sameBranch ? "同支" : "不属于此规则中的六合或六冲";
  const distributions = [self, other].map((chart) => {
    const counts = Object.fromEntries(elements.map((element) => [element, 0]));
    for (const pillar of chart.pillars.slice(0, pillarCount)) {
      counts[LunarUtil.WU_XING_GAN[pillar[0]]] += 1;
      counts[LunarUtil.WU_XING_ZHI[pillar[1]]] += 1;
    }
    return counts;
  });
  // Complement means visible symbols supplied by one chart but absent in the
  // other. It deliberately does not infer 喜用神 or 旺衰 from symbol counts.
  const complements = elements.filter((element) =>
    (distributions[0][element] === 0) !== (distributions[1][element] === 0),
  );
  const complementScore = 60 + 6 * complements.length;
  const dimensions = [
    { label: "日干五行", score: stemScore, weight: 40, detail: `${stems[0]}${dayElements[0]}与${stems[1]}${dayElements[1]}：${stemRelation}` },
    { label: "日支关系", score: branchScore, weight: 35, detail: `${branches[0]}与${branches[1]}：${branchRelation}` },
    { label: "显性五行互补", score: complementScore, weight: 25, detail: complements.length ? `一方有而另一方未出现的符号：${complements.join("、")}` : "两人的显性五行种类相同，没有按本规则计入额外互补项" },
  ];
  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight / 100, 0));
  const stemReading = sameElement
    ? "同一种五行，可以当作寻找共同语言的写信意象：你们有没有一件都在意、却很少认真聊过的小事？相似的符号，并不代表相同的性格。"
    : generating
      ? "相生可以读作彼此滋养的意象。比起猜谁更适合谁，不妨留意：一段交流结束后，你们是否都觉得被听见、也更有力量？"
      : "相克在这里只是两种符号的关系，可以借它思考差异与边界，并不是“不合适”的判决。真正要看的是，意见不同时能不能尊重彼此，也允许对方说不。";
  const branchReading = combined
    ? "日支在此规则中为六合，可把它当作“靠近”的意象。现实里的靠近仍需要双方愿意，不用因为这一项分数高就替对方确认心意。"
    : opposed
      ? "日支在此规则中为六冲，可把它当作“节奏不同”的提醒，而不是分开的预言。可以试着聊聊各自需要多少陪伴、多少独处，让期待被说清楚。"
      : "日支这一项提供的是符号对照，并不能读出对方的想法。相处是否舒服，要回到实际的回应、共同经历，以及一次次被认真对待的感受。";
  return {
    score,
    label: "八字匹配度 · 娱乐指数",
    disclaimer: "本站自定义的符号匹配分，不是关系成功率，也不代表专业命理结论。",
    summary: `两张生辰笺的符号匹配指数为 ${score} / 100。日干为${stems[0]}${dayElements[0]}与${stems[1]}${dayElements[1]}，属于${stemRelation}。${stemReading}`,
    paragraphs: [branchReading, "这张笺的用处，是给你们一个慢慢了解彼此的话题。分数不会替你们决定关系，愿意沟通、守住边界、兑现小小的承诺，才是可以亲手做的事。"],
    dimensions,
    coverage: full
      ? "双方时辰已填，显性五行按四柱统计；北京时间、午夜换日，未校正真太阳时。"
      : "至少一方未填时辰：双方均只用前三柱统计显性五行，不补造时柱。节气交接日的年月柱仍可能不确定。",
    method: "自定义规则：总分＝日干五行×40%＋日支关系×35%＋显性五行互补×25%，四舍五入。日干同五行80、相生90、相克60；日支六合90、六冲50、同支80、其余70。互补项＝60＋6×一方有而另一方没有的五行种类数。只统计每柱天干与地支本气，不含藏干、旺衰、喜用神、刑害或大运；不能代替完整命理合盘。",
  };
}
