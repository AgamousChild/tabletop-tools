interface Env {
  ADMIN_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/admin/, '')
  try {
    return await context.env.ADMIN_API.fetch(
      new Request(url.toString(), context.request),
    )
  } catch {
    return new Response(
      JSON.stringify({ error: { message: 'Service unavailable' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
