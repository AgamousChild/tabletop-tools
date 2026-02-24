interface Env {
  NO_CHEAT_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/no-cheat/, '')
  return context.env.NO_CHEAT_API.fetch(new Request(url.toString(), context.request))
}
