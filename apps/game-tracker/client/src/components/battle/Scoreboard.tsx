type Props = {
  roundNumber: number
  yourVp: number
  theirVp: number
  yourCp: number
  theirCp: number
  opponentName: string
}

export function Scoreboard({ roundNumber, yourVp, theirVp, yourCp, theirCp, opponentName }: Props) {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 uppercase">Round {roundNumber} of 5</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <p className="text-xs text-slate-400">You</p>
          <p className="text-2xl font-bold text-amber-400">{yourVp}</p>
          <p className="text-xs text-slate-500">{yourCp} CP</p>
        </div>
        <div className="text-center px-4">
          <p className="text-sm text-slate-500">VP</p>
          <p className="text-slate-600 font-bold">vs</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-xs text-slate-400">{opponentName}</p>
          <p className="text-2xl font-bold text-slate-300">{theirVp}</p>
          <p className="text-xs text-slate-500">{theirCp} CP</p>
        </div>
      </div>
    </div>
  )
}
