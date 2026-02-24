interface Env {
  GAME_TRACKER_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/game-tracker/, '')
  return context.env.GAME_TRACKER_API.fetch(new Request(url.toString(), context.request))
}
