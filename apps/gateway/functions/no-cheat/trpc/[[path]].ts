interface Env {
  NO_CHEAT_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/no-cheat/, '')
  try {
    return await context.env.NO_CHEAT_API.fetch(
      new Request(url.toString(), context.request),
    )
  } catch {
    return new Response(
      JSON.stringify({ error: { message: 'Service unavailable' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
