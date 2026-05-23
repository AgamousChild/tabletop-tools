# apps/brain/client/src/components/cards/ — Card Components

> 18 typed card components for rendering 40K knowledge graph nodes.

## types.ts
Central type hub. CardData discriminated union of 14 card types. CardContext provides callbacks (term search, dismiss, source viewing, node navigation). All cards optionally carry errata entries and quality flags.

## Card Components

### RuleCard — army rules, faction rules, detachment abilities
Colored border (faction=red, army=amber, detachment=blue). Markdown description with clickable [KEYWORD] tokens. Sub-rules in collapsible boxes. Footer: "Applies to N datasheets" link + PDF source.

### StratagemCard — stratagems with CP cost
Left blue sidebar with rotated amber diamond showing CP cost. Oswald font name. WHEN/TARGET/EFFECT sections with keyword highlighting.

### EnhancementCard — enhancements/relics with cost
Purple underline. Cost + restriction + description with highlight support.

### DetachmentCard — full detachment with nested children
Blue underline. Ability markdown + embedded StratagemCard/EnhancementCard in collapsible sections.

### CoreRuleCard — core rules with phase badge
Amber underline. Markdown + optional HTML table. Phase badge. PDF source links.

### UnitCard — complex multi-section datasheet
Blue gradient header with name/points/type. Stat line bar (M/T/SV/W/LD/OC/INV/FNP). Two-column: ranged/melee weapon tables + core/custom abilities. USR abilities collapsed. Keywords bar with keyword stratagems on hover. Composition/loadout/wargear/leaders footer.

### MissionCard — primary/secondary objectives
Amber (primary) or blue (secondary) border. Structured scoring fields with VP arrows. PDF page links.

### BalanceCard — balance updates
Red underline. Highlight matching search terms. Effective date footer.

### ChallengerCard — challenger missions
Orange header with CHALLENGER badge. Extracts WHEN/TARGET/EFFECT sections via regex. Paired stratagem.

### CommunityCard — community-contributed content
Cyan underline. Markdown with source attribution.

### ErrataCard — errata/clarifications
Orange underline. "Clarifies: [rule name]" clickable link. Source + effective date.

### ErrataSection — collapsible errata container
Embedded in other cards. Count badge. Title + truncated content per entry.

### TwistCard — mission twists
Green header with TWIST badge. Markdown + errata + PDF links.

### DeploymentZoneCard — deployment zone diagrams
Green underline. Battle size badge. Multi-page PDF images with tabs. Fallback to text.

### ComboView — side-by-side card comparison
Two cards left/right with red arrow + label. Dispatches to renderCard() switching on card.type.

### TerrainLayoutCard — terrain setup diagrams
Green underline. PDF page image with loading/error states. Markdown fallback.

### PdfPageView — full-screen PDF page modal
Fixed z-50 modal. Image with optional highlight box overlay (amber region at topPct/heightPct). Errata section below.
