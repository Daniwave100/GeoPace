module.exports = {
  run: [{
    method: "shell.run",
    params: {
      message: "git pull",
      // git says "fatal:" when it cannot pull (no connection, or a history that no longer lines up);
      // stop there rather than reinstall the old version and look updated.
      on: [{
        event: "/fatal:/",
        break: true
      }]
    }
  }, {
    method: "shell.run",
    params: {
      path: "app",
      message: "npm ci",
      // See install.js.
      on: [{
        event: "/npm (error|ERR!)/",
        break: true
      }]
    }
  }]
}
