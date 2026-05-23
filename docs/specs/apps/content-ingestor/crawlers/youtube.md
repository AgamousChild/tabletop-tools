# apps/content-ingestor/src/crawlers/youtube.ts

> List videos from YouTube channels/playlists using yt-dlp subprocess.

## Prompt

Export `listChannelVideos(channelUrl: string, ytdlpPath: string): Promise<Array<{ url, title }>>`.

Spawns yt-dlp with `--flat-playlist --print "%(webpage_url)s|||%(title)s"` flags to extract video URLs and titles without downloading. Parses delimiter-separated output (`|||`) into objects. Handles large buffer sizes for long playlists (`maxBuffer: 50 * 1024 * 1024`).

## Dependencies

- `child_process` — `execFile` (promisified)
