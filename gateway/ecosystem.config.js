module.exports = {
  apps: [{
    name: 'agentx-gateway',
    script: 'dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3090,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
  }],
}
