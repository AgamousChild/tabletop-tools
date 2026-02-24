interface Env {
  ADMIN_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/admin/, '')
  return context.env.ADMIN_API.fetch(new Request(url.toString(), context.request))
}
