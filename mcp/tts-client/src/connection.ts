/**
 * TTS External Editor API connection.
 *
 * Architecture:
 * - We SEND messages to TTS on port 39999 (TCP)
 * - TTS SENDS messages back to us on port 39998 (TCP)
 * - Both are localhost-only JSON over TCP
 *
 * Message format: raw JSON string terminated by... nothing specific.
 * TTS sends one JSON object per connection in some cases,
 * or keeps the connection open for the listener.
 */

import { createConnection, createServer, type Server, type Socket } from 'net'
import { EventEmitter } from 'events'

const TTS_SEND_PORT = 39999   // We send TO TTS on this port
const TTS_LISTEN_PORT = 39998 // TTS sends TO US on this port

// ── Message types we send to TTS ────────────────────────────────────────────

export interface GetScriptsMessage {
  messageID: 0
}

export interface SaveAndPlayMessage {
  messageID: 1
  scriptStates: Array<{
    name: string
    guid: string
    script: string
    ui: string
  }>
}

export interface CustomMessage {
  messageID: 2
  customMessage: unknown
}

export interface ExecuteLuaMessage {
  messageID: 3
  guid: string      // "-1" for Global
  script: string    // Lua code to execute
  returnID: number  // Required — TTS uses this to route the return value
}

export type OutboundMessage = GetScriptsMessage | SaveAndPlayMessage | CustomMessage | ExecuteLuaMessage

// ── Message types TTS sends to us ───────────────────────────────────────────

export interface TTSNewObjectMessage {
  messageID: 0
  scriptStates: Array<{ name: string; guid: string; script: string; ui: string }>
}

export interface TTSGameLoadMessage {
  messageID: 1
  scriptStates: Array<{ name: string; guid: string; script: string; ui: string }>
  savePath?: string
}

export interface TTSPrintMessage {
  messageID: 2
  message: string
}

export interface TTSErrorMessage {
  messageID: 3
  error: string
  guid: string
  errorMessagePrefix: string
}

export interface TTSCustomMessage {
  messageID: 4
  customMessage: unknown
}

export interface TTSReturnMessage {
  messageID: 5
  returnValue: unknown
  returnID?: string
}

export interface TTSGameSavedMessage {
  messageID: 6
}

export interface TTSObjectCreatedMessage {
  messageID: 7
  guid: string
}

export type InboundMessage =
  | TTSNewObjectMessage
  | TTSGameLoadMessage
  | TTSPrintMessage
  | TTSErrorMessage
  | TTSCustomMessage
  | TTSReturnMessage
  | TTSGameSavedMessage
  | TTSObjectCreatedMessage

// ── Connection manager ──────────────────────────────────────────────────────

export class TTSConnection extends EventEmitter {
  private listener: Server | null = null
  private returnIdCounter = 0

  /** Start listening for messages from TTS on port 39998. */
  async startListening(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.listener = createServer((socket: Socket) => {
        // TTS opens a new connection per message.
        // Accumulate chunks and try to parse as JSON.
        // Parse on 'end' (connection closed) OR when accumulated data
        // forms valid JSON (in case TTS keeps the connection open).
        const chunks: Buffer[] = []
        let handled = false

        const tryParse = () => {
          if (handled) return
          const raw = Buffer.concat(chunks).toString('utf-8')
          if (!raw.trim()) return
          try {
            const msg = JSON.parse(raw) as InboundMessage
            handled = true
            this.handleMessage(msg)
          } catch {
            // Not valid JSON yet — wait for more data or 'end'
          }
        }

        socket.on('data', (data: Buffer) => {
          chunks.push(data)
          tryParse()
        })

        socket.on('end', () => {
          if (!handled) {
            const raw = Buffer.concat(chunks).toString('utf-8')
            try {
              const msg = JSON.parse(raw) as InboundMessage
              this.handleMessage(msg)
            } catch (e) {
              this.emit('parseError', e, raw)
            }
          }
        })

        socket.on('error', (err) => {
          this.emit('error', err)
        })
      })

      this.listener.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${TTS_LISTEN_PORT} already in use — is another editor connected to TTS?`))
        } else {
          reject(err)
        }
      })

      this.listener.listen(TTS_LISTEN_PORT, '127.0.0.1', () => {
        resolve()
      })
    })
  }

  /** Send a message to TTS on port 39999. */
  async send(message: OutboundMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ port: TTS_SEND_PORT, host: '127.0.0.1' }, () => {
        socket.write(JSON.stringify(message), () => {
          socket.end()
          resolve()
        })
      })

      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new Error('TTS is not running or no game is loaded. Start TTS and load a save first.'))
        } else {
          reject(err)
        }
      })

      socket.setTimeout(5000, () => {
        socket.destroy()
        reject(new Error('Connection to TTS timed out'))
      })
    })
  }

  /** Execute Lua code in TTS and wait for the return value. */
  async executeLua(script: string, guid: string = '-1', timeoutMs: number = 60000): Promise<unknown> {
    await this.ensureListening()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener('return', onReturn)
        reject(new Error(`Lua execution timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const onReturn = (msg: TTSReturnMessage) => {
        clearTimeout(timer)
        resolve(msg.returnValue)
      }

      // Listen for the next return message
      this.once('return', onReturn)

      this.send({
        messageID: 3,
        guid,
        script,
        returnID: this.returnIdCounter++,
      }).catch((err) => {
        clearTimeout(timer)
        this.removeListener('return', onReturn)
        reject(err)
      })
    })
  }

  /** Stop listening and clean up. */
  close(): void {
    if (this.listener) {
      this.listener.close()
      this.listener = null
    }
  }

  /** Check if TTS is reachable by attempting a TCP connection. */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ port: TTS_SEND_PORT, host: '127.0.0.1' }, () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => {
        resolve(false)
      })
      socket.setTimeout(3000, () => {
        socket.destroy()
        resolve(false)
      })
    })
  }

  /** Ensure the listener is started. */
  async ensureListening(): Promise<void> {
    if (this.listener) return
    await this.startListening()
  }

  private handleMessage(msg: InboundMessage): void {
    console.error(`[TTS inbound] messageID=${msg.messageID} keys=${Object.keys(msg).join(',')}`)
    switch (msg.messageID) {
      case 0: this.emit('newObject', msg); break
      case 1: this.emit('gameLoad', msg); break
      case 2: this.emit('print', msg); break
      case 3: this.emit('error', msg); break
      case 4: this.emit('customMessage', msg); break
      case 5: this.emit('return', msg); break
      case 6: this.emit('gameSaved', msg); break
      case 7: this.emit('objectCreated', msg); break
      default: this.emit('unknown', msg); break
    }
  }
}
