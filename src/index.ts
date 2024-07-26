import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Server, Socket } from "socket.io"
import * as TRLG from "./lib/trlg/exports"
import UpstashRedisAdapter from './lib/trlg/storage-adapters/upstash-redis'
import { EventType } from './lib/trlg/machine'

const app = new Hono()

app.use("*", cors({
  origin: ["https://newsniper.org", "https://debconf24-bof-trlg.vercel.app/", "https://debconf24-bof.newsniper.org","http://localhost:4321"],
  allowMethods: ["GET", "POST"],
  allowHeaders: ["Content-Type", "Authorization"]
}))

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

const trlgClientsInfo: {[id: string]: TRLG.ClientInfoEntry} = {}

const storagePool: {
  [gameId: string]: TRLG.AsyncActorStorage<UpstashRedisAdapter>
} = {}

function getGameContext(gameId: string) {
  let st: string, gc: TRLG.SerializedGameContext, npa: string
  if(storagePool[gameId] !== undefined) {
    const serialized = storagePool[gameId].serializedGameContext
    st = serialized.state
    gc = serialized.gameContext
    npa = serialized.nowPlayerAccount
  } else {
    return null
  }
  return {st,gc,npa}
}

async function onCommand(gameId: string, event: EventType, socket: Socket) {
  if(storagePool[gameId] !== undefined) {
    await storagePool[gameId].trigger(event)
    io.of("/trlg").to(`${gameId}`).emit("refresh", storagePool[gameId].serializedGameContext)
  }
}

function attachGrantedSocket(socket: Socket) {
  const clientInfo = trlgClientsInfo[socket.id]
  if(clientInfo === undefined) {
    return
  }
  const {gameId} = clientInfo

  socket.on("pickTargetGroup", async ({targetGroup}: {targetGroup: TRLG.CityGroupType}) => {
    await onCommand(gameId,{type: "pickTargetGroup", targetGroup: targetGroup},socket)
  })

  socket.on("pickTargetLocation", async ({targetLocation}: {targetLocation: number}) => {
    await onCommand(gameId,{type: "pickTargetLocation", targetLocation} ,socket)
  })

  socket.on("thanksToLawyer", async () => {
    await onCommand(gameId,{type: "thanksToLawyer"} ,socket)
  })

  socket.on("showMeTheMONEY", async () => {
    await onCommand(gameId,{type: "showMeTheMONEY"} ,socket)
  })

  socket.on("rollDice", async () => {
    await onCommand(gameId,{type: "rollDice"} ,socket)
  })

  socket.on("tryLotto", async ({choice}: {choice: TRLG.LottoChoiceType}) => {
    await onCommand(gameId,{type: "tryLotto", choice} ,socket)
  })

  socket.on("stopLotto", async () => {
    await onCommand(gameId,{type: "stopLotto"} ,socket)
  })

  socket.on("sell", async ({targets}: {targets: {location: number, amount: number}[]}) => {
    await onCommand(gameId,{type: "sell", targets} ,socket)
  })

  socket.on("startlotto", async ({useDoubleLottoTicket}: {useDoubleLottoTicket: boolean}) => {
    await onCommand(gameId,{type: "startLotto", useDoubleLottoTicket} ,socket)
  })

  socket.on("nop", async () => {
    await onCommand(gameId,{type: "nop"} ,socket)
  })

  socket.on("purchase", async ({amount}: {amount: number}) => {
    await onCommand(gameId,{type: "purchase", value: {amount}} ,socket)
  })

  socket.on("pickTargetPlayer", async () => {
    await onCommand(gameId,{type: "pickTargetPlayer"} ,socket)
  })

  socket.on("useTicket", async () => {
    await onCommand(gameId,{type: "useTicket"} ,socket)
  })

  socket.on("noticeChecked", async () => {
    await onCommand(gameId,{type: "noticeChecked"} ,socket)
  })
}

function onTRLGConnection(socket: Socket) {
  console.log(`${socket.id} is connected.`)
  socket.on("joinRoom", ({gameId}: {gameId: string}) => {
    if(gameId in storagePool && storagePool[gameId].jsonLoaded) {
      socket.emit("joinSucceed")
    } else {
      socket.emit("joinFailed", {msg: `room ${gameId} not found :(`})
      return
    }
    socket.join(`${gameId}`)
    trlgClientsInfo[socket.id] = { account: null, gameId, grant: null }
    console.log(`socket ${socket.id} has connected to ${gameId}`)
  })

  socket.on("requestRefresh", async ({gameId}: {gameId: string}) => {
    const context = await getGameContext(gameId)
    if(context !== null) {
      socket.emit("refresh", {state: context.st, gameContext: context.gc, nowPlayerAccount: context.npa})
    }
  })

  socket.on("grant", ({gameId, account}: {gameId: string, account: string}) => {
    const tmp = storagePool[gameId].findPid(account)
    if(tmp === null) {
      socket.emit("playNotGranted")
    } else {
      trlgClientsInfo[socket.id].grant = tmp
      attachGrantedSocket(socket)
      socket.emit("playGranted", {pid: tmp})
    }
  })
}

const port = 11000

const server = serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server is running: ${info.address}:${info.port}`)
})

const io = new Server(server,{
  cors: {
    origin: ["https://newsniper.org", "https://debconf24-bof-trlg.vercel.app/", "https://debconf24-bof.newsniper.org","http://localhost:4321"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }
})

io.of("/trlg").on("connection", onTRLGConnection)