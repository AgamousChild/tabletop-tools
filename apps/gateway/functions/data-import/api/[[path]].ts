interface Env {
  DATA_IMPORT_API: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  url.pathname = url.pathname.replace(/^\/data-import\/api/, '')
  try {
    return await context.env.DATA_IMPORT_API.fetch(
      new Request(url.toString(), context.request),
    )
  } catch {
    return new Response(
      JSON.stringify({ error: { message: 'Service unavailable' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
