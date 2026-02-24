interface Env {
  NEW_META_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/new-meta/, '')
  return context.env.NEW_META_API.fetch(new Request(url.toString(), context.request))
}
