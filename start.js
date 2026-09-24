module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        // 127.0.0.1: this computer only, and an address the pattern below can read (Vite says
        // "localhost" otherwise). No port: Vite takes 5173, or the next free one if something
        // else holds it, so whenever 5173 is free the address is the same from one start to the
        // next, and the browser keeps a runner's plan and key under the address it was saved at.
        // Pinokio's own pick starts at 42003 and moves with whatever else Pinokio is running.
        message: [
          "npm run dev -- --host 127.0.0.1",
        ],
        on: [{
          event: "/(http:\\/\\/[0-9.:]+)/",
          done: true
        }]
      }
    },
    {
      // Sets the local variable 'url', which pinokio.js turns into "Open GeoPace".
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
}
