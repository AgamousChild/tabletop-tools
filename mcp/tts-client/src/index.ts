#!/usr/bin/env node
/**
 * TTS MCP Server — provides Claude Code with read access to Tabletop Simulator.
 *
 * Tools:
 *   tts_ping — check if TTS is running and reachable
 *   tts_get_objects — list all objects on the table
 *   tts_get_object — get details of a specific object by GUID
 *   tts_get_scripts — get all Lua scripts in the current game
 *   tts_execute_lua — execute Lua code (read-only by default)
 *   tts_get_game_state — get a summary of the current game state
 *
 * Connects to TTS via the External Editor API (localhost:39999/39998).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TTSConnection } from './connection'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const conn = new TTSConnection()

// ── Lua scripts for querying game state (read-only) ─────────────────────────

const LUA_GET_ALL_OBJECTS = `
local results = {}
for _, obj in ipairs(getAllObjects()) do
  table.insert(results, {
    guid = obj.getGUID(),
    name = obj.getName(),
    nickname = obj.getName(),
    type = obj.type,
    description = obj.getDescription():sub(1, 100),
    position = obj.getPosition(),
    rotation = obj.getRotation(),
    locked = obj.getLock(),
    tags = obj.getTags(),
  })
end
return JSON.encode(results)
`

const LUA_GET_OBJECT = `
local guid = '%GUID%'
local obj = getObjectFromGUID(guid)
if obj == nil then
  return JSON.encode({error = "Object not found: " .. guid})
end
local data = {
  guid = obj.getGUID(),
  name = obj.getName(),
  type = obj.type,
  description = obj.getDescription(),
  position = obj.getPosition(),
  rotation = obj.getRotation(),
  scale = obj.getScale(),
  locked = obj.getLock(),
  tags = obj.getTags(),
  colorTint = obj.getColorTint(),
  value = obj.getValue(),
  quantity = obj.getQuantity(),
  bounds = obj.getBoundsNormalized(),
}
-- If it's a container, list contents
if obj.type == 'Bag' or obj.type == 'Deck' or obj.type == 'Infinite' then
  local contents = {}
  for _, item in ipairs(obj.getObjects()) do
    table.insert(contents, {
      guid = item.guid,
      name = item.name or item.nickname or 'unnamed',
      description = (item.description or ''):sub(1, 80),
      index = item.index,
    })
  end
  data.contents = contents
  data.contentCount = #contents
end
return JSON.encode(data)
`

const LUA_GET_GAME_STATE = `
local state = {
  objectCount = #getAllObjects(),
  players = {},
  turnInfo = {
    currentPlayer = Turns.turn_color or 'none',
    roundNumber = Turns.round_num or 0,
  },
  objects = {
    bags = 0,
    decks = 0,
    tiles = 0,
    figurines = 0,
    dice = 0,
    tokens = 0,
    other = 0,
  },
}

-- Count object types
for _, obj in ipairs(getAllObjects()) do
  local t = obj.type
  if t == 'Bag' or t == 'Infinite' then state.objects.bags = state.objects.bags + 1
  elseif t == 'Deck' or t == 'DeckCustom' then state.objects.decks = state.objects.decks + 1
  elseif t == 'Custom_Tile' or t == 'Tile' then state.objects.tiles = state.objects.tiles + 1
  elseif t == 'Figurine' or t == 'Figurine_Custom' then state.objects.figurines = state.objects.figurines + 1
  elseif t == 'Die_Custom' or t == 'Die_4' or t == 'Die_6' or t == 'Die_8' or t == 'Die_10' or t == 'Die_12' or t == 'Die_20' then state.objects.dice = state.objects.dice + 1
  elseif t == 'Chip' or t == 'Custom_Token' then state.objects.tokens = state.objects.tokens + 1
  else state.objects.other = state.objects.other + 1
  end
end

-- Player info
for _, player in ipairs(Player.getPlayers()) do
  table.insert(state.players, {
    color = player.color,
    steam_name = player.steam_name,
    team = player.team or 'none',
    seated = player.seated,
  })
end

return JSON.encode(state)
`

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'tts',
  version: '1.0.0',
})

server.tool(
  'tts_ping',
  'Check if Tabletop Simulator is running and reachable.',
  {},
  async () => {
    const ok = await conn.ping()
    return {
      content: [{
        type: 'text' as const,
        text: ok
          ? 'TTS is running and reachable on localhost:39999'
          : 'TTS is not reachable. Make sure TTS is running with a game loaded.',
      }],
    }
  },
)

server.tool(
  'tts_get_objects',
  'List all objects currently on the TTS table. Returns GUID, name, type, position for each object.',
  {
    filter: z.string().optional().describe('Optional type filter (e.g., "Figurine", "Bag", "Custom_Tile")'),
  },
  async ({ filter }) => {
    await conn.ensureListening()
    try {
      const result = await conn.executeLua(LUA_GET_ALL_OBJECTS)
      let objects = JSON.parse(result as string) as Array<{
        guid: string; name: string; type: string; position: { x: number; y: number; z: number }
      }>

      if (filter) {
        objects = objects.filter(o => o.type.toLowerCase().includes(filter.toLowerCase()) || o.name.toLowerCase().includes(filter.toLowerCase()))
      }

      const summary = objects.map(o =>
        `${o.guid} | ${o.type} | ${o.name || '(unnamed)'} | pos: (${o.position.x.toFixed(1)}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)})`
      ).join('\n')

      return { content: [{ type: 'text' as const, text: `${objects.length} objects:\n\n${summary}` }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  },
)

server.tool(
  'tts_get_object',
  'Get detailed information about a specific object by its GUID.',
  {
    guid: z.string().describe('The GUID of the object to inspect'),
  },
  async ({ guid }) => {
    await conn.ensureListening()
    try {
      const script = LUA_GET_OBJECT.replace('%GUID%', guid)
      const result = await conn.executeLua(script)
      const data = JSON.parse(result as string)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  },
)

server.tool(
  'tts_get_scripts',
  'Get all Lua scripts and UI XML from the current TTS game.',
  {},
  async () => {
    await conn.ensureListening()
    try {
      // MessageID 0 requests all scripts — TTS responds with messageID 1
      const result = await new Promise<string>(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for scripts')), 60000)

        conn.once('gameLoad', (msg) => {
          clearTimeout(timer)
          const scripts = msg.scriptStates || []
          const summary = scripts.map((s: { name: string; guid: string; script: string }) =>
            `${s.guid} | ${s.name} | ${s.script.length} chars`
          ).join('\n')
          resolve(`${scripts.length} scripts:\n\n${summary}`)
        })

        await conn.send({ messageID: 0 })
      })

      return { content: [{ type: 'text' as const, text: result }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  },
)

server.tool(
  'tts_execute_lua',
  'Execute Lua code in TTS. The code runs in the Global script context by default. Use `return` to get a value back.',
  {
    script: z.string().describe('Lua code to execute. Must use `return` to send a value back.'),
    guid: z.string().optional().default('-1').describe('Object GUID to execute on ("-1" for Global, default)'),
  },
  async ({ script, guid }) => {
    await conn.ensureListening()
    try {
      const result = await conn.executeLua(script, guid)
      if (result === undefined || result === null) {
        return { content: [{ type: 'text' as const, text: '(no return value — use `return` in your Lua code to get output)' }] }
      }
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      return { content: [{ type: 'text' as const, text }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  },
)

server.tool(
  'tts_get_game_state',
  'Get a summary of the current game state — object counts by type, player info, turn state.',
  {},
  async () => {
    await conn.ensureListening()
    try {
      const result = await conn.executeLua(LUA_GET_GAME_STATE)
      const state = JSON.parse(result as string)
      const lines = [
        `## Game State`,
        `**Objects on table:** ${state.objectCount}`,
        `- Bags: ${state.objects.bags}`,
        `- Decks: ${state.objects.decks}`,
        `- Tiles: ${state.objects.tiles}`,
        `- Figurines: ${state.objects.figurines}`,
        `- Dice: ${state.objects.dice}`,
        `- Tokens: ${state.objects.tokens}`,
        `- Other: ${state.objects.other}`,
        '',
        `**Players:** ${state.players.length}`,
        ...state.players.map((p: any) => `- ${p.steam_name} (${p.color})${p.seated ? '' : ' — not seated'}`),
        '',
        `**Turn:** ${state.turnInfo.currentPlayer} (round ${state.turnInfo.roundNumber})`,
      ]
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
    }
  },
)

server.tool(
  'tts_screenshot',
  'Take a screenshot of the current TTS view. Simulates PrintScreen and returns the image.',
  {},
  async () => {
    const screenshotDir = path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      'OneDrive', 'Desktop'
    )

    // Get files before screenshot
    const before = new Set(fs.existsSync(screenshotDir) ? fs.readdirSync(screenshotDir) : [])

    // Simulate PrintScreen keypress
    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{PRTSC}')"`)

    // Wait for TTS to write the file
    let newFile: string | null = null
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (fs.existsSync(screenshotDir)) {
        const after = fs.readdirSync(screenshotDir)
        const added = after.find(f => !before.has(f))
        if (added) {
          newFile = path.join(screenshotDir, added)
          break
        }
      }
    }

    if (!newFile) {
      return { content: [{ type: 'text' as const, text: 'Timeout — no new screenshot detected. Make sure TTS is focused.' }] }
    }

    const imageData = fs.readFileSync(newFile)
    const base64 = imageData.toString('base64')
    const ext = path.extname(newFile).toLowerCase()
    const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'

    return {
      content: [
        { type: 'image' as const, data: base64, mimeType },
        { type: 'text' as const, text: `Screenshot saved: ${newFile}` },
      ],
    }
  },
)

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  // Log TTS events
  conn.on('print', (msg) => console.error(`[TTS print] ${msg.message}`))
  conn.on('error', (msg) => {
    if (msg && typeof msg === 'object' && 'error' in msg) {
      console.error(`[TTS error] ${(msg as any).error}`)
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('TTS MCP server running — connect to TTS by loading a game')
}

main().catch(console.error)
