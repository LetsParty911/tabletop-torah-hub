// Short Vorts — bite-sized insights ("Quick Insights for the Table") keyed by
// canonical parsha key (matching src/lib/parshiyos.ts English "Parshas X" form,
// without the "Parshas" prefix). Content is drawn from classical sources
// (Rashi, Midrash, Chazal) and paraphrased in a few sentences each.

export type Vort = {
  id: string;
  title: string;
  text: string;
  source: string;
};

export type ParshaVorts = {
  parshaKey: string;
  vorts: Vort[];
};

export const VORTS: ParshaVorts[] = [
  {
    parshaKey: "Devarim",
    vorts: [
      {
        id: "devarim-hints",
        title: "Rebuke in Hints",
        text: "Moshe opens by naming places — Tofel, Lavan, Chatzeiros — rather than sins. Rashi explains these are veiled references to the failures that happened there. Real rebuke is given so gently that only the one who needs it hears it.",
        source: "Rashi, Devarim 1:1",
      },
      {
        id: "devarim-eichah",
        title: "The Word That Became a Book",
        text: "\"Eichah esa levadi\" — how can I carry you alone? The same word opens Megillas Eichah. Leadership burnout and national mourning share a root: the moment people stop carrying each other.",
        source: "Devarim 1:12; Midrash Eichah Rabbah",
      },
      {
        id: "devarim-small-cases",
        title: "No Case Is Small",
        text: "Moshe instructs the judges to hear \"the small as the great.\" A dispute over a penny must be treated with the same seriousness as one over a fortune — because to the litigant, it is never small.",
        source: "Rashi, Devarim 1:17",
      },
    ],
  },
  {
    parshaKey: "Vaeschanan",
    vorts: [
      {
        id: "vaeschanan-515",
        title: "515 Prayers",
        text: "\"Vaeschanan\" has the numerical value 515 — the number of times Moshe prayed to enter the Land. He was told to stop before the 516th. Sometimes the answer is no; the prayers were still not wasted.",
        source: "Midrash Devarim Rabbah 11:10",
      },
      {
        id: "vaeschanan-heart",
        title: "On Your Heart, Not In It",
        text: "The Shema says the words should be \"on your heart\" — not in it. Words rest on the heart until a moment cracks it open, and then they fall in.",
        source: "Kotzker Rebbe on Devarim 6:6",
      },
      {
        id: "vaeschanan-nachamu",
        title: "Comfort, Doubled",
        text: "\"Nachamu nachamu ami\" — comfort is said twice. Chazal read it as comfort for the destruction and comfort for the exile that followed. Real consolation addresses both the wound and the long aftermath.",
        source: "Yeshayahu 40:1; Haftaras Nachamu",
      },
    ],
  },
  {
    parshaKey: "Eikev",
    vorts: [
      {
        id: "eikev-heel",
        title: "The Mitzvos Under Your Heel",
        text: "\"Eikev\" also means heel. Rashi hears a warning about the light mitzvos a person tramples underfoot — the small courtesies and habits nobody applauds. Those are the ones that hold up everything else.",
        source: "Rashi, Devarim 7:12",
      },
      {
        id: "eikev-bentching",
        title: "Grace After, Not Before",
        text: "\"You shall eat, be satisfied, and bless.\" The Torah's own commandment to bless is after eating — gratitude when the hunger is gone and the need has passed is the harder discipline.",
        source: "Devarim 8:10; Berachos 21a",
      },
      {
        id: "eikev-what-does-hashem-ask",
        title: "Only This",
        text: "\"What does Hashem ask of you? Only to fear Him.\" Chazal ask: only? For Moshe, awe was simple. The Gemara answers that for each person, everything is in their own hands — the ask is calibrated to who you are.",
        source: "Devarim 10:12; Berachos 33b",
      },
    ],
  },
  {
    parshaKey: "Re'eh",
    vorts: [
      {
        id: "reeh-singular",
        title: "See — In the Singular",
        text: "\"Re'eh\" is singular, \"lifneichem\" is plural. The blessing is placed before the whole nation, but the seeing is done one person at a time. Nobody chooses on your behalf.",
        source: "Devarim 11:26",
      },
      {
        id: "reeh-open-hand",
        title: "Open, and Open Again",
        text: "\"Pasoach tiftach\" — the verb is doubled. Give, and then give again to the same person if needed. Tzedakah is measured by the second time, not the first.",
        source: "Devarim 15:8; Sifrei",
      },
      {
        id: "reeh-joy",
        title: "Nobody Eats Alone",
        text: "The festival joy of \"v'samachta b'chagecha\" explicitly includes the Levi, the convert, the orphan and the widow. A simcha that doesn't have room at the table for them isn't yet the mitzvah.",
        source: "Devarim 16:11, 16:14",
      },
    ],
  },
  {
    parshaKey: "Shoftim",
    vorts: [
      {
        id: "shoftim-gates",
        title: "Judges at Your Gates",
        text: "\"Judges and officers you shall place at all your gates.\" Chassidic masters read the gates as the senses — eyes, ears, mouth. Set a guard at each one and most of the courtroom cases never happen.",
        source: "Devarim 16:18; Chassidic reading",
      },
      {
        id: "shoftim-tzedek",
        title: "Justice, Justice",
        text: "\"Tzedek tzedek tirdof\" — justice repeated. The means must be as just as the end. A righteous outcome reached by a crooked road is not what the Torah is asking for.",
        source: "Devarim 16:20; Rashi",
      },
      {
        id: "shoftim-tree",
        title: "Is a Tree a Person?",
        text: "In a siege you may not cut down fruit trees: \"is the tree of the field a man?\" The Torah protects what quietly feeds people even in the middle of war — and warns against destruction that serves no purpose.",
        source: "Devarim 20:19",
      },
    ],
  },
  {
    parshaKey: "Ki Seitzei",
    vorts: [
      {
        id: "kiseitzei-mother-bird",
        title: "The Same Reward",
        text: "Sending away the mother bird — a mitzvah costing nothing — carries the same stated reward as honoring parents: long life. The Torah deliberately hides which mitzvos are \"worth more.\"",
        source: "Devarim 22:7; Chullin 142a",
      },
      {
        id: "kiseitzei-parapet",
        title: "Build a Fence",
        text: "\"Make a parapet for your roof.\" Safety is a mitzvah, not merely common sense. Foreseeable harm you failed to prevent is counted as blood on your house.",
        source: "Devarim 22:8",
      },
      {
        id: "kiseitzei-weights",
        title: "Honest Weights",
        text: "The parsha ends with accurate weights and then Amalek. Rashi links them: dishonest business invites the enemy. Integrity in commerce is national defense.",
        source: "Rashi, Devarim 25:17",
      },
    ],
  },
  {
    parshaKey: "Ki Savo",
    vorts: [
      {
        id: "kisavo-first-fruits",
        title: "Carry the Basket Yourself",
        text: "Bikkurim required the farmer to bring the first fruits personally and say the words aloud. Gratitude delegated to someone else stops being gratitude.",
        source: "Devarim 26:1-11",
      },
      {
        id: "kisavo-joy",
        title: "Because You Didn't Serve With Joy",
        text: "The tochachah's stated cause is not sin but serving \"without joy and gladness of heart.\" Doing the right thing bitterly is its own kind of failure.",
        source: "Devarim 28:47",
      },
      {
        id: "kisavo-today",
        title: "This Day",
        text: "\"Today Hashem commands you.\" Rashi: the mitzvos should feel brand new every day, as if given this morning. Familiarity is the quiet enemy of practice.",
        source: "Rashi, Devarim 26:16",
      },
    ],
  },
];

export function getVortsForParsha(parshaKey: string | null | undefined): Vort[] {
  if (!parshaKey) return [];
  const needle = parshaKey.replace(/^parshas\s+/i, "").trim().toLowerCase();
  const match = VORTS.find(
    (v) => v.parshaKey.toLowerCase() === needle,
  );
  return match?.vorts ?? [];
}
