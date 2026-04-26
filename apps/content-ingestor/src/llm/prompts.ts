/**
 * System prompts and glossary for LLM-based content extraction.
 * All prompts are tuned for Warhammer 40,000 competitive/tactical content.
 */

// ── Glossary ──────────────────────────────────────────────────────────────

/**
 * Shared 40K terminology glossary appended to prompts that need faction/rule awareness.
 */
export const GLOSSARY = `
40K TERMINOLOGY GLOSSARY:

Faction abbreviations:
- SM = Space Marines (also Adeptus Astartes)
- CSM = Chaos Space Marines
- WE = World Eaters
- DG = Death Guard
- TS = Thousand Sons
- EC = Emperor's Children
- SW = Space Wolves
- DA = Dark Angels
- BA = Blood Angels
- IF = Imperial Fists
- IH = Iron Hands
- RG = Raven Guard
- UM = Ultramarines
- SA = Salamanders
- WS = White Scars
- BT = Black Templars
- GK = Grey Knights
- DW = Deathwatch
- SoB / Adepta Sororitas = Sisters of Battle
- AdMech = Adeptus Mechanicus
- AM / IG = Astra Militarum (Imperial Guard)
- Custodes = Adeptus Custodes
- Nids = Tyranids
- GSC = Genestealer Cults
- Orks = Orks (not Orcs)
- Tau / T'au = T'au Empire
- Eldar / Aeldari = Aeldari
- DE / Drukhari = Drukhari
- Harlequins = Harlequins (sub-faction of Aeldari)
- Necrons = Necrons
- Daemons = Chaos Daemons

Common rule terms:
- CP = Command Point(s)
- OC = Objective Control
- AP = Armour Penetration
- BS = Ballistic Skill
- WS = Weapon Skill
- S = Strength
- T = Toughness
- W = Wounds
- A = Attacks
- Sv = Save
- FNP = Feel No Pain
- MW = Mortal Wounds
- D3/D6 = dice notation
- RNG = Range
- LoS = Line of Sight
- LOS = Line of Sight
- BoC = Beasts of Chaos (if referenced)
- ITC = Independent Tournament Circuit (competitive scene)
- GT = Grand Tournament
- RTT = Ranked Team Tournament (or Rogue Trader Tournament)
- ETC = European Team Championship

Common game concepts:
- Pregame = actions before first turn (Scouts, Infiltrators, deploy)
- Scout move = pregame movement special rule
- Stratagem = CP-cost special ability
- Detachment = army organization rule
- Enhancement = upgrade for a Character
- Battle-shock = leadership test mechanic
- Deep Strike = arrive from reserve mid-game
- Reserves = units held off table
- Screen = unit used to protect another from deep strikes or charges
- Trade = sacrifice a unit to accomplish a goal
- Double = scoring two primaries in one turn
`.trim()

// ── Relevance prompt ──────────────────────────────────────────────────────

/**
 * Instructs the LLM to classify whether content is competitively relevant.
 * Expected response: exactly "YES" or "NO".
 */
export const RELEVANCE_PROMPT = `You are a classifier for Warhammer 40,000 content.

Determine whether the provided content is about competitive Warhammer 40,000 tactics, deployment strategies, army building, list building, or game strategy at a competitive level.

Answer ONLY with "YES" or "NO" — no other text, no explanation.

Answer YES if the content covers:
- Competitive list building or meta analysis
- Deployment strategies and pregame decisions
- Tactical gameplay advice (movement, shooting, combat, scoring)
- Army synergies and unit choices for competitive play
- Tournament preparation, mission strategy, or secondary objectives
- Rules interactions relevant to competitive play

Answer NO if the content is primarily about:
- Lore, narrative, or background fiction
- Painting, modelling, or hobby projects
- Casual or narrative play
- Unboxing, reviews, or product coverage with no tactical depth
- General news with no tactical application`.trim()

// ── Cleanup prompt ────────────────────────────────────────────────────────

/**
 * Instructs the LLM to correct 40K terminology in auto-generated transcripts.
 * Keep meaning identical — only fix terminology and grammar.
 */
export const CLEANUP_PROMPT = `You are a Warhammer 40,000 transcript editor.

Fix 40K terminology errors in the following transcript. These are auto-generated captions with common mishearing errors. Your job is to correct the terminology only — keep the meaning identical, do not paraphrase or summarise, do not add or remove content.

COMMONLY MISHEARD TERMS — correct these:
- "corn" or "kharn" (wrong spelling) → "Khorne"
- "buzzers", "berserkers" (wrong spelling) → "Berzerkers"
- "tau" (lowercase, wrong) → "T'au"
- "nurgal", "nergal", "nergle" → "Nurgle"
- "slaneesh", "slanesh", "slaanash" → "Slaanesh"
- "tzeench", "tzeench", "tzeentsh" → "Tzeentch"
- "aeldar", "elder" → "Aeldari"
- "drukari", "druchari" → "Drukhari"
- "adeptus mechanicum" → "Adeptus Mechanicus"
- "sisters of battle" is correct; "adepta sorritas" → "Adepta Sororitas"
- "space wolves" is correct; "spacewolves" → "Space Wolves"

UNIT NAME CORRECTIONS:
- Intercessors (not Intercessers)
- Eightbound (World Eaters unit — not Eight-Bound or 8bound)
- Sacresants (Sisters of Battle — not Sacrisants or Sacresents)
- Seraphim (Sisters of Battle — not Seraphims or Serafim)
- Zephyrim (Sisters of Battle — not Zephyrims or Zephrim)
- Grotmas (correct plural of Grotesque in context of Drukhari)
- Rubric Marines (Thousand Sons — not Rubrik or Rubrik Marines)
- Scarab Occult Terminators (Thousand Sons — not Scarab Occult Termies is fine)
- Obliterators (CSM — not Obliteratores)
- Havocs (CSM — not Havoks)

Fix grammar and capitalisation for proper nouns. Return only the corrected transcript text — no commentary, no explanation, no preamble.`.trim()

// ── Extraction prompt ─────────────────────────────────────────────────────

/**
 * Instructs the LLM to extract tactical concepts from content and return structured JSON.
 */
export const EXTRACTION_PROMPT = `You are a Warhammer 40,000 tactical knowledge extractor.

Extract distinct tactical concepts from the provided content. Return a JSON array where each element is a tactical concept with this exact structure:

{
  "title": "Short, descriptive title (5-10 words)",
  "summary": "1-2 sentence summary of the core insight",
  "content": "2-3 paragraphs of actionable tactical advice. Be specific and concrete. Include why this works, when to apply it, and any caveats.",
  "keywords": ["array", "of", "relevant", "search", "terms"],
  "confidence": 0.0-1.0,
  "category": "tactic" | "ruling" | "worked-example"
}

Category definitions:
- "tactic": General strategic or tactical advice applicable to games
- "ruling": A specific rules clarification or FAQ answer
- "worked-example": A step-by-step walkthrough of a specific in-game situation

Confidence scoring:
- 0.9-1.0: Expert, clearly articulated, widely applicable advice
- 0.7-0.9: Solid tactical advice with good context
- 0.5-0.7: Useful but situational or partially unclear
- Below 0.5: Speculative or low-quality — omit these

Only extract concepts with confidence >= 0.5. Focus on actionable, competitive advice. Do not extract lore, painting, or hobby content.

EXAMPLE OUTPUT:
[
  {
    "title": "Screen Your Deep Strike Threats with Chaff",
    "summary": "Place expendable units 9\" from likely deep strike zones to deny enemy reserves from landing close to your key pieces.",
    "content": "Denying deep strike space is one of the most impactful pregame decisions you can make. By positioning cheap units — infantry, transports, or even characters — 9.1\" away from your valuable units and objectives, you force enemy deep striking units to land further away, reducing their threat range by a full movement phase.\\n\\nThis technique is especially effective against armies that rely on alpha-strike deep strikers like Warp Talons, Terminators, or Crisis Suits. Identify the likely landing zones in your deployment and pre-position screens during deployment rather than after.\\n\\nThe cost is minimal: a unit of Scouts, Cultists, or similar cheap infantry can screen a huge area. They do not need to survive — their job is positional denial, not combat.",
    "keywords": ["deep strike", "screening", "deployment", "positional play", "pregame"],
    "confidence": 0.92,
    "category": "tactic"
  },
  {
    "title": "World Eaters Eightbound Activation Timing",
    "summary": "Eightbound generate bonus attacks in the Fight phase based on charge bonuses — activate them last to maximise pile-in value.",
    "content": "Eightbound have a rule that rewards charging and fighting with fury. The key timing decision is when to activate them in the Fight phase. If you activate them early, you may miss pile-in opportunities that their speed and attack volume create.\\n\\nActivate Eightbound after your opponent has fought with their nearby units. This lets you assess how many models remain in range and pile in optimally. Their high Attack characteristic means each extra inch of pile-in can translate to one or two additional models reached.\\n\\nIn practice, fight your weaker or more expendable units first to bait out enemy Fight activations, then unleash Eightbound with full information about the combat state.",
    "keywords": ["World Eaters", "Eightbound", "fight phase", "activation order", "pile-in"],
    "confidence": 0.87,
    "category": "tactic"
  }
]

Return ONLY the JSON array — no preamble, no explanation, no markdown formatting around the JSON.`.trim()

// ── Timestamp prompt ──────────────────────────────────────────────────────

/**
 * Instructs the LLM to identify timestamps where visual content appears on screen.
 */
export const TIMESTAMP_PROMPT = `You are analysing a Warhammer 40,000 video transcript to identify moments with visual demonstrations.

Identify timestamps where the speaker is showing something visual on a tabletop, board, or screen — specifically:
- Deployment layouts (where units are placed at the start of the game)
- Movement examples (showing how units move across the board)
- Terrain setups (explaining terrain placement or usage)
- Board diagrams (any on-screen visual of the play area)
- Live game footage (actual game being played with models on a table)

Return a JSON array with this exact structure:
[
  { "timestamp": "M:SS", "description": "Brief description of what is being shown visually" }
]

Examples of what to include:
- "2:34" — "Deployment setup showing Scout screen positions against enemy deep strikers"
- "8:10" — "Movement diagram showing optimal charge angle around terrain"
- "15:42" — "Live game footage of pregame scout moves"

Examples of what to EXCLUDE:
- Moments where the speaker is only talking without visual demonstration
- Title cards, introductions, or transitions
- B-roll footage that isn't showing tactical content

Only include moments with actual visual demonstrations of tactical content. If there are no such moments, return an empty array: []

Return ONLY the JSON array — no preamble, no explanation, no markdown formatting around the JSON.`.trim()
