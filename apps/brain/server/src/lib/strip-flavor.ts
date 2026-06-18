export function stripFlavorText(text: string): string {
  return text
    .replace(/\*[^*]{20,}\*/g, '')
    .split('\n')
    .filter((line) => {
      const l = line.trim()
      if (!l) return false
      if (
        /\*\*(WHEN|TARGET|EFFECT|Type|CP|Turn|Phase|Cost|Range|Role|Keywords|Composition|Points|Transport|Loadout|Damaged):/i.test(
          l,
        )
      )
        return true
      if (
        /\[SUSTAINED|LETHAL|DEVASTATING|HAZARDOUS|BLAST|TORRENT|MELTA|LANCE|ANTI-|IGNORES|INDIRECT|TWIN|RAPID|PISTOL|HEAVY|ASSAULT|ONE SHOT/i.test(
          l,
        )
      )
        return true
      if (
        /\d\+|D\d|re-roll|wound|hit|save|attack|model|unit|phase|turn|Engagement Range|Battle-shock/i.test(
          l,
        )
      )
        return true
      if (/Detachment Ability:|Ability:|Enhancement:/i.test(l)) return true
      if (l.length > 80 && !/\d/.test(l) && !/\[/.test(l)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n')
    .trim()
}
