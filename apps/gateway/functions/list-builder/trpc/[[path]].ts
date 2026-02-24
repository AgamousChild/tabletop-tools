interface Env {
  LIST_BUILDER_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/list-builder/, '')
  return context.env.LIST_BUILDER_API.fetch(new Request(url.toString(), context.request))
}
