interface Env {
  TOURNAMENT_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/tournament/, '')
  return context.env.TOURNAMENT_API.fetch(new Request(url.toString(), context.request))
}
