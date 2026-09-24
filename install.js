module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        // Exactly the packages the lockfile names, nothing newer.
        message: [
          "npm ci",
        ],
        // A failed install says "npm error" (older npm: "npm ERR!") and never "error:", which is all
        // Pinokio stops on by itself: without this, a failed install would look finished.
        on: [{
          event: "/npm (error|ERR!)/",
          break: true
        }]
      }
    }
  ]
}
