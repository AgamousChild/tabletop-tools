-- Faction alias registry: single source of truth for all faction name → slug mappings.
-- Replaces 7 hardcoded maps across bcp-scraper, brain, content-ingestor, data-import.

CREATE TABLE IF NOT EXISTS dim_faction_alias (
  alias TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL REFERENCES dim_faction(id)
);

CREATE INDEX idx_dim_faction_alias_faction ON dim_faction_alias(faction_id);

-- Canonical names (same as dim_faction.name → dim_faction.id)
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Adepta Sororitas', 'adepta-sororitas'),
  ('Adeptus Custodes', 'adeptus-custodes'),
  ('Adeptus Mechanicus', 'adeptus-mechanicus'),
  ('Aeldari', 'aeldari'),
  ('Astra Militarum', 'astra-militarum'),
  ('Blood Angels', 'blood-angels'),
  ('Black Templars', 'black-templars'),
  ('Chaos Daemons', 'chaos-daemons'),
  ('Chaos Knights', 'chaos-knights'),
  ('Chaos Space Marines', 'chaos-space-marines'),
  ('Dark Angels', 'dark-angels'),
  ('Death Guard', 'death-guard'),
  ('Deathwatch', 'deathwatch'),
  ('Drukhari', 'drukhari'),
  ('Grey Knights', 'grey-knights'),
  ('Imperial Agents', 'imperial-agents'),
  ('Imperial Knights', 'imperial-knights'),
  ('Leagues of Votann', 'leagues-of-votann'),
  ('Necrons', 'necrons'),
  ('Orks', 'orks'),
  ('Space Marines', 'space-marines'),
  ('Space Wolves', 'space-wolves'),
  ('Thousand Sons', 'thousand-sons'),
  ('Tyranids', 'tyranids'),
  ('World Eaters', 'world-eaters'),
  ("Emperor's Children", 'emperors-children'),
  ('Genestealer Cults', 'genestealer-cults'),
  ("T'au Empire", 'tau-empire');

-- BCP variant names
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Space Marines (Astartes)', 'space-marines'),
  ('Genestealer Cult', 'genestealer-cults'),
  ('Forces of the Hive Mind', 'tyranids'),
  ('Hive Fleet Kronos', 'tyranids'),
  ('Hive Fleet Hyrda', 'tyranids');

-- Space Marine chapters → space-marines
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Ultramarines', 'space-marines'),
  ('Salamanders', 'space-marines'),
  ('Imperial Fists', 'space-marines'),
  ('Iron Hands', 'space-marines'),
  ('Raven Guard', 'space-marines'),
  ('White Scars', 'space-marines'),
  ('Crimson Fists', 'space-marines'),
  ('Carcharadons', 'space-marines');

-- Blood Angels successors
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Flesh Tearers', 'blood-angels');

-- Dark Angels wings
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Deathwing', 'dark-angels');

-- CSM warbands → chaos-space-marines
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Alpha Legion', 'chaos-space-marines'),
  ('Night Lords', 'chaos-space-marines'),
  ('Iron Warriors', 'chaos-space-marines'),
  ('Word Bearers', 'chaos-space-marines'),
  ('Red Corsairs', 'chaos-space-marines'),
  ('Black Legion', 'chaos-space-marines'),
  ('Chaos', 'chaos-space-marines');

-- Drukhari kabals
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Kabal of the Flayed Skull', 'drukhari');

-- Ork clans
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Blood Axe', 'orks'),
  ('Freebooterz', 'orks'),
  ('Goffs', 'orks');

-- T'au septs
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ("T'au Sept", 'tau-empire'),
  ('Farsight Enclaves', 'tau-empire');

-- Necron dynasties
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Sautekh', 'necrons'),
  ('Nihilakh', 'necrons');

-- Leagues of Votann leagues
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Ymyr Conglomerate', 'leagues-of-votann');

-- Chaos Daemons god-specific
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Nurgle Daemons', 'chaos-daemons'),
  ('Slaanesh Daemons', 'chaos-daemons'),
  ('Slaanesh', 'chaos-daemons');

-- Astra Militarum regiments
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Cadian Shock Troops', 'astra-militarum'),
  ('Catachan Jungle Fighters', 'astra-militarum');

-- Generic allegiance aliases
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('Imperium', 'imperial-agents'),
  ('Xenos', 'aeldari');

-- Wahapedia short codes
INSERT OR IGNORE INTO dim_faction_alias (alias, faction_id) VALUES
  ('AS', 'adepta-sororitas'),
  ('AC', 'adeptus-custodes'),
  ('AdM', 'adeptus-mechanicus'),
  ('AE', 'aeldari'),
  ('AM', 'astra-militarum'),
  ('BA', 'blood-angels'),
  ('BT', 'black-templars'),
  ('CD', 'chaos-daemons'),
  ('CK', 'chaos-knights'),
  ('CSM', 'chaos-space-marines'),
  ('DA', 'dark-angels'),
  ('DG', 'death-guard'),
  ('DW', 'deathwatch'),
  ('DK', 'drukhari'),
  ('EC', 'emperors-children'),
  ('GSC', 'genestealer-cults'),
  ('GK', 'grey-knights'),
  ('IA', 'imperial-agents'),
  ('IK', 'imperial-knights'),
  ('LoV', 'leagues-of-votann'),
  ('NEC', 'necrons'),
  ('ORK', 'orks'),
  ('SM', 'space-marines'),
  ('SW', 'space-wolves'),
  ('TAU', 'tau-empire'),
  ('TS', 'thousand-sons'),
  ('TYR', 'tyranids'),
  ('WE', 'world-eaters');
