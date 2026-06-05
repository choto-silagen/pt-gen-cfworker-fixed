module.exports = {
  apps: [
    {
      name: "pt-gen-cfworker-fixed",
      script: "dist/server.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
