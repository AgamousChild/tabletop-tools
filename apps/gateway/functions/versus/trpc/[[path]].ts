interface Env {
  VERSUS_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/versus/, '')
  return context.env.VERSUS_API.fetch(new Request(url.toString(), context.request))
}
