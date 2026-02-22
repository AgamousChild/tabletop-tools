/**
 * GameContentDisclaimer
 *
 * Required in the layout of any app that renders GW-sourced content
 * (unit profiles, weapon stats, faction data, etc.).
 */
export function GameContentDisclaimer() {
  return (
    <p className="text-xs text-slate-400 leading-relaxed">
      Unit data sourced from{' '}
      <a
        href="https://github.com/BSData"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-slate-300"
      >
        BSData
      </a>
      , maintained by the community. Warhammer 40,000 is copyright Games Workshop
      Limited. This tool is not affiliated with or endorsed by Games Workshop.
    </p>
  )
}
