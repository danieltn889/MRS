// pm2 process manager config   keeps all services running and restarts them on deploy.
// Used by deploy.sh: `pm2 startOrReload ecosystem.config.js`.
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: './source-code/backend',
      script: 'npx',
      args: 'tsx src/server.ts',
      env: { NODE_ENV: 'production'},
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'ml-gateway',
      cwd: './source-code/ml',
      // Uses the venv created by deploy.sh; the gateway boots all ML services
      // (including the merged hybrid+matcher recommender on 8003) and
      // exposes the gateway on 8085.
      script: './.venv/bin/python',
      args: 'gateway.py',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'frontend',
      cwd: './source-code/frontend',
      // Serves the built dist/ on port 3000. (For production scale, prefer nginx
      // serving dist/ directly   see DEPLOYMENT.md.)
      script: 'npx',
      args: 'vite preview --host --port 3000',
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
